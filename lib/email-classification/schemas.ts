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
});

export type CategoryResult = z.infer<typeof categoryResultSchema>;

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

export type ClassificationResponse = {
  email_id: string;
  reasoning: string;
  categories: { category: (typeof CATEGORIES)[number]; confidence_score: number }[];
  status: (typeof STATUSES)[number];
  review_reason: (typeof REVIEW_REASONS)[number] | null;
  defect_fields: (typeof COMPARED_FIELDS)[number][];
  has_defect: boolean;
};
