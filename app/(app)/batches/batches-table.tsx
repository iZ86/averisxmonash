"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { CategoryChip, Confidence, ResultBadge } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import type { EmailResult, EmailStatus } from "@/lib/types";

type Filter = "all" | "comparison" | "review" | "low" | "failed";
type Counts = Record<Filter, number>;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "comparison", label: "Comparison" },
  { key: "review", label: "Needs review" },
  { key: "low", label: "Low confidence" },
  { key: "failed", label: "Failed" },
];

const STATUS_LABEL: Record<EmailStatus, string> = {
  processed: "Processed",
  processing: "Processing…",
  failed: "Failed",
  classified: "Classified",
  in_review: "In review",
};

const PAGE_SIZE = 9;

function matches(e: EmailResult, f: Filter) {
  switch (f) {
    case "comparison":
      return e.category === "document_comparison";
    case "review":
      return e.result === "needs_review";
    case "low":
      return e.confidence !== null && e.confidence < AUTO_ACCEPT_THRESHOLD;
    case "failed":
      return e.status === "failed";
    default:
      return true;
  }
}

function href(e: EmailResult) {
  return `/emails/${e.emailId}`;
}

export function BatchesTable({ emails, counts, total }: { emails: EmailResult[]; counts: Counts; total: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails.filter(
      (e) => matches(e, filter) && (!q || e.subject.toLowerCase().includes(q) || e.sender.toLowerCase().includes(q)),
    );
  }, [emails, filter, query]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  function retry(e: EmailResult) {
    // No processing endpoint exists yet; this only reflects the request in the UI.
    setRetrying((s) => new Set(s).add(e.emailId));
    toast.message("Retry requested", { description: e.subject });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="seg" role="group" aria-label="Filter emails">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              className={filter === key ? "on" : undefined}
              onClick={() => {
                setFilter(key);
                setPage(0);
              }}
            >
              {label} {counts[key].toLocaleString()}
            </button>
          ))}
        </div>
        <label className="input w-full sm:w-[300px]">
          <Search size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search subject or sender"
            aria-label="Search subject or sender"
            className="w-full bg-transparent outline-none"
          />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th>Category</th>
              <th>Confidence</th>
              <th>Result</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const isRetrying = retrying.has(e.emailId);
              const status: EmailStatus = isRetrying ? "processing" : e.status;
              const linked = e.category !== "spam" && e.category !== "new_si_request" && e.result !== "failed";
              return (
                <tr key={e.emailId}>
                  <td>
                    {linked ? (
                      <Link href={e.result === "needs_review" ? "/review" : href(e)} className="cell-link">
                        {e.subject}
                      </Link>
                    ) : (
                      <span className="font-medium">{e.subject}</span>
                    )}
                    <div className="cap">{e.sender}</div>
                  </td>
                  <td><CategoryChip category={e.category} /></td>
                  <td><Confidence score={e.confidence ?? (e.result === "not_compared" ? e.classificationConfidence : null)} /></td>
                  <td><ResultBadge result={e.result} /></td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span className="cap text-[13px]">{STATUS_LABEL[status]}</span>
                      {e.status === "failed" && (
                        <button type="button" className="btn ghost sm" disabled={isRetrying} onClick={() => retry(e)}>
                          <RefreshCw size={14} strokeWidth={1.75} aria-hidden className={isRetrying ? "animate-spin" : undefined} />
                          {isRetrying ? "Retrying…" : "Retry"}
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="cap">{e.receivedAt}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="cap py-10 text-center">No emails match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row justify-between">
        <span className="cap">
          Showing {visible.length} of {(filter === "all" && !query ? total : rows.length).toLocaleString()} · confidence is the system&apos;s certainty in its own result
        </span>
        <div className="row gap-2">
          <button type="button" className="btn ghost sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
          <button type="button" className="btn ghost sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Next</button>
        </div>
      </div>
    </>
  );
}
