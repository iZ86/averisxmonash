import "client-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SYNC_LOCK_STALE_MS } from "./constants";
import { REVIEW_FIELDS, isReviewReason, type ReviewField, type ReviewReasonCode } from "./review-cases";
import type { BatchEmail, BatchEmailViewRow, AttachmentRow } from "./types";
import type { Field, FieldComparison } from "@/lib/types";

export const PAGE_SIZE = 8;

/** Review queue / Mismatches filter: cases whose sender has been emailed, or that are still waiting. */
export type SentFilter = "pending" | "emailed";

export type Tab = "all" | "comparison" | "si_request" | "invoice_query" | "review" | "failed" | "mismatch";
export type Sort = "newest" | "lowest" | "oldest";

export const TABS: { key: Tab; label: string; }[] = [
  { key: "all", label: "All" },
  { key: "comparison", label: "Comparison" },
  { key: "si_request", label: "SI request" },
  { key: "invoice_query", label: "Invoice query" },
  { key: "review", label: "Needs review" },
  { key: "failed", label: "Failed" },
];

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (c) => `\\${c}`);
}

/** A row from `public.shipping_instructions` or `public.bill_of_lading`: the 7
 * compared fields as transcribed off that document, keyed by `processed_email_id`. */
type DocumentValuesRow = Record<Field, string | null>;
const DOCUMENT_VALUE_COLUMNS = REVIEW_FIELDS.join(", ");

/** Builds the field table's rows from the two documents' transcribed values and
 * the classifier's own defect_fields list — `match` is never recomputed here,
 * only read off what the classifier already decided. */
function buildFieldComparisons(
  defectFields: Field[],
  si: DocumentValuesRow | null,
  bl: DocumentValuesRow | null,
): FieldComparison[] {
  const defects = new Set<Field>(defectFields);
  return REVIEW_FIELDS.map((field) => ({
    field,
    si: si?.[field] ?? null,
    bl: bl?.[field] ?? null,
    match: !defects.has(field),
    confidence: null,
  }));
}

function mapAttachments(attachments: AttachmentRow[]): BatchEmail["attachments"] {
  return attachments
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mime_type, sizeBytes: a.size_bytes }));
}

function fromViewRow(row: BatchEmailViewRow, attachments: AttachmentRow[] = [], body: string | null = null): BatchEmail {
  return {
    id: row.id,
    processedId: row.processed_id,
    subject: row.subject,
    fromAddress: row.from_address,
    snippet: row.snippet,
    receivedAt: row.received_at,
    loggedAt: row.logged_at,
    isUnread: row.is_unread,
    body,
    result: row.result,
    category: row.category,
    classificationConfidence: row.classification_confidence,
    confidence: row.overall_confidence,
    defectFields: row.defect_fields ?? [],
    reviewReasonRaw: row.review_reason,
    reasoning: row.reasoning,
    error: row.status === "FAILED" ? row.reasoning : null,
    attachments: mapAttachments(attachments),
  };
}

