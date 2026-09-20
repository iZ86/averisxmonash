import { CATEGORIES, REVIEW_REASONS } from "@/lib/email-classification/schemas";
import { FIELD_LABEL } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/server";
import type { Field } from "@/lib/types";

type CategoryCode = (typeof CATEGORIES)[number];
export type ReviewReason = (typeof REVIEW_REASONS)[number];

const CATEGORY_NAME: Record<CategoryCode, string> = {
  BL_COMPARISON: "Document comparison",
  SI_REQUEST: "New SI request",
  INVOICE_QUERY: "Invoice query",
  GENERAL: "General message",
  SPAM: "Spam",
};

export const REVIEW_REASON_TEXT: Record<ReviewReason, { label: string; hint: string }> = {
  wrong_doc_type: { label: "Wrong document type", hint: "The BL is actually a commercial invoice" },
  missing_attachment: { label: "Missing attachment", hint: "The comparison is missing an attachment" },
  unreadable: { label: "Unreadable document", hint: "PDF is not in the correct format, or the text is unclear" },
  missing_value: { label: "Missing value", hint: "One of the 7 fields is empty or N/A" },
};

// No column tracks a completed review yet; wire this up once one exists.
const REVIEWS_COMPLETED = 0;

interface ProcessedRow {
  email_id: string;
  status: "OK" | "MISMATCH" | "NEEDS_REVIEW";
  review_reason: ReviewReason | null;
  defect_fields: string[] | null;
  categories: { category: CategoryCode; confidence_score: number }[] | null;
  created_at: string;
}

interface EmailRow {
  id: string;
  gmail_message_id: string;
  subject: string;
  from_address: string;
  received_at: string;
}

export interface QueueItem {
  id: string;
  subject: string;
  sender: string;
  at: string;
  reason: { label: string; hint: string } | null;
  fields: string[];
}

export interface BarRow {
  label: string;
  value: number;
  highlight?: boolean;
}

/** Mirrors findActiveBl: BL_COMPARISON wins when it holds the top score (ties count as BL). */
function topCategory(categories: ProcessedRow["categories"]): CategoryCode {
  const scored = (categories ?? []).filter((c) => c.confidence_score > 0);
  if (scored.length === 0) return "GENERAL";
  const max = Math.max(...scored.map((c) => c.confidence_score));
  if (scored.some((c) => c.category === "BL_COMPARISON" && c.confidence_score >= max)) return "BL_COMPARISON";
  return scored.find((c) => c.confidence_score === max)!.category;
}

const oldestFirst = (a: QueueItem, b: QueueItem) => Date.parse(a.at) - Date.parse(b.at);

export async function getDashboardData() {
  const supabase = await createClient();
  const [processed, emails] = await Promise.all([
    supabase
      .from("processed_emails")
      .select("email_id,status,review_reason,defect_fields,categories,created_at")
      .returns<ProcessedRow[]>(),
    supabase
      .from("emails")
      .select("id,gmail_message_id,subject,from_address,received_at")
      .returns<EmailRow[]>(),
  ]);
  if (processed.error) throw new Error(`processed_emails: ${processed.error.message}`);
  if (emails.error) throw new Error(`emails: ${emails.error.message}`);

  const emailByKey = new Map<string, EmailRow>();
  for (const e of emails.data) {
    emailByKey.set(e.id, e);
    emailByKey.set(e.gmail_message_id, e);
  }

  const categoryCount = new Map<CategoryCode, number>();
  const fieldCount = new Map<string, number>();
  const reviewQueue: QueueItem[] = [];
  const mismatchQueue: QueueItem[] = [];
  const results = { noMismatch: 0, mismatch: 0, needsReview: 0 };

  for (const row of processed.data) {
    const category = topCategory(row.categories);
    categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
    if (category !== "BL_COMPARISON") continue;

    const email = emailByKey.get(row.email_id);
    const item: QueueItem = {
      id: row.email_id,
      subject: email?.subject ?? "(email not found)",
      sender: email?.from_address ?? "",
      at: email?.received_at ?? row.created_at,
      reason: row.review_reason ? REVIEW_REASON_TEXT[row.review_reason] ?? null : null,
      fields: (row.defect_fields ?? []).map((f) => FIELD_LABEL[f as Field] ?? f),
    };

    if (row.status === "MISMATCH") {
      results.mismatch++;
      mismatchQueue.push(item);
      for (const f of row.defect_fields ?? []) fieldCount.set(f, (fieldCount.get(f) ?? 0) + 1);
    } else if (row.status === "NEEDS_REVIEW") {
      results.needsReview++;
      reviewQueue.push(item);
    } else {
      results.noMismatch++;
    }
  }

  const comparisonRequests = results.noMismatch + results.mismatch + results.needsReview;

  const byCategory: BarRow[] = [
    { label: CATEGORY_NAME.BL_COMPARISON, value: categoryCount.get("BL_COMPARISON") ?? 0, highlight: true },
    ...CATEGORIES.filter((c) => c !== "BL_COMPARISON")
      .map((c) => ({ label: CATEGORY_NAME[c], value: categoryCount.get(c) ?? 0 }))
      .sort((a, b) => b.value - a.value),
  ];

  const byField: BarRow[] = [...fieldCount]
    .map(([field, value]) => ({ label: FIELD_LABEL[field as Field] ?? field, value }))
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, highlight: i === 0 }));

  return {
    emailsTotal: emails.data.length,
    emailsProcessed: processed.data.length,
    comparisonRequests,
    withMismatch: results.mismatch,
    awaitingReview: results.needsReview,
    reviewsCompleted: REVIEWS_COMPLETED,
    // Mapped = every comparison that could be decided, i.e. everything except needs-review.
    shipmentsMapped: results.noMismatch + results.mismatch,
    byCategory,
    byField,
    results,
    reviewQueue: reviewQueue.sort(oldestFirst),
    mismatchQueue: mismatchQueue.sort(oldestFirst),
  };
}
