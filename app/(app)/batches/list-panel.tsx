"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Clock3, Flag, Mail, MessagesSquare, Send } from "lucide-react";
import { CategoryChip, ResultBadge } from "@/components/ui";
import { fmtShort } from "@/lib/batches/format";
import { isOwnAddress } from "@/lib/batches/constants";
import { PAGE_SIZE, type Sort } from "@/lib/batches/queries";
import type { BatchEmail } from "@/lib/batches/types";
import { REVIEW_REASON_TEXT } from "@/lib/batches/map-labels";
import { REVIEW_CASES, REVIEW_FIELD_LABEL, isReviewReason, type ReviewField } from "@/lib/batches/review-cases";

function reviewHint(email: BatchEmail) {
  return email.reviewReasonRaw
    ? REVIEW_REASON_TEXT[email.reviewReasonRaw]
    : null;
}

export function ListPanel({
  rows,
  total,
  page,
  sort,
  selectedId,
  loading,
  onSelect,
  onSortToggle,
  onPageChange,
  noun = { one: "email", many: "emails" },
  variant = "all",
  selection,
}: {
  rows: BatchEmail[];
  total: number;
  page: number;
  sort: Sort;
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onSortToggle: () => void;
  onPageChange: (page: number) => void;
  noun?: { one: string; many: string };
  /** "review" is the Review Queue: rows show the review reason instead of the category and result. */
  variant?: "all" | "review" | "mismatch";
  /** Mismatches only: checkboxes for bulk emailing, and which rows have already been emailed. */
  selection?: {
    checked: Set<string>;
    sent: Set<string>;
    onToggle: (processedId: string) => void;
    onToggleAll: (processedIds: string[], on: boolean) => void;
  };
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selectable = rows.filter((r) => r.inFilter !== false).map((r) => r.processedId).filter((id): id is string => !!id);
  const allChecked = !!selection && selectable.length > 0 && selectable.every((id) => selection.checked.has(id));

  return (
    <section className="card overflow-hidden" aria-label="Emails">
      <div className="flex items-center justify-between gap-2 px-4.5 py-3.5">
        <span className="flex items-center gap-2.5">
          {selection && (
            <input
              type="checkbox"
              aria-label="Select all on this page"
              checked={allChecked}
              disabled={selectable.length === 0}
              onChange={(ev) => selection.onToggleAll(selectable, ev.target.checked)}
              className="size-4 cursor-pointer accent-[var(--accent)]"
            />
          )}
          <b className="font-semibold">
            {total.toLocaleString("en-US")} {total === 1 ? noun.one : noun.many}
          </b>
        </span>
        <button
          type="button"
          onClick={onSortToggle}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-text-muted hover:bg-surface-inset hover:text-text-strong"
        >
          <ArrowUpDown size={13} strokeWidth={1.75} aria-hidden />
          {sort === "newest" ? "Newest first" : sort === "oldest" ? "Oldest first" : "Lowest confidence first"}
        </button>
      </div>

      {!loading && rows.length === 0 ? (
        <div className="border-t border-border px-5.5 py-9 text-center text-text-muted">
          <b className="mb-1 block text-text-strong">No {noun.many} match</b>
          Try another filter or clear the search.
        </div>
      ) : (
        threadGroups(rows).map((group) => {
          const threaded = group.length > 1;
          const threadKey = group[0].threadId ?? group[0].id;
          // Collapsing hides the replies but keeps the first email; a reply that is selected keeps the thread open.
          const open = !collapsed.has(threadKey) || group.some((g, gi) => gi > 0 && g.id === selectedId);
          const items = group.map((e, i) => {
          const sel = e.id === selectedId;
          const reply = threaded && i > 0;
          const ours = isOwnAddress(e.fromAddress);
          const inFilter = e.inFilter !== false;
          // Context rows (outside the filter) always show their own category/result, whatever the page.
          const isReviewRow = variant === "review" && inFilter;
          const isMismatchRow = variant === "mismatch" && inFilter;
          const hint = isReviewRow || isMismatchRow ? null : reviewHint(e);
          const isSent = !!e.processedId && !!selection?.sent.has(e.processedId);
          const row = (
            <button
              key={e.id}
              type="button"
              aria-current={sel}
              onClick={() => onSelect(e.id)}
              className={`relative flex w-full flex-col gap-0.5 px-4.5 text-left ${threaded ? "" : "border-t border-border"} ${reply ? "border-t border-border/60 py-2.5" : "py-3.5"} ${isMismatchRow ? (reply ? "pl-12" : "pl-11") : reply ? "pl-9" : "pl-5"} ${sel ? "bg-surface-inset" : ours ? "bg-accent/5 hover:bg-surface-inset" : "hover:bg-surface-inset"} ${inFilter ? "" : "opacity-65"}`}
            >
              {sel && (
                <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
              )}
              {reply ? (
                // Replies are compact: who and when, then a one-line preview.
                <span className="flex min-w-0 items-center justify-between gap-2.5 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${e.isUnread ? "bg-accent" : "bg-transparent"}`} />
                    {ours ? (
                      <span className="flex items-center gap-1 font-semibold text-accent">
                        <Send size={12} strokeWidth={1.75} aria-hidden />
                        You
                      </span>
                    ) : (
                      <span className="truncate font-semibold text-text-strong">{e.fromAddress}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-text-muted">{fmtShort(e.receivedAt)}</span>
                </span>
              ) : (
                <>
                  <span className={`flex min-w-0 items-center gap-2 ${threaded ? "pr-14" : ""}`}>
                    <span className={`size-1.5 shrink-0 rounded-full ${e.isUnread ? "bg-accent" : "bg-transparent"}`} />
                    <span className="truncate text-[14.5px] font-semibold">{e.subject}</span>
                  </span>
                  <span className="flex justify-between gap-2.5 pl-3.5 text-xs text-text-muted">
                    {ours ? (
                      <span className="flex items-center gap-1 font-medium text-accent">
                        <Send size={12} strokeWidth={1.75} aria-hidden />
                        Sent by you
                      </span>
                    ) : (
                      <span className="truncate">{e.fromAddress}</span>
                    )}
                    <span className="shrink-0">{fmtShort(e.receivedAt)}</span>
                  </span>
                </>
              )}
              <span
                className={`truncate pl-3.5 text-xs ${hint ? "text-text-muted" : "text-text-subtle"}`}
              >
                {hint ?? e.snippet ?? ""}
              </span>
              {/* Our own outgoing replies are not classified for the reader: no badges, just the message. */}
              <span className={`${ours ? "hidden" : "flex"} flex-wrap items-center gap-2 pl-3.5 ${reply ? "pt-0.5" : "pt-1"} text-xs`}>
                {isMismatchRow ? (
                  <>
                    {e.defectFields.map((f) => (
                      <span className="badge bad" key={f}>
                        <AlertTriangle size={14} strokeWidth={1.75} aria-hidden />
                        {REVIEW_FIELD_LABEL[f as ReviewField] ?? f}
                      </span>
                    ))}
                    {isSent && (
                      <span className="badge ok">
                        <Mail size={14} strokeWidth={1.75} aria-hidden />
                        Email sent
                      </span>
                    )}
                  </>
                ) : isReviewRow ? (
                  <span className="badge rev">
                    <Flag size={14} strokeWidth={1.75} aria-hidden />
                    {isReviewReason(e.reviewReasonRaw) ? REVIEW_CASES[e.reviewReasonRaw].title : "Needs review"}
                  </span>
                ) : e.category ? (
                  <CategoryChip category={e.category} />
                ) : e.result === "pending" ? (
                  <span className="badge queue">
                    <Clock3 size={13} strokeWidth={1.75} aria-hidden />
                    Queued for classification
                  </span>
                ) : (
                  <span className="text-text-muted">n/a</span>
                )}
                {!isReviewRow && !isMismatchRow && e.result !== "pending" && <ResultBadge result={e.result} />}
              </span>
            </button>
          );
          // Thread siblings outside the current filter are context only: never selectable for bulk email.
          if (!isMismatchRow || !selection || !inFilter) return row;
          // The checkbox sits beside the row button rather than inside it (a button cannot contain a control).
          return (
            <div key={e.id} className="relative">
              {row}
              <input
                type="checkbox"
                aria-label={`Select ${e.subject}`}
                disabled={!e.processedId}
                checked={!!e.processedId && selection.checked.has(e.processedId)}
                onChange={() => e.processedId && selection.onToggle(e.processedId)}
                className={`absolute size-4 cursor-pointer accent-[var(--accent)] ${reply ? "top-3 left-7" : "top-4 left-4.5"}`}
              />
            </div>
          );
          });
          if (!threaded) return items;
          return (
            <div key={threadKey} className="border-t border-border">
              <div className="relative ml-4.5 border-l-2 border-border">
                {open ? items : items[0]}
                {/* Sits in the first email's top-right corner, beside the subject; a sibling of the row button (a button cannot contain a button). */}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={open ? "Collapse thread" : `Show ${group.length - 1} more in thread`}
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(threadKey)) next.add(threadKey);
                      return next;
                    })
                  }
                  className="absolute top-2.5 right-3 flex items-center gap-1 rounded-full border border-border bg-surface-page px-2 py-0.5 text-xs text-text-muted hover:text-text-strong"
                >
                  <MessagesSquare size={13} strokeWidth={1.75} aria-hidden />
                  {group.length}
                  <ChevronDown size={14} strokeWidth={1.75} aria-hidden className={open ? "" : "-rotate-90"} />
                </button>
              </div>
            </div>
          );
        })
      )}

      {total > PAGE_SIZE && (
        <nav
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4.5 py-3 text-xs text-text-muted"
          aria-label="Pagination"
        >
          <span>
            {from + 1}–{Math.min(from + PAGE_SIZE, total)} of{" "}
            {total.toLocaleString("en-US")}
          </span>
          <span className="flex gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
              className="grid size-7 place-items-center rounded-md hover:bg-surface-inset hover:text-text-strong disabled:opacity-35"
            >
              <ChevronLeft size={15} strokeWidth={1.75} aria-hidden />
            </button>
            {pageNumbers(page, pages).map((p) => (
              <button
                key={p}
                type="button"
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPageChange(p)}
                className={`grid size-7 place-items-center rounded-md ${p === page ? "bg-text-strong font-semibold text-surface-page" : "hover:bg-surface-inset hover:text-text-strong"}`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={page === pages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
              className="grid size-7 place-items-center rounded-md hover:bg-surface-inset hover:text-text-strong disabled:opacity-35"
            >
              <ChevronRight size={15} strokeWidth={1.75} aria-hidden />
            </button>
          </span>
        </nav>
      )}
    </section>
  );
}

/** Consecutive rows sharing a threadId form one group (groupByThread already orders them that way). */
function threadGroups(rows: BatchEmail[]): BatchEmail[][] {
  const groups: BatchEmail[][] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (r.threadId && last && last[0].threadId === r.threadId) last.push(r);
    else groups.push([r]);
  }
  return groups;
}

function pageNumbers(page: number, pages: number): number[] {
  const lo = Math.max(1, Math.min(page - 1, pages - 3));
  const hi = Math.min(pages, lo + 3);
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) out.push(p);
  return out;
}