export async function listBatchEmails(
  supabase: SupabaseClient,
  opts: { tab: Tab; search: string; sort: Sort; page: number; reason?: ReviewReasonCode | null; field?: ReviewField | null; sent?: SentFilter | null; },
): Promise<{ rows: BatchEmail[]; total: number; }> {
  const from = (opts.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("batch_emails")
    .select(
      "id, subject, from_address, snippet, received_at, logged_at, is_unread, processed_id, status, review_reason, defect_fields, reasoning, result, overall_confidence, classification_confidence, category",
      { count: "exact" },
    );

  if (opts.tab === "comparison") query = query.eq("category", "document_comparison");
  else if (opts.tab === "si_request") query = query.eq("category", "new_si_request");
  else if (opts.tab === "review") {
    query = query.eq("result", "needs_review");
    if (opts.reason) query = query.eq("review_reason", opts.reason);
  } else if (opts.tab === "mismatch") {
    query = query.eq("result", "mismatch");
    if (opts.field) query = query.contains("defect_fields", [opts.field]);
  }
  else if (opts.tab === "invoice_query") query = query.eq("category", "invoice_query");
  else if (opts.tab === "failed") query = query.eq("result", "failed");

  // Emailed vs pending lives on processed_emails.email_sent, which the view doesn't expose,
  // so look up the emailed ids first and filter the list by them.
  if (opts.sent && (opts.tab === "review" || opts.tab === "mismatch" || opts.tab === "si_request" || opts.tab === "invoice_query")) {
    const { data: sentRows, error: sentError } = await supabase
      .from("processed_emails")
      .select("id")
      .eq("email_sent", true)
      .eq("status", opts.tab === "review" ? "NEEDS_REVIEW" : opts.tab === "mismatch" ? "MISMATCH" : "OK");
    if (sentError) throw sentError;
    const sentIds = (sentRows ?? []).map((r: { id: string }) => r.id);
    if (opts.sent === "emailed") {
      if (sentIds.length === 0) return { rows: [], total: 0 };
      query = query.in("processed_id", sentIds);
    } else if (sentIds.length > 0) {
      query = query.not("processed_id", "in", `(${sentIds.join(",")})`);
    }
  }

  const q = opts.search.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    query = query.or(`subject.ilike.${like},from_address.ilike.${like}`);
  }

  if (opts.sort === "lowest") {
    query = query.order("overall_confidence", { ascending: true, nullsFirst: false }).order("received_at", { ascending: false });
  } else if (opts.sort === "oldest") {
    query = query.order("received_at", { ascending: true });
  } else {
    query = query.order("received_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const matched = (data as unknown as BatchEmailViewRow[]).map((r) => ({ ...fromViewRow(r), inFilter: true }));
  return { rows: await groupByThread(supabase, matched), total: count ?? 0 };
}

/**
 * Presentation only: links the page's emails to the other emails in their Gmail thread (via
 * emails.gmail_thread_id) so replies sit next to the message they answer. Classification is untouched —
 * each email keeps its own analysis. Siblings that fall outside the current filter are included for context
 * (inFilter: false). Output is ordered by thread (first appearance), oldest message first within a thread.
 */
async function groupByThread(supabase: SupabaseClient, matched: BatchEmail[]): Promise<BatchEmail[]> {
  if (matched.length === 0) return matched;

  const { data: own, error: ownError } = await supabase
    .from("emails")
    .select("id, gmail_thread_id")
    .in("id", matched.map((r) => r.id));
  if (ownError) throw ownError;
  const threadOf = new Map((own ?? []).map((r: { id: string; gmail_thread_id: string | null }) => [r.id, r.gmail_thread_id]));
  const threadIds = [...new Set([...threadOf.values()].filter((t): t is string => !!t))];

  const siblings: BatchEmail[] = [];
  if (threadIds.length > 0) {
    const { data: threadRows, error: threadError } = await supabase
      .from("emails")
      .select("id, gmail_thread_id")
      .in("gmail_thread_id", threadIds);
    if (threadError) throw threadError;
    const have = new Set(matched.map((r) => r.id));
    const extra = (threadRows ?? []).filter((r: { id: string }) => !have.has(r.id));
    for (const r of extra as { id: string; gmail_thread_id: string }[]) threadOf.set(r.id, r.gmail_thread_id);
    if (extra.length > 0) {
      const { data: viewRows, error: viewError } = await supabase
        .from("batch_emails")
        .select(
          "id, subject, from_address, snippet, received_at, logged_at, is_unread, status, review_reason, defect_fields, reasoning, result, overall_confidence, classification_confidence, category, processed_id",
        )
        .in("id", extra.map((r: { id: string }) => r.id));
      if (viewError) throw viewError;
      for (const r of viewRows as unknown as BatchEmailViewRow[]) siblings.push({ ...fromViewRow(r), inFilter: false });
    }
  }

  const groups = new Map<string, BatchEmail[]>();
  for (const e of [...matched, ...siblings]) {
    const threadId = threadOf.get(e.id) ?? null;
    const key = threadId ?? `solo:${e.id}`;
    const list = groups.get(key) ?? [];
    list.push({ ...e, threadId });
    groups.set(key, list);
  }
  // Map keeps insertion order, and matched rows were inserted first, so threads follow the page's sort.
  return [...groups.values()].flatMap((g) => g.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)));
}

