/** Human-readable sentences for the classifier's review_reason enum
 * (lib/email-classification/schemas.ts REVIEW_REASONS). */
export const REVIEW_REASON_TEXT: Record<string, string> = {
  missing_attachment: "One of the two documents (the SI or the draft BL) is not attached to this email",
  wrong_doc_type: "An attachment is present, but it is not the document the comparison needs",
  unreadable: "An attachment could not be read: it is corrupt, encrypted, or a scan with no text layer",
  missing_value: "One of the 7 compared fields has no value on one of the two documents",
};
