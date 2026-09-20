import "server-only";
import { NextResponse } from "next/server";
import type { gmail_v1 } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { createGmailClient, parseMessage, getHeader, fetchWithBackoff } from "@/lib/google/gmail";
import { mapWithConcurrency } from "@/lib/email-processing";
import { SYNC_LOCK_STALE_MS } from "@/lib/batches/constants";

export const runtime = "nodejs";
// Gmail paging + per-attachment fetches + inline LLM classification can take a
// while for a large first sync; give this route more room than the default.
export const maxDuration = 300;

const FIRST_SYNC_DAYS = 30;
const GMAIL_LIST_PAGE_SIZE = 100;
const GMAIL_HISTORY_PAGE_SIZE = 100;
const GMAIL_FETCH_CONCURRENCY = 10;

type SyncResponse =
  | { success: true; inserted: number; skipped: number; failed: number; syncedAt: string; }
  | { success: false; error: string; reconnect?: boolean; };

function json(body: SyncResponse, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return json({ success: false, error: "Sign in required." }, 401);

  // Soft lock: refuse a second concurrent sync unless the previous one looks crashed.
  const { data: lockState } = await supabase
    .from("email_sync_state")
    .select("last_status, last_synced_at, history_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (lockState?.last_status === "running") {
    const startedAt = new Date(lockState.last_synced_at as string).getTime();
    if (Date.now() - startedAt < SYNC_LOCK_STALE_MS) {
      return json({ success: false, error: "A sync is already in progress." }, 409);
    }
  }
  await supabase
    .from("email_sync_state")
    .upsert({ user_id: userId, last_synced_at: new Date().toISOString(), last_status: "running", last_error: null });

  try {
    const gmail = createGmailClient();
    const storedHistoryId = (lockState?.history_id as string | null) ?? null;
    let messageIds: string[];
    let nextHistoryId: string | null = storedHistoryId;

    if (storedHistoryId) {
      try {
        const history = await listHistoryMessageIds(gmail, storedHistoryId);
        messageIds = history.messageIds;
        nextHistoryId = history.historyId;
      } catch (error) {
        if (!isExpiredHistoryError(error)) throw error;
        // Gmail eventually expires old history cursors. Rebuild from the
        // recent-mail window and establish a fresh cursor after the fallback.
        nextHistoryId = await getCurrentHistoryId(gmail);
        messageIds = await listMessageIds(gmail, recentMailAfterEpoch());
      }
    } else {
      nextHistoryId = await getCurrentHistoryId(gmail);
      messageIds = await listMessageIds(gmail, await getFallbackAfterEpoch(supabase));
    }

    // Per-message try/catch: one message hitting a quota wall (after backoff is
    // exhausted) shouldn't discard every other message already fetched in this run.
    const fetchOutcomes = await mapWithConcurrency(messageIds, GMAIL_FETCH_CONCURRENCY, async (id) => {
      try {
        const { data } = await fetchWithBackoff(() => gmail.users.messages.get({ userId: "me", id, format: "full" }));
        return { ok: true as const, data };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    });
    const fetchFailureCount = fetchOutcomes.filter((r) => !r.ok).length;
    const rows = fetchOutcomes
      .filter((r): r is { ok: true; data: gmail_v1.Schema$Message; } => r.ok)
      .map((r) => r.data)
      .map(mapMessageToRow);

    if (rows.length === 0) {
      const err = fetchFailureCount > 0 ? `Could not fetch any of ${fetchFailureCount} message(s) — likely a Gmail quota limit. Try again shortly.` : null;
      await finishSync(supabase, userId, err ? "error" : "ok", err, err ? null : nextHistoryId);
      if (err) return json({ success: false, error: err }, 502);
      return json({ success: true, inserted: 0, skipped: 0, failed: 0, syncedAt: new Date().toISOString() });
    }

    // Insert-only: existing rows (same user_id + gmail_message_id) are skipped here,
    // never touched, so logged_at and any historical fields are preserved.
    const { data: insertedRaw, error: insertError } = await supabase
      .from("emails")
      .upsert(
        rows.map((r) => ({ ...r.email, user_id: userId })),
        { onConflict: "user_id,gmail_message_id", ignoreDuplicates: true },
      )
      .select("id, gmail_message_id");
    if (insertError) throw insertError;

    const inserted = (insertedRaw ?? []) as { id: string; gmail_message_id: string; }[];
    const insertedIds = new Set(inserted.map((r) => r.gmail_message_id));
    const existingRows = rows.filter((r) => !insertedIds.has(r.email.gmail_message_id));

    if (inserted.length > 0) {
      const { error: queueError } = await supabase.from("email_processing_queue").upsert(
        inserted.map((row) => ({ email_id: row.id, user_id: userId })),
        { onConflict: "email_id", ignoreDuplicates: true },
      );
      if (queueError) throw queueError;
    }

    // Existing messages: only is_unread may have changed since we last saw them.
    // Per-row try/catch so one write failure doesn't skip the rest.
    await mapWithConcurrency(existingRows, GMAIL_FETCH_CONCURRENCY, async (r) => {
      try {
        await supabase
          .from("emails")
          .update({ is_unread: r.email.is_unread })
          .eq("user_id", userId)
          .eq("gmail_message_id", r.email.gmail_message_id);
      } catch {
        // best-effort — a stale is_unread flag self-corrects on the next sync
      }
    });

    const note = fetchFailureCount > 0 ? `${fetchFailureCount} message(s) could not be fetched this run (likely a Gmail quota limit) — they'll be picked up on the next sync.` : null;
    await finishSync(supabase, userId, "ok", note, fetchFailureCount === 0 ? nextHistoryId : null);
    return json({ success: true, inserted: inserted.length, skipped: existingRows.length, failed: fetchFailureCount, syncedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reconnect = /invalid_grant|GOOGLE_REFRESH_TOKEN|invalid_client/i.test(message);
    await finishSync(supabase, userId, "error", message);
    return json({ success: false, error: reconnect ? "Google sign-in has expired. Reconnect your Google account." : message, reconnect }, 502);
  }
}

async function finishSync(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  status: "ok" | "error",
  error: string | null,
  historyId: string | null = null,
) {
  await supabase
    .from("email_sync_state")
    .upsert({
      user_id: userId,
      last_synced_at: new Date().toISOString(),
      last_status: status,
      last_error: error,
      ...(historyId ? { history_id: historyId } : {}),
    });
}

async function listMessageIds(gmail: gmail_v1.Gmail, afterEpoch: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await fetchWithBackoff(() =>
      gmail.users.messages.list({
        userId: "me",
        q: `after:${afterEpoch}`,
        maxResults: GMAIL_LIST_PAGE_SIZE,
        pageToken,
      }),
    );
    for (const m of data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

async function listHistoryMessageIds(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
): Promise<{ messageIds: string[]; historyId: string; }> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let historyId = startHistoryId;

  do {
    const { data } = await fetchWithBackoff(() =>
      gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        maxResults: GMAIL_HISTORY_PAGE_SIZE,
        pageToken,
      }),
    );
    for (const history of data.history ?? []) {
      for (const added of history.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }
    historyId = data.historyId ?? historyId;
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return { messageIds: [...messageIds], historyId };
}

async function getCurrentHistoryId(gmail: gmail_v1.Gmail): Promise<string> {
  const { data } = await fetchWithBackoff(() => gmail.users.getProfile({ userId: "me" }));
  if (!data.historyId) throw new Error("Gmail did not return a mailbox history ID.");
  return data.historyId;
}

async function getFallbackAfterEpoch(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { data: latest } = await supabase
    .from("emails")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.received_at) {
    return Math.floor(new Date(latest.received_at as string).getTime() / 1000) - 24 * 60 * 60;
  }
  return recentMailAfterEpoch();
}

function recentMailAfterEpoch(): number {
  return Math.floor(Date.now() / 1000) - FIRST_SYNC_DAYS * 24 * 60 * 60;
}

function isExpiredHistoryError(error: unknown): boolean {
  const status = (error as { response?: { status?: number; }; code?: number; })?.response?.status
    ?? (error as { code?: number; })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return status === 404 || /historyId|history id|too old|not found/i.test(message);
}

type MappedRow = {
  email: {
    gmail_message_id: string;
    gmail_thread_id: string | null;
    from_address: string;
    subject: string;
    snippet: string | null;
    body: string | null;
    received_at: string;
    is_unread: boolean;
  };
};

function mapMessageToRow(message: gmail_v1.Schema$Message): MappedRow {
  const { text, html } = parseMessage(message.payload);
  const fromHeader = getHeader(message.payload, "From") ?? "";
  return {
    email: {
      gmail_message_id: message.id!,
      gmail_thread_id: message.threadId ?? null,
      from_address: extractAddress(fromHeader),
      subject: getHeader(message.payload, "Subject") ?? "",
      snippet: decodeEntities(message.snippet ?? ""),
      body: text.trim() || (html ? stripHtml(html) : null),
      received_at: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
      is_unread: message.labelIds?.includes("UNREAD") ?? false,
    },
  };
}

function extractAddress(fromHeader: string): string {
  const angle = fromHeader.match(/<([^>]+)>/);
  return (angle ? angle[1] : fromHeader).trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  const withoutScripts = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