export type BatchStats = {
  total: number;
  avgConfidence: number | null;
  belowThreshold: number;
  needsReview: number;
  failed: number;
  comparison: number;
  siRequest: number;
  invoiceQuery: number;
};

export async function getBatchStats(supabase: SupabaseClient): Promise<BatchStats> {
  const countCategory = (category: string) =>
    supabase.from("batch_emails").select("id", { count: "exact", head: true }).eq("category", category);
  const [{ data, error }, { count: siRequest, error: siError }, { count: invoiceQuery, error: invoiceError }] = await Promise.all([
    supabase.rpc("batch_email_stats").single(),
    countCategory("new_si_request"),
    countCategory("invoice_query"),
  ]);
  if (error) throw error;
  if (siError) throw siError;
  if (invoiceError) throw invoiceError;
  const row = data as {
    total: number;
    avg_confidence: number | null;
    below_threshold: number;
    needs_review: number;
    failed: number;
    comparison: number;
  };
  return {
    total: row.total,
    avgConfidence: row.avg_confidence,
    belowThreshold: row.below_threshold,
    needsReview: row.needs_review,
    failed: row.failed,
    comparison: row.comparison,
    siRequest: siRequest ?? 0,
    invoiceQuery: invoiceQuery ?? 0,
  };
}

export type ReviewStats = {
  total: number;
  /** How many of the open cases have already had a reply sent to their sender. */
  notified: number;
  byReason: Record<ReviewReasonCode, number>;
};

/** Counts for the Review queue page, computed from `processed_emails` directly
 * (the same table the reject/accept API routes read and write). */
export async function getReviewStats(supabase: SupabaseClient): Promise<ReviewStats> {
  const { data, error } = await supabase.from("processed_emails").select("review_reason, email_sent").eq("status", "NEEDS_REVIEW");
  if (error) throw error;
  const rows = (data ?? []) as { review_reason: string | null; email_sent: boolean }[];

  let notified = 0;
  const byReason: Partial<Record<ReviewReasonCode, number>> = {};
  for (const row of rows) {
    if (row.email_sent) notified++;
    if (isReviewReason(row.review_reason)) byReason[row.review_reason] = (byReason[row.review_reason] ?? 0) + 1;
  }
  return { total: rows.length, notified, byReason: byReason as Record<ReviewReasonCode, number> };
}

export type MismatchStats = {
  total: number;
  /** How many of the mismatches have already had their sender emailed. */
  notified: number;
  byField: Record<ReviewField, number>;
};

/** Counts for the Mismatches page, computed from `processed_emails` directly
 * (the same table /api/mismatches/email reads and writes). */
export async function getMismatchStats(supabase: SupabaseClient): Promise<MismatchStats> {
  const { data, error } = await supabase.from("processed_emails").select("defect_fields, email_sent").eq("status", "MISMATCH");
  if (error) throw error;
  const rows = (data ?? []) as { defect_fields: string[] | null; email_sent: boolean }[];

  let notified = 0;
  const byField: Partial<Record<ReviewField, number>> = {};
  const fieldSet = new Set<string>(REVIEW_FIELDS);
  for (const row of rows) {
    if (row.email_sent) notified++;
    for (const f of row.defect_fields ?? []) {
      if (fieldSet.has(f)) byField[f as ReviewField] = (byField[f as ReviewField] ?? 0) + 1;
    }
  }
  return { total: rows.length, notified, byField: byField as Record<ReviewField, number> };
}

/** Which of the given `processed_emails` ids have already had a reply sent
 * (the same `email_sent` flag /api/mismatches/email and /api/reviews claim). */
export async function getEmailSentIds(supabase: SupabaseClient, processedEmailIds: string[]): Promise<Set<string>> {
  if (processedEmailIds.length === 0) return new Set();
  const { data, error } = await supabase.from("processed_emails").select("id, email_sent").in("id", processedEmailIds);
  if (error) throw error;
  return new Set(((data ?? []) as { id: string; email_sent: boolean }[]).filter((r) => r.email_sent).map((r) => r.id));
}

