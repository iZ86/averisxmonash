"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, Mail, RefreshCw, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { fmtRel } from "@/lib/batches/format";
import { isOwnAddress } from "@/lib/batches/constants";
import {
  TABS,
  type Sort,
  type Tab,
  getBatchEmailContent,
  getBatchEmailDetail,
  getBatchStats,
  getReviewStats,
  getMismatchStats,
  getEmailSentIds,
  getLastSyncedAt,
  getPendingQueueCount,
  getSyncStatus,
  listBatchEmails,
  markEmailRead,
  type BatchStats,
  type ReviewStats,
  type MismatchStats,
} from "@/lib/batches/queries";
import type { BatchEmail } from "@/lib/batches/types";
import {
  REVIEW_CASES,
  REVIEW_FIELDS,
  REVIEW_FIELD_LABEL,
  isReviewReason,
  type ReviewField,
  type ReviewReasonCode,
} from "@/lib/batches/review-cases";
import { ListPanel } from "./list-panel";
import { MismatchPreview } from "./mismatch-preview";
import { DetailHeader, type DetailTab } from "./detail-header";
import { ComparisonView } from "./comparison-view";
import { AttachmentsView } from "./attachments-view";
import { ReviewView } from "./review-view";
import { PendingView, NotComparedView, FailedView, EmailView } from "./other-views";

const isTab = (v: string | null): v is Tab => !!v && TABS.some((t) => t.key === v);
const isSort = (v: string | null): v is Sort => v === "newest" || v === "lowest" || v === "oldest";

const REASON_ORDER: ReviewReasonCode[] = ["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"];

/**
 * "all" is the Batches page. "review" is the Review Queue: the same workspace limited to
 * NEEDS_REVIEW cases, filtered by review reason, oldest first, with review-specific metrics.
 * "mismatch" is the Mismatches page: MISMATCH emails filtered by which of the 7 fields differ, with
 * checkboxes and buttons to email the senders.
 */
export type WorkspaceMode = "all" | "review" | "mismatch";

const isField = (v: string | null): v is ReviewField => !!v && (REVIEW_FIELDS as readonly string[]).includes(v);

/** Our own messages have no analysis, so they open straight on the email itself. */
function defaultDetailTab(email: BatchEmail): DetailTab {
  return isOwnAddress(email.fromAddress) ? "email" : "analysis";
}

