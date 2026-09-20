"use client";

import { Fragment, useState } from "react";
import type { InboxResult } from "@/lib/email-processing/types";
import { formatResults, topCategory } from "@/lib/upload/format-results";

/** Downloads the results as submission.json. Browser-only: uses document and Blob. */
function downloadResults(results: InboxResult[]) {
  const json = JSON.stringify(formatResults(results), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "submission.json";
  link.click();
  URL.revokeObjectURL(url);
}

const STATUS_STYLES: Record<string, string> = {
  OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  MISMATCH: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function ResultsTable({ results }: { results: InboxResult[] }) {
  // Row indexes whose reasoning is expanded; several can be open at once.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const failedCount = results.filter((r) => !r.ok).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Results ({results.length})
        </h2>
        <button
          type="button"
          onClick={() => downloadResults(results)}
          disabled={failedCount === results.length}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Download JSON
        </button>
      </div>
      {failedCount > 0 && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {failedCount} failed {failedCount === 1 ? "entry is" : "entries are"} not included in the download.
        </p>
      )}
      <p className="text-xs text-zinc-500">Click a row to show or hide the model&apos;s reasoning.</p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {results.map((r, i) => {
              if (!r.ok) {
                return (
                  <tr key={`${r.email_id}-${i}`}>
                    <td className="px-3 py-2 font-mono text-xs">{r.email_id}</td>
                    <td className="px-3 py-2 text-zinc-400" colSpan={2}>
                      Failed
                    </td>
                    <td className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{r.error}</td>
                  </tr>
                );
              }

              const isOpen = expanded.has(i);
              const top = topCategory(r.result);
              const details =
                r.result.status === "MISMATCH"
                  ? r.result.defect_fields.join(", ")
                  : r.result.status === "NEEDS_REVIEW"
                    ? r.result.review_reason
                    : "";

              return (
                <Fragment key={`${r.email_id}-${i}`}>
                  <tr
                    onClick={() => toggle(i)}
                    aria-expanded={isOpen}
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className="mr-1.5 inline-block w-2 text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                      {r.email_id}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {top.category}{" "}
                      <span className="text-zinc-400">{top.confidence_score.toFixed(2)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.result.status]}`}
                      >
                        {r.result.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{details}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                      <td colSpan={4} className="px-3 py-3">
                        <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Model reasoning
                        </p>
                        <p className="whitespace-pre-wrap text-xs leading-5 text-zinc-700 select-text dark:text-zinc-300">
                          {r.result.reasoning}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