export async function getBatchEmailDetail(supabase: SupabaseClient, id: string): Promise<BatchEmail | null> {
  const [{ data: viewRow, error: viewError }, { data: attachments, error: attError }] = await Promise.all([
    supabase
      .from("batch_emails")
      .select(
        "id, subject, from_address, snippet, received_at, logged_at, is_unread, processed_id, status, review_reason, defect_fields, reasoning, result, overall_confidence, classification_confidence, category",
      )
      .eq("id", id)
      .maybeSingle(),
    // Metadata only (no extracted text): enough to know whether to show the Attachments tab.
    supabase.from("email_attachments").select("id, email_id, filename, mime_type, size_bytes, position").eq("email_id", id),
  ]);

  if (viewError) throw viewError;
  if (attError) throw attError;
  if (!viewRow) return null;

  const row = viewRow as unknown as BatchEmailViewRow;
  const email = fromViewRow(row, (attachments ?? []) as AttachmentRow[]);

  // The field table applies once there's something to compare, and to review
  // cases (which show what was read from each document). Fetch the two
  // documents' transcribed values only for those, not on every email.
  if (row.processed_id && (row.result === "mismatch" || row.result === "no_mismatch" || row.result === "needs_review")) {
    const [{ data: siRow, error: siError }, { data: blRow, error: blError }] = await Promise.all([
      supabase.from("shipping_instructions").select(DOCUMENT_VALUE_COLUMNS).eq("processed_email_id", row.processed_id).maybeSingle(),
      supabase.from("bill_of_lading").select(DOCUMENT_VALUE_COLUMNS).eq("processed_email_id", row.processed_id).maybeSingle(),
    ]);
    if (siError) throw siError;
    if (blError) throw blError;
    email.fields = buildFieldComparisons(email.defectFields, siRow as DocumentValuesRow | null, blRow as DocumentValuesRow | null);
  }

  return email;
}

export async function getBatchEmailContent(
  supabase: SupabaseClient,
  id: string,
): Promise<Pick<BatchEmail, "body" | "attachments">> {
  const [{ data: emailRow, error: emailError }, { data: attachments, error: attError }] = await Promise.all([
    supabase.from("emails").select("body").eq("id", id).maybeSingle(),
    supabase
      .from("email_attachments")
      .select("id, email_id, filename, mime_type, size_bytes, extracted_text, extraction_note, position")
      .eq("email_id", id),
  ]);

  if (emailError) throw emailError;
  if (attError) throw attError;

  return {
    body: (emailRow?.body as string | null) ?? null,
    attachments: mapAttachments((attachments ?? []) as AttachmentRow[]),
  };
}

export async function markEmailRead(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("emails").update({ is_unread: false }).eq("id", id);
  if (error) throw error;
}

export type SyncStatus = { syncing: boolean; };

/** Whether a sync is genuinely in progress right now (server-side, via
 * email_sync_state), so the "Sync emails" button can show as loading even
 * after a page refresh — not just while this tab's own fetch is in flight. */
export async function getSyncStatus(supabase: SupabaseClient): Promise<SyncStatus> {
  const { data } = await supabase.from("email_sync_state").select("last_status, last_synced_at").maybeSingle();
  if (data?.last_status !== "running") return { syncing: false };
  const startedAt = new Date(data.last_synced_at as string).getTime();
  const stale = Date.now() - startedAt > SYNC_LOCK_STALE_MS;
  return { syncing: !stale };
}

/** Emails synced but not yet classified — a fire-and-forget trigger to
 * /api/emails/process-queue can get cut short (tab closed/navigated before it
 * finishes), leaving jobs stuck at "pending" with nothing resuming them. This
 * lets the UI notice and re-trigger processing on load. */
export async function getPendingQueueCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("email_processing_queue")
    .select("email_id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export async function getLastSyncedAt(supabase: SupabaseClient): Promise<string | null> {
  const { data: state } = await supabase.from("email_sync_state").select("last_synced_at").maybeSingle();
  if (state?.last_synced_at) return state.last_synced_at as string;

  const { data: latest } = await supabase
    .from("emails")
    .select("logged_at")
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (latest?.logged_at as string | undefined) ?? null;
}
