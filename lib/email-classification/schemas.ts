import { z } from "zod";

export const CATEGORIES = [
  "BL_COMPARISON",
  "SI_REQUEST",
  "INVOICE_QUERY",
  "GENERAL",
  "SPAM",
] as const;

export const STATUSES = ["OK", "MISMATCH", "NEEDS_REVIEW"] as const;

export const REVIEW_REASONS = [
  "wrong_doc_type",
  "missing_attachment",
  "unreadable",
  "missing_value",
] as const;

export const COMPARED_FIELDS = [
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
] as const;

// ---- API request ----

export const emailInputSchema = z.object({
  email_id: z.string(),
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z
    .array(
      z.object({
        attachment_name: z.string(),
        attachment_content: z.string(),
      }),
    )
    .default([]),
});

// What the classifier sends to the LLM. An attachment whose text couldn't be
// obtained has `attachment_content: null` and a `note` saying why (not
// provided, no text layer, parse error), so the model can judge it.
export type ClassifierAttachment = {
  attachment_name: string;
  attachment_content: string | null;
  note?: string;
  // The text came from OCR rather than a text layer. Sent to the model, which
  // must not repair misread characters in such a document, and used by
  // `classifyEmail` to distrust a MISMATCH built on it.
  used_ocr?: boolean;
};

export type ClassifierInput = {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  attachments: ClassifierAttachment[];
};

// ---- Inbox upload (Phase 2) ----

// An email JSON from the uploaded inbox folder: attachments are filenames.
export const inboxEmailSchema = z.object({
  email_id: z.string(),
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.string()).default([]),
});

export type InboxEmail = z.infer<typeof inboxEmailSchema>;

// ---- LLM tool arguments ----

const categoryResultSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .describe("Independent confidence (0-1) that this category applies."),
  status: z
    .enum(STATUSES)
    .optional()
    .describe(
      "BL_COMPARISON only. OK if all 7 fields match, MISMATCH if at least one differs, NEEDS_REVIEW if the comparison cannot be made.",
    ),
  review_reason: z
    .enum(REVIEW_REASONS)
    .optional()
    .describe("BL_COMPARISON only, and only when status is NEEDS_REVIEW."),
  defect_fields: z
    .array(z.enum(COMPARED_FIELDS))
    .optional()
    .describe(
      "BL_COMPARISON only, and only when status is MISMATCH: the fields whose SI and BL values differ.",
    ),
  // Compared in code: two long weights differing in one digit read as equal to a model.
  si_gross_weight_kg: z
    .number()
    .nullish()
    .describe("BL_COMPARISON only: the SI's gross weight as a plain number in kg (e.g. \"72,450.00 KG\" -> 72450)."),
  bl_gross_weight_kg: z
    .number()
    .nullish()
    .describe("BL_COMPARISON only: the draft BL's gross weight as a plain number in kg."),
  // Compared in code alongside the numbers above: 500 KG and 500 LB are equal
  // as numbers but are not the same weight.
  si_gross_weight_unit: z
    .string()
    .nullish()
    .describe("BL_COMPARISON only: the unit the SI prints its gross weight in, as a short uppercase token (KG, G, MT, LB)."),
  bl_gross_weight_unit: z
    .string()
    .nullish()
    .describe("BL_COMPARISON only: the unit the draft BL prints its gross weight in, as a short uppercase token (KG, G, MT, LB)."),
});

export type CategoryResult = z.infer<typeof categoryResultSchema>;

// The 7 fields transcribed off one of the two documents. `.optional()` on the
// object (not `.nullish()`): a nullish object makes `z.toJSONSchema` emit an
// `anyOf: [object, null]` union, and the request sends
// `provider: { requireParameters: true }`, so a union can narrow the pool of
// providers OpenRouter will route to. `.optional()` emits a plain object, and
// the fields' `.nullish()` renders as `type: ["string", "null"]` — the same
// shape `si_gross_weight_kg` already uses.
function documentValuesSchema(description: string) {
  return z
    .object({
      shipper: z.string().nullish(),
      consignee: z.string().nullish(),
      notify_party: z.string().nullish(),
      port_of_loading: z.string().nullish(),
      port_of_discharge: z.string().nullish(),
      container_count: z.string().nullish(),
      gross_weight_kg: z.string().nullish(),
    })
    .optional()
    .describe(description);
}

