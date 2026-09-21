/** What a reviewer can do for each classifier review_reason (see REVIEW_REASONS in the classifier schemas). */

export const REVIEW_FIELDS = [
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];
export type FieldValues = Record<ReviewField, string>;

export const REVIEW_FIELD_LABEL: Record<ReviewField, string> = {
  shipper: "Shipper",
  consignee: "Consignee",
  notify_party: "Notify party",
  port_of_loading: "Port of loading",
  port_of_discharge: "Port of discharge",
  container_count: "Container count",
  gross_weight_kg: "Gross weight (kg)",
};

export type ReviewReasonCode = "wrong_doc_type" | "missing_attachment" | "unreadable" | "missing_value";
export type ReviewAction =
  | "manual_entry"
  | "request_correct_document"
  | "request_additional_documents"
  | "request_clearer_document"
  | "request_resend";

export type ReviewCase = {
  title: string;
  /** One clear sentence on what went wrong. */
  problem: string;
  /** Present when the reviewer may accept the email by confirming the 7 fields themselves. */
  accept?: { label: string; hint: string };
  reject: { action: Exclude<ReviewAction, "manual_entry">; label: string; hint: string; ask: string };
};

const FIELD_LIST = "shipper, consignee, notify party, port of loading, port of discharge, container count and gross weight";

export const REVIEW_CASES: Record<ReviewReasonCode, ReviewCase> = {
  wrong_doc_type: {
    title: "Wrong document type",
    problem: "The document attached as the BL is a commercial invoice, not a bill of lading.",
    accept: {
      label: "Accept and confirm the details",
      hint: "Use this document anyway: check all 7 fields against it and confirm them.",
    },
    reject: {
      action: "request_correct_document",
      label: "Reject and request the correct document type",
      hint: "Ask the sender for the draft bill of lading.",
      ask: "The document attached as the draft Bill of Lading appears to be a commercial invoice. Could you please send the correct draft Bill of Lading so we can complete the comparison?",
    },
  },
  missing_attachment: {
    title: "Missing attachment",
    problem: "The email asks for a comparison but one of the two documents (the SI or the draft BL) is not attached.",
    reject: {
      action: "request_additional_documents",
      label: "Reject and request additional documents",
      hint: "Ask the sender for the missing attachment.",
      ask: "We could not complete the comparison because one of the two required documents is missing. Please send both the Shipping Instruction and the draft Bill of Lading as attachments.",
    },
  },
  unreadable: {
    title: "Unreadable document",
    problem: "The attachment could not be read: the PDF is not in the expected format, or the text is unclear.",
    accept: {
      label: "Accept and key in the details",
      hint: "Read the document yourself and enter all 7 fields. What the system managed to pick up is filled in as a starting point.",
    },
    reject: {
      action: "request_clearer_document",
      label: "Reject and request a clearer document",
      hint: "Ask the sender for a text-based or higher quality copy.",
      ask: "We were unable to read the attached document (the file format is not supported or the text is unclear). Could you please resend a clearer copy, ideally a text-based PDF rather than a scan?",
    },
  },
  missing_value: {
    title: "Missing value",
    problem: "One of the 7 compared fields is empty or N/A on one of the documents.",
    reject: {
      action: "request_resend",
      label: "Reject and ask the sender to resend",
      hint: "Ask the sender to fill in the missing field and resend.",
      ask: `At least one of the required fields (${FIELD_LIST}) is empty or marked N/A. Please complete every field and resend the documents.`,
    },
  },
};

export const isReviewReason = (v: string | null): v is ReviewReasonCode => !!v && v in REVIEW_CASES;

const ACTION_LABEL: Record<ReviewAction, string> = {
  manual_entry: "Confirmed manually",
  request_correct_document: "Correct document requested",
  request_additional_documents: "Additional documents requested",
  request_clearer_document: "Clearer document requested",
  request_resend: "Resend requested",
};
export const actionLabel = (a: string) => ACTION_LABEL[a as ReviewAction] ?? a;

/** "Jane Doe <jane@x.com>" -> "jane@x.com". */
export const senderAddress = (from: string) => from.match(/<([^>]+)>/)?.[1] ?? from.trim();

/** The reply sent to the sender when a case is rejected. */
export function replyContent(input: { from: string; subject: string; reason: ReviewReasonCode }) {
  const { ask } = REVIEW_CASES[input.reason].reject;
  const name = input.from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.split(" ")[0];
  return {
    to: senderAddress(input.from),
    subject: /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`,
    body: `Hi${name ? ` ${name}` : ""},

Thank you for your email. ${ask}

Thank you,
APRIL Group`,
  };
}
