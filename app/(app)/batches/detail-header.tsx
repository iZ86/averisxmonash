"use client";

import { fmtFull } from "@/lib/batches/format";
import { isOwnAddress } from "@/lib/batches/constants";
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

export type DetailTab = "analysis" | "email" | "attachments";

export function DetailHeader({
  email,
  tab,
  onTabChange,
  onRetry,
  retrying,
  extraActions,
  hideComparisonActions = false,
}: {
  email: BatchEmail;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onRetry: () => void;
  retrying: boolean;
  /** Extra buttons for the page the header is on (e.g. emailing the sender of a mismatch). */
  extraActions?: React.ReactNode;
  /** The Mismatches page has its own actions, so the Send to review / Export result pair is hidden there. */
  hideComparisonActions?: boolean;
}) {
  // Our own messages are never analysed: no analysis tab, no category/status chips, no retry.
  const ours = isOwnAddress(email.fromAddress);
  const canReview = !ours && (email.result === "mismatch" || email.result === "no_mismatch");

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl leading-tight font-semibold tracking-tight text-text-strong" style={{ overflowWrap: "anywhere" }}>
            {email.subject}
          </h2>
          <p className="cap mt-1">From {email.fromAddress} · received {fmtFull(email.receivedAt).toLowerCase()}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ours ? (
              <span className="chip">Sent by you</span>
            ) : (
              <>
                <span className="chip">{email.category ? CATEGORY_LABEL[email.category] : "Not classified yet"}</span>
                <span className="chip border border-border-control bg-transparent text-text-muted">{STATUS_LABEL[email.result]}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReview && !hideComparisonActions && <ComparisonActions email={email} />}
          {extraActions}
          {!ours && email.result === "failed" && (
            <button type="button" className="btn primary" disabled={retrying} onClick={onRetry}>
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      </header>
      <div className="flex gap-5 border-b border-border" role="tablist">
        {!ours && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "analysis"}
            onClick={() => onTabChange("analysis")}
            className={`-mb-px border-b-2 px-0.5 py-2.5 font-medium ${tab === "analysis" ? "border-accent text-text-strong" : "border-transparent text-text-muted hover:text-text-strong"}`}
          >
            Analysis
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "email"}
          onClick={() => onTabChange("email")}
          className={`-mb-px border-b-2 px-0.5 py-2.5 font-medium ${tab === "email" ? "border-accent text-text-strong" : "border-transparent text-text-muted hover:text-text-strong"}`}
        >
          Email
        </button>
        {email.attachments.length > 0 && (
        <button
          type="button"
          role="tab"
          aria-selected={tab === "attachments"}
          onClick={() => onTabChange("attachments")}
          className={`-mb-px border-b-2 px-0.5 py-2.5 font-medium ${tab === "attachments" ? "border-accent text-text-strong" : "border-transparent text-text-muted hover:text-text-strong"}`}
        >
          Attachments<small className="ml-1 text-text-subtle">{email.attachments.length}</small>
        </button>
        )}
      </div>
    </>
  );
}