// Field order matters: `reasoning` comes first so the model reasons before it answers.
const classificationShape = z.object({
  reasoning: z
    .string()
    .describe(
      "Concise reasoning: why this category and how the status was reached. For a BL comparison, the SI and BL value of each of the 7 fields.",
    ),
  categories: z
    .array(categoryResultSchema)
    .describe(
      "Each category at most once. Include plausible near-misses with honest scores; leave out categories with no connection to the email.",
    ),
  // After `categories`: the model must settle the category before it knows
  // whether to extract at all.
  shipping_instruction: documentValuesSchema(
    "BL_COMPARISON only. The 7 fields copied from the Shipping Instruction attachment. Omit entirely when BL_COMPARISON is not the highest-confidence category, or when no readable SI was attached.",
  ),
  bill_of_lading: documentValuesSchema(
    "BL_COMPARISON only. The 7 fields copied from the draft Bill of Lading attachment. Omit entirely when BL_COMPARISON is not the highest-confidence category, or when no readable draft BL was attached.",
  ),
  shipping_instruction_request: documentValuesSchema(
    "SI_REQUEST only. The 7 fields copied from the shipping instruction the email supplies, whether it is attached or written out in the email body. Omit entirely when SI_REQUEST is not the highest-confidence category, or when the email supplies no shipping instruction to read.",
  ),
});

// The BL comparison result only counts when BL_COMPARISON has the highest
// confidence (ties count as BL). Categories with confidence 0 are ignored.
export function findActiveBl(categories: CategoryResult[]): CategoryResult | undefined {
  const relevant = categories.filter((c) => c.confidence_score > 0);
  const bl = relevant.find((c) => c.category === "BL_COMPARISON");
  if (!bl) return undefined;
  const top = Math.max(...relevant.map((c) => c.confidence_score));
  return bl.confidence_score >= top ? bl : undefined;
}

// The SI a request email supplies is only extracted when SI_REQUEST is the top
// category. Ties go to BL_COMPARISON (findActiveBl above), so this asks for a
// strict lead instead of `>=` — otherwise an email scored 0.9/0.9 would be both
// an active BL comparison and an active SI request.
export function findActiveSiRequest(categories: CategoryResult[]): CategoryResult | undefined {
  const relevant = categories.filter((c) => c.confidence_score > 0);
  const si = relevant.find((c) => c.category === "SI_REQUEST");
  if (!si) return undefined;
  const topOther = Math.max(
    0,
    ...relevant.filter((c) => c.category !== "SI_REQUEST").map((c) => c.confidence_score),
  );
  return si.confidence_score > topOther ? si : undefined;
}

export const classificationSchema = classificationShape.superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const c of value.categories) {
    if (seen.has(c.category)) {
      ctx.addIssue({ code: "custom", message: `Duplicate category ${c.category}` });
    }
    seen.add(c.category);
  }

  const bl = findActiveBl(value.categories);
  if (!bl) return;
  if (!bl.status) {
    ctx.addIssue({ code: "custom", message: "BL_COMPARISON is the top category but has no status" });
  } else if (bl.status === "MISMATCH" && !bl.defect_fields?.length) {
    ctx.addIssue({ code: "custom", message: "status MISMATCH requires at least one defect_fields entry" });
  } else if (bl.status === "NEEDS_REVIEW" && !bl.review_reason) {
    ctx.addIssue({ code: "custom", message: "status NEEDS_REVIEW requires review_reason" });
  }

});

export type Classification = z.infer<typeof classificationSchema>;

// JSON Schema for the tool's `parameters`. Refinements above are not
// expressible in JSON Schema, so they're only enforced when parsing.
export const classificationJsonSchema: Record<string, unknown> = z.toJSONSchema(classificationShape);
delete classificationJsonSchema.$schema;

// ---- API response ----

/** The 7 fields read off one document. Same shape for the SI and the draft BL. */
export type ExtractedDocumentValues = {
  [K in (typeof COMPARED_FIELDS)[number]]: string | null;
};

export type ClassificationResponse = {
  email_id: string;
  reasoning: string;
  categories: { category: (typeof CATEGORIES)[number]; confidence_score: number }[];
  status: (typeof STATUSES)[number];
  review_reason: (typeof REVIEW_REASONS)[number] | null;
  defect_fields: (typeof COMPARED_FIELDS)[number][];
  has_defect: boolean;
  // Both non-null only when BL_COMPARISON is the top-scoring category and that
  // document was attached and readable. A field is null when the document had
  // no value for it.
  shipping_instruction: ExtractedDocumentValues | null;
  bill_of_lading: ExtractedDocumentValues | null;
  // Non-null only when SI_REQUEST is the top-scoring category and the email
  // supplied a shipping instruction, in an attachment or in its body.
  shipping_instruction_request: ExtractedDocumentValues | null;
};
