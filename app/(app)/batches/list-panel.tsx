"use client";

import { ArrowUpDown, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { CategoryChip, ResultBadge } from "@/components/ui";
import { fmtShort } from "@/lib/batches/format";
import { PAGE_SIZE, type Sort } from "@/lib/batches/queries";
import type { BatchEmail } from "@/lib/batches/types";
import { REVIEW_REASON_TEXT } from "@/lib/batches/map-labels";

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
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE;

  return (
    <section className="card overflow-hidden" aria-label="Emails">
      <div className="flex items-center justify-between gap-2 px-4.5 py-3.5">
        <b className="font-semibold">
          {total.toLocaleString("en-US")} {total === 1 ? "email" : "emails"}
        </b>
        <button
          type="button"
          onClick={onSortToggle}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-text-muted hover:bg-surface-inset hover:text-text-strong"
        >
          <ArrowUpDown size={13} strokeWidth={1.75} aria-hidden />
          {sort === "newest" ? "Newest first" : "Lowest confidence first"}
        </button>
      </div>

      {!loading && rows.length === 0 ? (
        <div className="border-t border-border px-5.5 py-9 text-center text-text-muted">
          <b className="mb-1 block text-text-strong">No emails match</b>
          Try another filter or clear the search.
        </div>
      ) : (
        rows.map((e) => {
          const sel = e.id === selectedId;
          const hint = reviewHint(e);
          return (
            <button
              key={e.id}
              type="button"
              aria-current={sel}
              onClick={() => onSelect(e.id)}
              className={`relative flex w-full flex-col gap-0.5 border-t border-border px-4.5 py-3.5 pl-5 text-left ${sel ? "bg-surface-inset" : "hover:bg-surface-inset"}`}
            >
              {sel && (
                <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
              )}
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${e.isUnread ? "bg-accent" : "bg-transparent"}`}
                />
                <span className="truncate text-[14.5px] font-semibold">
                  {e.subject}
                </span>
              </span>
              <span className="flex justify-between gap-2.5 pl-3.5 text-xs text-text-muted">
                <span className="truncate">{e.fromAddress}</span>
                <span className="shrink-0">{fmtShort(e.receivedAt)}</span>
              </span>
              <span
                className={`truncate pl-3.5 text-xs ${hint ? "text-text-muted" : "text-text-subtle"}`}
              >
                {hint ?? e.snippet ?? ""}
              </span>
              <span className="flex flex-wrap items-center gap-2 pl-3.5 pt-1 text-xs">
                {e.category ? (
                  <CategoryChip category={e.category} />
                ) : e.result === "pending" ? (
                  <span className="badge queue">
                    <Clock3 size={13} strokeWidth={1.75} aria-hidden />
                    Queued for classification
                  </span>
                ) : (
                  <span className="text-text-muted">n/a</span>
                )}
                {e.result !== "pending" && <ResultBadge result={e.result} />}
              </span>
            </button>
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

function pageNumbers(page: number, pages: number): number[] {
  const lo = Math.max(1, Math.min(page - 1, pages - 3));
  const hi = Math.min(pages, lo + 3);
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) out.push(p);
  return out;
}
