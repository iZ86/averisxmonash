import "client-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { SYNC_LOCK_STALE_MS } from "./constants";
import type { BatchEmail, BatchEmailViewRow, AttachmentRow } from "./types";

export const PAGE_SIZE = 8;

export type Tab = "all" | "comparison" | "review" | "low" | "failed";
export type Sort = "newest" | "lowest";

export const TABS: { key: Tab; label: string; }[] = [
  { key: "all", label: "All" },
  { key: "comparison", label: "Comparison" },
  { key: "review", label: "Needs review" },
  { key: "low", label: "Low confidence" },
  { key: "failed", label: "Failed" },
];

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (c) => `\\${c}`);
}

function fromViewRow(row: BatchEmailViewRow, attachments: AttachmentRow[] = [], body: string | null = null): BatchEmail {
  return {
    id: row.id,
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
    attachments: attachments
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ filename: a.filename, mimeType: a.mime_type })),
  };
}

export async function listBatchEmails(
  supabase: SupabaseClient,
  opts: { tab: Tab; search: string; sort: Sort; page: number; },
): Promise<{ rows: BatchEmail[]; total: number; }> {
  const from = (opts.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("batch_emails")
    .select(
      "id, subject, from_address, snippet, received_at, logged_at, is_unread, status, review_reason, defect_fields, reasoning, result, overall_confidence, classification_confidence, category",
      { count: "exact" },
    );

  if (opts.tab === "comparison") query = query.eq("category", "document_comparison");
  else if (opts.tab === "review") query = query.eq("result", "needs_review");
  else if (opts.tab === "low") query = query.lt("overall_confidence", AUTO_ACCEPT_THRESHOLD);
  else if (opts.tab === "failed") query = query.eq("result", "failed");

  const q = opts.search.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    query = query.or(`subject.ilike.${like},from_address.ilike.${like}`);
  }

  if (opts.sort === "lowest") {
    query = query.order("overall_confidence", { ascending: true, nullsFirst: false }).order("received_at", { ascending: false });
  } else {
    query = query.order("received_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    rows: (data as unknown as BatchEmailViewRow[]).map((r) => fromViewRow(r)),
    total: count ?? 0,
  };
}

export type BatchStats = {
  total: number;
  avgConfidence: number | null;
  belowThreshold: number;
  needsReview: number;
  failed: number;
  comparison: number;
};

export async function getBatchStats(supabase: SupabaseClient): Promise<BatchStats> {
  const { data, error } = await supabase.rpc("batch_email_stats").single();
  if (error) throw error;
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
  };
}

export async function getBatchEmailDetail(supabase: SupabaseClient, id: string): Promise<BatchEmail | null> {
  const { data: viewRow, error: viewError } = await supabase
    .from("batch_emails")
    .select(
      "id, subject, from_address, snippet, received_at, logged_at, is_unread, status, review_reason, defect_fields, reasoning, result, overall_confidence, classification_confidence, category",
    )
    .eq("id", id)
    .maybeSingle();

  if (viewError) throw viewError;
  if (!viewRow) return null;

  return fromViewRow(viewRow as unknown as BatchEmailViewRow);
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
    attachments: ((attachments ?? []) as AttachmentRow[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ filename: a.filename, mimeType: a.mime_type })),
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
