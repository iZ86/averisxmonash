"use client";

import { fmtFull } from "@/lib/batches/format";
import { CATEGORY_LABEL } from "@/lib/mock/data";
import type { BatchEmail } from "@/lib/batches/types";
import { ComparisonActions } from "./comparison-view";

const STATUS_LABEL: Record<string, string> = {
  pending: "Not analysed yet",
  failed: "Failed",
  not_compared: "Classified",
  needs_review: "In review",
  mismatch: "Processed",
  no_mismatch: "Processed",
};

export type DetailTab = "analysis" | "email";

export function DetailHeader({
  email,
  tab,
  onTabChange,
  onRetry,
  retrying,
}: {
  email: BatchEmail;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const canReview = email.result === "mismatch" || email.result === "no_mismatch";

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl leading-tight font-semibold tracking-tight text-text-strong" style={{ overflowWrap: "anywhere" }}>
            {email.subject}
          </h2>
          <p className="cap mt-1">From {email.fromAddress} · received {fmtFull(email.receivedAt).toLowerCase()}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="chip">{email.category ? CATEGORY_LABEL[email.category] : "Not classified yet"}</span>
            <span className="chip border border-border-control bg-transparent text-text-muted">{STATUS_LABEL[email.result]}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReview && <ComparisonActions email={email} />}
          {email.result === "failed" && (
            <button type="button" className="btn primary" disabled={retrying} onClick={onRetry}>
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      </header>
      <div className="flex gap-5 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "analysis"}
          onClick={() => onTabChange("analysis")}
          className={`-mb-px border-b-2 px-0.5 py-2.5 font-medium ${tab === "analysis" ? "border-accent text-text-strong" : "border-transparent text-text-muted hover:text-text-strong"}`}
        >
          Analysis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "email"}
          onClick={() => onTabChange("email")}
          className={`-mb-px border-b-2 px-0.5 py-2.5 font-medium ${tab === "email" ? "border-accent text-text-strong" : "border-transparent text-text-muted hover:text-text-strong"}`}
        >
          Email{email.attachments.length > 0 && <small className="ml-1 text-text-subtle">{email.attachments.length} {email.attachments.length === 1 ? "attachment" : "attachments"}</small>}
        </button>
      </div>
    </>
  );
}