export function BatchesWorkspace({ mode = "all" }: { mode?: WorkspaceMode }) {
  const isReview = mode === "review";
  const isMismatch = mode === "mismatch";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const tab: Tab = isReview
    ? "review"
    : isMismatch
      ? "mismatch"
      : isTab(params.get("tab"))
        ? (params.get("tab") as Tab)
        : "all";
  const reasonParam = params.get("reason");
  const reason: ReviewReasonCode | null = isReview && isReviewReason(reasonParam) ? reasonParam : null;
  const fieldParam = params.get("field");
  const field: ReviewField | null = isMismatch && isField(fieldParam) ? fieldParam : null;
  const filter = reason ?? field;
  const defaultSort: Sort = isReview || isMismatch ? "oldest" : "newest";
  const sort: Sort = isSort(params.get("sort")) ? (params.get("sort") as Sort) : defaultSort;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") ?? "";
  const selectedId = params.get("email");

  // Local editable copy of the URL's `q`, resynced during render (not via an
  // effect) whenever `q` changes from outside the search box itself (clear
  // filters, back/forward) — the standard "adjust state on prop change" pattern.
  const [searchInput, setSearchInput] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearchInput(q);
  }

  // `listKey` identifies which params produced `rows`/`total`; listLoading is
  // derived by comparing it to the current params (same pattern as the old
  // Gmail inbox page's `list.key`), so no effect ever calls setState synchronously.
  const listKeyFor = (t: Tab, search: string, s: Sort, p: number, r: string | null) =>
    `${t}|${search}|${s}|${p}|${r ?? ""}`;
  const [rows, setRows] = useState<BatchEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [listKey, setListKey] = useState("");
  const listLoading = listKey !== listKeyFor(tab, q, sort, page, filter);

  const [stats, setStats] = useState<BatchStats | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [mismatchStats, setMismatchStats] = useState<MismatchStats | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [emailing, setEmailing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [detail, setDetail] = useState<BatchEmail | null>(null);
  const [contentLoadedFor, setContentLoadedFor] = useState<string | null>(null);
  const detailLoading = !!selectedId && detail?.id !== selectedId;
  const [detailTab, setDetailTab] = useState<DetailTab>("analysis");
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const needsContent = detailTab === "email" || detailTab === "attachments";
  const contentLoading = needsContent && contentLoadedFor !== selectedId;

  function setParams(next: Record<string, string | null>, opts: { replace?: boolean } = {}) {
    const usp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) usp.delete(k);
      else usp.set(k, v);
    }
    const url = `${pathname}?${usp.toString()}`;
    if (opts.replace !== false) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  // Reusable versions for event handlers (sync/retry/resolve) to call after a mutation.
  const refreshStats = useCallback(async () => {
    const [s, synced] = await Promise.all([
      isReview ? getReviewStats(supabase) : isMismatch ? getMismatchStats(supabase) : getBatchStats(supabase),
      getLastSyncedAt(supabase),
    ]);
    if (isReview) setReviewStats(s as ReviewStats);
    else if (isMismatch) setMismatchStats(s as MismatchStats);
    else setStats(s as BatchStats);
    setLastSyncedAt(synced);
  }, [supabase, isReview, isMismatch]);

  const refreshList = useCallback(async () => {
    try {
      const { rows: r, total: t } = await listBatchEmails(supabase, {
        tab,
        search: q,
        sort,
        page,
        reason,
        field,
      });
      setRows(r);
      setTotal(t);
      setListKey(listKeyFor(tab, q, sort, page, filter));
    } catch (err) {
      toast.error("Could not load emails.", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [supabase, tab, q, sort, page, reason, field, filter]);

  // Mount/dependency-driven fetches: inlined (not via the callbacks above) so
  // the state updates are visibly inside a .then() chain in the effect body.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      isReview ? getReviewStats(supabase) : isMismatch ? getMismatchStats(supabase) : getBatchStats(supabase),
      getLastSyncedAt(supabase),
    ]).then(([s, synced]) => {
      if (cancelled) return;
      if (isReview) setReviewStats(s as ReviewStats);
      else if (isMismatch) setMismatchStats(s as MismatchStats);
      else setStats(s as BatchStats);
      setLastSyncedAt(synced);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, isReview, isMismatch]);

  // Mismatches: which of the listed emails have already been emailed to their sender.
  useEffect(() => {
    if (!isMismatch) return;
    let cancelled = false;
    getEmailSentIds(
      supabase,
      rows.map((r) => r.processedId).filter((id): id is string => !!id),
    ).then((ids) => {
      if (!cancelled) setSentIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, isMismatch, rows]);

  // Detect a sync already in progress (started by this tab before a refresh,
  // or by another tab/session) so the button shows as loading immediately,
  // not just while this tab's own POST is in flight.
  useEffect(() => {
    let cancelled = false;
    getSyncStatus(supabase).then((s) => {
      if (!cancelled && s.syncing) setSyncing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // While syncing (whether we started it or just detected it), poll for
  // completion so the button un-loads and the list/stats refresh even if the
  // tab that started the sync isn't the one still open.
  const selfInitiatedSyncRef = useRef(false);
  useEffect(() => {
    if (!syncing) return;
    const interval = setInterval(async () => {
      const s = await getSyncStatus(supabase);
      if (s.syncing) return;
      setSyncing(false);
      if (selfInitiatedSyncRef.current) return; // onSync's own success path already refreshed + toasted
      await Promise.all([refreshList(), refreshStats()]);
      toast.success("Sync finished");
    }, 3000);
    return () => clearInterval(interval);
  }, [syncing, supabase, refreshList, refreshStats]);

  // Triggering /api/emails/process-queue is fire-and-forget from the browser:
  // it claims and classifies queued emails one at a time in a single long
  // request, which can run for a while (Gmail fetch + attachment extraction +
  // an LLM call per email). Without keepalive, navigating away or refreshing
  // mid-run drops that connection and leaves the rest of the queue stuck at
  // "pending" with nothing resuming it. keepalive helps it survive a
  // same-tab navigation; the mount check below additionally notices and
  // resumes any jobs left stranded by a previous run that didn't.
  const triggerQueueProcessing = useCallback(() => {
    setQueueProcessing(true);
    void fetch("/api/emails/process-queue", {
      method: "POST",
      keepalive: true,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPendingQueueCount(supabase).then((n) => {
      if (cancelled) return;
      if (n > 0) triggerQueueProcessing();
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, triggerQueueProcessing]);

  // While jobs are queued, refresh periodically so "Queued for classification"
  // rows update as each one completes, without a manual reload.
  useEffect(() => {
    if (!queueProcessing) return;
    const interval = setInterval(async () => {
      const n = await getPendingQueueCount(supabase);
      if (n === 0) {
        setQueueProcessing(false);
        await Promise.all([refreshList(), refreshStats()]);
        return;
      }
      await refreshList();
    }, 4000);
    return () => clearInterval(interval);
  }, [queueProcessing, supabase, refreshList, refreshStats]);

  useEffect(() => {
    let cancelled = false;
    const key = listKeyFor(tab, q, sort, page, filter);
    listBatchEmails(supabase, { tab, search: q, sort, page, reason, field })
      .then(({ rows: r, total: t }) => {
        if (cancelled) return;
        setRows(r);
        setTotal(t);
        setListKey(key);
      })
      .catch((err) => {
        if (!cancelled)
          toast.error("Could not load emails.", {
            description: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, tab, q, sort, page, reason, field, filter]);

  // Debounce the search box into the URL's `q` param.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParams({ q: value || null, page: null }), 300);
  }

  // Auto-select the first row once the list loads with nothing selected (or the
  // selection fell off the current page/filter).
  useEffect(() => {
    if (listLoading) return;
    if (rows.length === 0) {
      if (selectedId) setParams({ email: null });
      return;
    }
    // A deep-linked email may sit on a later page, so only pick a default when nothing is selected.
    if (!selectedId) setParams({ email: (rows.find((r) => r.inFilter !== false) ?? rows[0]).id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, listLoading]);

  // Load the detail pane whenever the selected id changes. When selectedId is
  // null, `detail` is simply not rendered (see `displayedDetail` below) rather
  // than reset here — avoids a synchronous setState in the effect body.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getBatchEmailDetail(supabase, selectedId)
      .then((e) => {
        if (cancelled) return;
        setDetail(e);
        setContentLoadedFor(null);
        if (e) {
          setDetailTab(defaultDetailTab(e));
          setAttachmentId(null);
          if (e.isUnread) {
            markEmailRead(supabase, e.id).then(() => {
              setRows((prev) => prev.map((r) => (r.id === e.id ? { ...r, isUnread: false } : r)));
            });
          }
        }
      })
      .catch((err) => {
        if (!cancelled)
          toast.error("Could not load this email.", {
            description: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedId]);

  useEffect(() => {
    if (!selectedId || !needsContent || contentLoadedFor === selectedId) return;
    let cancelled = false;
    getBatchEmailContent(supabase, selectedId)
      .then((content) => {
        if (cancelled) return;
        setDetail((current) => (current?.id === selectedId ? { ...current, ...content } : current));
        setContentLoadedFor(selectedId);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error("Could not load email content.", {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedId, needsContent, contentLoadedFor]);

  async function onSync() {
    if (syncing) return;
    selfInitiatedSyncRef.current = true;
    setSyncing(true);
    try {
      const res = await fetch("/api/emails/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.reconnect) {
          toast.error("Google sign-in has expired.", {
            description: "Ask an admin to reconnect the Gmail integration (GOOGLE_REFRESH_TOKEN).",
          });
        } else {
          toast.error("Sync failed.", {
            description: data.error ?? "Unknown error.",
          });
        }
        return;
      }
      setParams({ page: null, sort: null });
      await Promise.all([refreshList(), refreshStats()]);
      const summary =
        data.inserted > 0
          ? `${data.inserted} new ${data.inserted === 1 ? "email" : "emails"} synced`
          : "Already up to date";
      if (data.failed > 0) {
        toast.warning(summary, {
          description: `${data.failed} message(s) could not be fetched this run — they'll be retried on the next sync.`,
        });
      } else {
        toast.success(summary);
      }
      if (data.inserted > 0) triggerQueueProcessing();
    } catch (err) {
      toast.error("Could not reach the server.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncing(false);
      selfInitiatedSyncRef.current = false;
    }
  }

  async function onRetry() {
    if (!detail || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch("/api/emails/sync/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: detail.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error("Retry failed.", {
          description: data.error ?? "Unknown error.",
        });
        return;
      }
      const refreshed = await getBatchEmailDetail(supabase, detail.id);
      setDetail(refreshed);
      setContentLoadedFor(null);
      await Promise.all([refreshList(), refreshStats()]);
      toast.success("Retry finished");
    } catch (err) {
      toast.error("Could not reach the server.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRetrying(false);
    }
  }

  const toggleChecked = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAllChecked = (ids: string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  /** Emails the sender of each given mismatch (or of every mismatch) from the connected Gmail account. */
  async function emailMismatches(target: { ids: string[] } | { all: true }) {
    if (emailing) return;

    setEmailing(true);
    try {
      const res = await fetch("/api/mismatches/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...("all" in target ? { all: true } : { processedEmailIds: target.ids }),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.needsReauth ? "Gmail cannot send yet." : "Could not send the emails.", {
          description: data.error ?? "Unknown error.",
        });
        return;
      }
      const failed: { subject: string; error: string }[] = data.failed ?? [];
      const summary = `${data.sent} email${data.sent === 1 ? "" : "s"} sent${data.skipped ? `, ${data.skipped} skipped (already sent)` : ""}`;
      if (failed.length) {
        toast.warning(summary, {
          description: `${failed.length} failed. First: ${failed[0].subject}: ${failed[0].error}`,
        });
      } else {
        toast.success(summary);
      }
      setChecked(new Set());
      await Promise.all([refreshList(), refreshStats()]);
    } catch (err) {
      toast.error("Could not reach the server.", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setEmailing(false);
    }
  }

  // A review decision changes the email's result (accepted) or its state (rejected), so reload it,
  // the list and the counts from the database.
  async function onResolved() {
    if (!selectedId) return;
    const refreshed = await getBatchEmailDetail(supabase, selectedId);
    setDetail(refreshed);
    await Promise.all([refreshList(), refreshStats()]);
  }

  const belowCount = stats?.belowThreshold ?? 0;
  const resolvedCount = 0;
  const reasonCount = (r: ReviewReasonCode) => reviewStats?.byReason[r] ?? 0;
  const fieldCount = (f: ReviewField) => mismatchStats?.byField[f] ?? 0;
  const selectedProcessedId = detail?.processedId ?? null;
  const displayedDetail = selectedId ? detail : null;

  // Header row, the same on every page: sync, upload (Batches only) and the last-synced note.
  const actionsRow = (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn ghost shadow-sm hover:border-border-control hover:shadow"
          disabled={syncing}
          onClick={onSync}
        >
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden className={syncing ? "animate-spin" : undefined} />
          {syncing ? "Syncing…" : "Sync emails"}
        </button>
        {!isReview && !isMismatch && (
          <Link href="/upload" className="btn accent shadow-sm hover:shadow">
            <Upload size={16} strokeWidth={1.75} aria-hidden />
            Upload data
          </Link>
        )}
      </div>
      <p className="cap" aria-live="polite">
        {syncing
          ? "Fetching new emails from Gmail…"
          : lastSyncedAt
            ? `Showing stored emails. Last synced ${fmtRel(lastSyncedAt)}.`
            : "No emails synced yet."}
      </p>
    </div>
  );

  const searchBox = (
    <label className="input relative ml-auto min-w-[260px] flex-1 max-w-[360px]">
      <Search size={16} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
      <span className="sr-only">Search subject or sender</span>
      <input
        type="search"
        placeholder="Search subject or sender"
        autoComplete="off"
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full bg-transparent outline-none"
      />
    </label>
  );

  // Mismatches only: the bulk email buttons, shown just left of the search box.
  const bulkButtons = (
    <>
      <button
        type="button"
        className="btn ghost shadow-sm hover:border-border-control hover:shadow"
        disabled={emailing || checked.size === 0}
        onClick={() => emailMismatches({ ids: [...checked] })}
      >
        <Mail size={16} strokeWidth={1.75} aria-hidden />
        Email selected ({checked.size})
      </button>
      <button
        type="button"
        className="btn accent shadow-sm hover:shadow"
        disabled={emailing || (mismatchStats?.total ?? 0) === 0}
        onClick={() => emailMismatches({ all: true })}
      >
        <Mail size={16} strokeWidth={1.75} aria-hidden />
        {emailing ? "Sending…" : "Email all mismatches"}
      </button>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <div className="eyebrow">
            {isReview ? "Human in the loop" : isMismatch ? "Document comparison" : "Batches"}
          </div>
          <h1 className="h1">{isReview ? "Review queue" : isMismatch ? "Mismatches" : "Batches"}</h1>
          <p className="p">
            {isReview
              ? "Cases the system could not decide on its own. Confirm the details yourself, or reject and ask the sender for a better document."
              : isMismatch
                ? "Emails where the Shipping Instruction and the draft BL differ. Email the sender so they can send a corrected document."
                : "Every stored email with its category, confidence and result. Cases the system could not decide are marked Needs review."}
          </p>
        </div>
        {actionsRow}
      </div>

      {isMismatch ? (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3" aria-label="Mismatch summary">
          <Kpi
            label="Mismatches"
            value={(mismatchStats?.total ?? 0).toLocaleString("en-US")}
            sub="Differ from the SI"
            tone="coral"
          />
          <Kpi
            label="Not yet emailed"
            value={Math.max(0, (mismatchStats?.total ?? 0) - (mismatchStats?.notified ?? 0))}
            sub="Sender has not been told"
            tone="orange"
          />
          <Kpi label="Emailed" value={mismatchStats?.notified ?? 0} sub="Sender notified" tone="teal" />
        </section>
      ) : isReview ? (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3" aria-label="Review summary">
          <Kpi
            label="Open cases"
            value={(reviewStats?.total ?? 0).toLocaleString("en-US")}
            sub="Waiting for a person"
            tone="coral"
          />
          <Kpi
            label="Not yet emailed"
            value={Math.max(0, (reviewStats?.total ?? 0) - (reviewStats?.notified ?? 0))}
            sub="Sender has not been told"
            tone="orange"
          />
          <Kpi label="Emailed" value={reviewStats?.notified ?? 0} sub="Sender notified" tone="teal" />
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5" aria-label="Batch summary">
          <Kpi label="Emails in batch" value={(stats?.total ?? 0).toLocaleString("en-US")} sub="Stored from Gmail" />
          <Kpi
            label="Average confidence"
            value={stats?.avgConfidence == null ? "n/a" : `${stats.avgConfidence}%`}
            sub="Across all results"
            tone="teal"
          />
          <Kpi
            label={`Below ${AUTO_ACCEPT_THRESHOLD}% confidence`}
            value={belowCount}
            sub={`${resolvedCount} resolved · ${stats?.needsReview ?? 0} open`}
            tone="orange"
          />
          <Kpi label="Needs review" value={stats?.needsReview ?? 0} sub="Waiting for a person" tone="orange" />
          <Kpi label="Failed" value={stats?.failed ?? 0} sub="Retry available" tone="coral" />
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        {isMismatch ? (
          <div className="w-full">
<div className="seg" role="group" aria-label="Filter by differing field">
            <button
              type="button"
              aria-pressed={!field}
              className={!field ? "on" : undefined}
              onClick={() => setParams({ field: null, page: null, email: null })}
            >
              All {mismatchStats?.total ?? 0}
            </button>
            {REVIEW_FIELDS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={field === f}
                className={field === f ? "on" : undefined}
                onClick={() => setParams({ field: f, page: null, email: null })}
              >
                {REVIEW_FIELD_LABEL[f]} {fieldCount(f)}
              </button>
            ))}
          </div>
          </div>
        ) : isReview ? (
          <div className="seg" role="group" aria-label="Filter by review reason">
            <button
              type="button"
              aria-pressed={!reason}
              className={!reason ? "on" : undefined}
              onClick={() => setParams({ reason: null, page: null, email: null })}
            >
              All {reviewStats?.total ?? 0}
            </button>
            {REASON_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                className={reason === r ? "on" : undefined}
                onClick={() => setParams({ reason: r, page: null, email: null })}
              >
                {REVIEW_CASES[r].title} {reasonCount(r)}
              </button>
            ))}
          </div>
        ) : (
          <div className="seg" role="group" aria-label="Filter emails">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                className={tab === t.key ? "on" : undefined}
                onClick={() =>
                  setParams({
                    tab: t.key === "all" ? null : t.key,
                    page: null,
                    email: null,
                  })
                }
              >
                {t.label} {tabCount(stats, t.key)}
              </button>
            ))}
          </div>
        )}
        {isMismatch && <div className="flex flex-wrap items-center gap-3">{bulkButtons}</div>}
        {searchBox}
      </div>

      <div className="grid items-start gap-5 [@media(min-width:1180px)]:grid-cols-[372px_minmax(0,1fr)]">
        <ListPanel
          rows={rows}
          total={total}
          page={page}
          sort={sort}
          selectedId={selectedId}
          loading={listLoading}
          onSelect={(id) => setParams({ email: id })}
          noun={
            isReview ? { one: "case", many: "cases" } : isMismatch ? { one: "mismatch", many: "mismatches" } : undefined
          }
          variant={isReview ? "review" : isMismatch ? "mismatch" : "all"}
          selection={
            isMismatch ? { checked, sent: sentIds, onToggle: toggleChecked, onToggleAll: toggleAllChecked } : undefined
          }
          onSortToggle={() =>
            setParams(
              isReview || isMismatch
                ? { sort: sort === "oldest" ? "newest" : null, page: null }
                : { sort: sort === "newest" ? "lowest" : null, page: null },
            )
          }
          onPageChange={(p) => setParams({ page: p === 1 ? null : String(p) })}
        />

        <div className="flex flex-col gap-4" style={{ containerType: "inline-size" }}>
          {!displayedDetail ? (
            <div className="card flex flex-col items-center gap-1 p-12 text-center">
              <b className="text-text-strong">
                {isReview ? "Select a case" : isMismatch ? "Select a mismatch" : "Select an email"}
              </b>
              <span className="cap">
                {isReview
                  ? "The reason and your options show up here."
                  : isMismatch
                    ? "The differing fields and the email to the sender show up here."
                    : "Its analysis and content show up here."}
              </span>
            </div>
          ) : (
            <>
              <DetailHeader
                email={displayedDetail}
                tab={detailTab}
                onTabChange={setDetailTab}
                onRetry={onRetry}
                retrying={retrying}
                hideComparisonActions={isMismatch}
                extraActions={
                  isMismatch && selectedProcessedId ? (
                    <>
                      <button type="button" className="btn ghost" onClick={() => setShowPreview(true)}>
                        <Eye size={16} strokeWidth={1.75} aria-hidden />
                        Preview
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={emailing || sentIds.has(selectedProcessedId)}
                        title={sentIds.has(selectedProcessedId) ? "Only one reply is sent per email" : undefined}
                        onClick={() => emailMismatches({ ids: [selectedProcessedId] })}
                      >
                        <Mail size={16} strokeWidth={1.75} aria-hidden />
                        {sentIds.has(selectedProcessedId) ? "Email sent" : "Email sender"}
                      </button>
                    </>
                  ) : undefined
                }
              />
              {detailLoading ? (
                <div className="card p-8 text-center text-text-muted">Loading…</div>
              ) : needsContent && contentLoading ? (
                <div className="card p-8 text-center text-text-muted">Loading email content…</div>
              ) : detailTab === "email" ? (
                <EmailView
                  email={displayedDetail}
                  onOpenAttachment={(id) => {
                    setAttachmentId(id);
                    setDetailTab("attachments");
                  }}
                />
              ) : detailTab === "attachments" ? (
                <AttachmentsView
                  email={displayedDetail}
                  selectedId={attachmentId}
                  onSelect={setAttachmentId}
                  onBackToEmail={() => setDetailTab("email")}
                />
              ) : displayedDetail.result === "needs_review" ? (
                <ReviewView key={displayedDetail.id} email={displayedDetail} onResolved={onResolved} />
              ) : displayedDetail.result === "mismatch" || displayedDetail.result === "no_mismatch" ? (
                <ComparisonView email={displayedDetail} />
              ) : displayedDetail.result === "failed" ? (
                <FailedView email={displayedDetail} onRetry={onRetry} retrying={retrying} />
              ) : displayedDetail.result === "not_compared" ? (
                <NotComparedView email={displayedDetail} />
              ) : (
                <PendingView />
              )}
            </>
          )}
        </div>
      </div>
      {showPreview && <MismatchPreview email={displayedDetail} onClose={() => setShowPreview(false)} />}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone?: "teal" | "orange" | "coral";
}) {
  const toneClass =
    tone === "teal"
      ? "text-status-match"
      : tone === "orange"
        ? "text-status-review"
        : tone === "coral"
          ? "text-status-mismatch"
          : "text-text-strong";
  return (
    <div className="card kpi">
      <div className="text-[13px] text-text-strong">{label}</div>
      <div className={`mt-1.5 text-[30px] leading-[1.2] font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-[12.5px] text-text-muted">{sub}</div>
    </div>
  );
}

function tabCount(stats: BatchStats | null, key: Tab): number {
  if (!stats) return 0;
  switch (key) {
    case "all":
      return stats.total;
    case "comparison":
      return stats.comparison;
    case "review":
      return stats.needsReview;
    case "mismatch":
      return 0;
    case "low":
      return stats.belowThreshold;
    case "failed":
      return stats.failed;
  }
}
