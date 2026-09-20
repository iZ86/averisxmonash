"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { fmtRel } from "@/lib/batches/format";
import {
  TABS,
  type Sort,
  type Tab,
  getBatchEmailContent,
  getBatchEmailDetail,
  getBatchStats,
  getLastSyncedAt,
  getPendingQueueCount,
  getSyncStatus,
  listBatchEmails,
  markEmailRead,
  type BatchStats,
} from "@/lib/batches/queries";
import type { BatchEmail } from "@/lib/batches/types";
import { ListPanel } from "./list-panel";
import { DetailHeader, type DetailTab } from "./detail-header";
import { ComparisonView } from "./comparison-view";
import { ReviewView } from "./review-view";
import {
  PendingView,
  NotComparedView,
  FailedView,
  EmailView,
} from "./other-views";

const isTab = (v: string | null): v is Tab =>
  !!v && TABS.some((t) => t.key === v);
const isSort = (v: string | null): v is Sort =>
  v === "newest" || v === "lowest";

function defaultDetailTab(): DetailTab {
  return "analysis";
}

export function BatchesWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const tab: Tab = isTab(params.get("tab"))
    ? (params.get("tab") as Tab)
    : "all";
  const sort: Sort = isSort(params.get("sort"))
    ? (params.get("sort") as Sort)
    : "newest";
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
  const listKeyFor = (t: Tab, search: string, s: Sort, p: number) =>
    `${t}|${search}|${s}|${p}`;
  const [rows, setRows] = useState<BatchEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [listKey, setListKey] = useState("");
  const listLoading = listKey !== listKeyFor(tab, q, sort, page);

  const [stats, setStats] = useState<BatchStats | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [detail, setDetail] = useState<BatchEmail | null>(null);
  const [contentLoadedFor, setContentLoadedFor] = useState<string | null>(null);
  const detailLoading = !!selectedId && detail?.id !== selectedId;
  const [detailTab, setDetailTab] = useState<DetailTab>("analysis");
  const contentLoading =
    detailTab === "email" && contentLoadedFor !== selectedId;

  function setParams(
    next: Record<string, string | null>,
    opts: { replace?: boolean } = {},
  ) {
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
      getBatchStats(supabase),
      getLastSyncedAt(supabase),
    ]);
    setStats(s);
    setLastSyncedAt(synced);
  }, [supabase]);

  const refreshList = useCallback(async () => {
    try {
      const { rows: r, total: t } = await listBatchEmails(supabase, {
        tab,
        search: q,
        sort,
        page,
      });
      setRows(r);
      setTotal(t);
      setListKey(listKeyFor(tab, q, sort, page));
    } catch (err) {
      toast.error("Could not load emails.", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [supabase, tab, q, sort, page]);

  // Mount/dependency-driven fetches: inlined (not via the callbacks above) so
  // the state updates are visibly inside a .then() chain in the effect body.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getBatchStats(supabase), getLastSyncedAt(supabase)]).then(
      ([s, synced]) => {
        if (cancelled) return;
        setStats(s);
        setLastSyncedAt(synced);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [supabase]);

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
    const key = listKeyFor(tab, q, sort, page);
    listBatchEmails(supabase, { tab, search: q, sort, page })
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
  }, [supabase, tab, q, sort, page]);

  // Debounce the search box into the URL's `q` param.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setParams({ q: value || null, page: null }),
      300,
    );
  }

  // Auto-select the first row once the list loads with nothing selected (or the
  // selection fell off the current page/filter).
  useEffect(() => {
    if (listLoading) return;
    if (rows.length === 0) {
      if (selectedId) setParams({ email: null });
      return;
    }
    if (!selectedId || !rows.some((r) => r.id === selectedId)) {
      setParams({ email: rows[0].id });
    }
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
          setDetailTab(defaultDetailTab());
          if (e.isUnread) {
            markEmailRead(supabase, e.id).then(() => {
              setRows((prev) =>
                prev.map((r) =>
                  r.id === e.id ? { ...r, isUnread: false } : r,
                ),
              );
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
    if (!selectedId || detailTab !== "email" || contentLoadedFor === selectedId)
      return;
    let cancelled = false;
    getBatchEmailContent(supabase, selectedId)
      .then((content) => {
        if (cancelled) return;
        setDetail((current) =>
          current?.id === selectedId ? { ...current, ...content } : current,
        );
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
  }, [supabase, selectedId, detailTab, contentLoadedFor]);

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
            description:
              "Ask an admin to reconnect the Gmail integration (GOOGLE_REFRESH_TOKEN).",
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

  function onResolved() {
    if (!selectedId) return;
    // Client-local only today: nothing about a manual correction is persisted
    // yet (no per-field value storage exists — see the "field values" gap
    // noted in the implementation summary). Advance to the next case so the
    // reviewer can keep moving, matching the old Review queue's behaviour.
    const remaining = rows.filter((r) => r.id !== selectedId);
    setRows(remaining);
    setParams({ email: remaining[0]?.id ?? null });
  }

  const belowCount = stats?.belowThreshold ?? 0;
  const resolvedCount = 0; // no persistence for resolutions yet — see onResolved
  const displayedDetail = selectedId ? detail : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <div className="eyebrow">Batches</div>
          <h1 className="h1">Batches</h1>
          <p className="p">
            Every stored email with its category, confidence and result. Cases
            the system could not decide are marked Needs review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn ghost shadow-sm hover:border-border-control hover:shadow"
              disabled={syncing}
              onClick={onSync}
            >
              <RefreshCw
                size={16}
                strokeWidth={1.75}
                aria-hidden
                className={syncing ? "animate-spin" : undefined}
              />
              {syncing ? "Syncing…" : "Sync emails"}
            </button>
            <Link href="/upload" className="btn accent shadow-sm hover:shadow">
              <Upload size={16} strokeWidth={1.75} aria-hidden />
              Upload data
            </Link>
          </div>
          <p className="cap" aria-live="polite">
            {syncing
              ? "Fetching new emails from Gmail…"
              : lastSyncedAt
                ? `Showing stored emails. Last synced ${fmtRel(lastSyncedAt)}.`
                : "No emails synced yet."}
          </p>
        </div>
      </div>

      <section
        className="grid grid-cols-2 gap-4 lg:grid-cols-5"
        aria-label="Batch summary"
      >
        <Kpi
          label="Emails in batch"
          value={(stats?.total ?? 0).toLocaleString("en-US")}
          sub="Stored from Gmail"
        />
        <Kpi
          label="Average confidence"
          value={
            stats?.avgConfidence == null ? "n/a" : `${stats.avgConfidence}%`
          }
          sub="Across all results"
          tone="teal"
        />
        <Kpi
          label={`Below ${AUTO_ACCEPT_THRESHOLD}% confidence`}
          value={belowCount}
          sub={`${resolvedCount} resolved · ${stats?.needsReview ?? 0} open`}
          tone="orange"
        />
        <Kpi
          label="Needs review"
          value={stats?.needsReview ?? 0}
          sub="Waiting for a person"
          tone="orange"
        />
        <Kpi
          label="Failed"
          value={stats?.failed ?? 0}
          sub="Retry available"
          tone="coral"
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
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
        <label className="input relative min-w-[260px] flex-1 max-w-[360px]">
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className="text-text-subtle"
          />
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
          onSortToggle={() =>
            setParams({ sort: sort === "newest" ? "lowest" : null, page: null })
          }
          onPageChange={(p) => setParams({ page: p === 1 ? null : String(p) })}
        />

        <div
          className="flex flex-col gap-4"
          style={{ containerType: "inline-size" }}
        >
          {!displayedDetail ? (
            <div className="card flex flex-col items-center gap-1 p-12 text-center">
              <b className="text-text-strong">Select an email</b>
              <span className="cap">
                Its analysis and content show up here.
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
              />
              {detailLoading ? (
                <div className="card p-8 text-center text-text-muted">
                  Loading…
                </div>
              ) : detailTab === "email" && contentLoading ? (
                <div className="card p-8 text-center text-text-muted">
                  Loading email content…
                </div>
              ) : detailTab === "email" ? (
                <EmailView email={displayedDetail} />
              ) : displayedDetail.result === "needs_review" ? (
                <ReviewView email={displayedDetail} onResolved={onResolved} />
              ) : displayedDetail.result === "mismatch" ||
                displayedDetail.result === "no_mismatch" ? (
                <ComparisonView email={displayedDetail} />
              ) : displayedDetail.result === "failed" ? (
                <FailedView
                  email={displayedDetail}
                  onRetry={onRetry}
                  retrying={retrying}
                />
              ) : displayedDetail.result === "not_compared" ? (
                <NotComparedView email={displayedDetail} />
              ) : (
                <PendingView />
              )}
            </>
          )}
        </div>
      </div>
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
      <div
        className={`mt-1.5 text-[30px] leading-[1.2] font-semibold tabular-nums ${toneClass}`}
      >
        {value}
      </div>
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
    case "low":
      return stats.belowThreshold;
    case "failed":
      return stats.failed;
  }
}
