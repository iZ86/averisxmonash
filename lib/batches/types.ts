import type { Category, Field, FieldComparison, Result } from "@/lib/types";

/** A row from `public.emails`. */
export type EmailRow = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  from_address: string;
  subject: string;
  snippet: string | null;
  body: string | null;
  received_at: string;
  logged_at: string;
  is_unread: boolean;
};

/** The classifier's own status values, plus FAILED which the sync route writes
 * itself when `classifyEmail` throws (the classifier schema has no such state). */
export type ProcessedStatus = "OK" | "MISMATCH" | "NEEDS_REVIEW" | "FAILED";

/** A row from `public.processed_emails`, scoped to a synced email. */
export type ProcessedRow = {
  id: string;
  synced_email_id: string;
  reasoning: string | null;
  status: ProcessedStatus | null;
  review_reason: string | null;
  has_defect: boolean | null;
  defect_fields: Field[] | null;
  categories: { category: string; confidence_score: number }[] | null;
  created_at: string;
};

/** A row from the `public.batch_emails` view (see supabase/migrations) — an email
 * joined with its latest analysis, with result/category/confidence already
 * computed in SQL. */
export type BatchEmailViewRow = {
  id: string;
  subject: string;
  from_address: string;
  snippet: string | null;
  received_at: string;
  logged_at: string;
  is_unread: boolean;
  processed_id: string | null;
  status: ProcessedStatus | null;
  review_reason: string | null;
  has_defect: boolean | null;
  defect_fields: Field[] | null;
  reasoning: string | null;
  processed_at: string | null;
  top_category: string | null;
  top_confidence: number | null;
  result: Result | "pending";
  overall_confidence: number | null;
  classification_confidence: number | null;
  category: Category | null;
};

/** A row from `public.email_attachments`. */
export type AttachmentRow = {
  id: string;
  email_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  extracted_text: string | null;
  extraction_note: string | null;
  position: number;
};

/** What the UI actually renders: an email joined with its latest analysis (if any). */
export type BatchEmail = {
  id: string;
  subject: string;
  fromAddress: string;
  snippet: string | null;
  receivedAt: string;
  loggedAt: string;
  isUnread: boolean;
  body: string | null; // only populated when fetched for the detail pane

  /** "pending" = synced but never analysed. */
  result: Result | "pending";
  /** The winning category, once analysed. */
  category: Category | null;
  /** That category's own confidence, 0-100. Always present once analysed. */
  classificationConfidence: number | null;
  /** Comparison/overall confidence, 0-100. Only meaningful for no_mismatch/mismatch
   * (stands in for "lowest field confidence" since no per-field scores exist yet). */
  confidence: number | null;
  /** Which of the 7 fields differ (mismatch only). */
  defectFields: Field[];
  /** Why a case needs review, in the classifier's own words (enum value). */
  reviewReasonRaw: string | null;
  /** The LLM's reasoning text — the closest thing to an evidence/explanation panel. */
  reasoning: string | null;
  /** Set only when result === "failed". */
  error: string | null;

  attachments: { id: string; filename: string; mimeType: string | null; sizeBytes: number | null }[];

  /** Per-field SI/BL values + confidence. Not populated by the current
   * classification pipeline (v1 ships without them) — always empty today, kept
   * so the moved comparison-report/review components keep working unchanged if
   * this is extended later. */
  fields?: FieldComparison[];
  /** Highlighted source-document evidence. Same story as `fields`: never
   * populated today, kept for forward-compatibility with the moved components. */
  evidence?: { si: string[]; bl: string[]; flagged?: Field };
};
