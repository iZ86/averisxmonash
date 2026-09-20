"use client";

import { File, RefreshCw, XCircle } from "lucide-react";
import { CategoryChip, Confidence } from "@/components/ui";

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

import type { BatchEmail } from "@/lib/batches/types";

/** No processed_emails row yet — synced but never analysed. */
export function PendingView() {
  return (
    <div className="card flex items-start gap-3 border-transparent px-6 py-5" style={{ background: "var(--surface-inset)" }}>
      <RefreshCw size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
      <div>
        <div className="title text-base">Waiting for analysis</div>
        <div className="text-text-strong">
          This email was synced from Gmail and has not been classified yet. Its result will appear here after the next sync.
        </div>
      </div>
    </div>
  );
}

/** A category other than document comparison won — nothing to check against an SI. */
export function NotComparedView({ email }: { email: BatchEmail }) {
  return (
    <div className="card flex flex-col gap-3 p-5" style={{ maxWidth: 560 }}>
      <h2 className="title">This email</h2>
      <div className="row gap-2">
        {email.category && <CategoryChip category={email.category} />}
        <Confidence score={email.classificationConfidence} />
      </div>
      {email.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {email.attachments.map((a) => (
            <span className="chip" key={a.filename}><File {...ICON} /> {a.filename}</span>
          ))}
        </div>
      )}
      <p className="cap">
        Classified with {email.classificationConfidence}% confidence. This type of email is not compared against a shipping instruction.
      </p>
    </div>
  );
}

export function FailedView({ email, onRetry, retrying }: { email: BatchEmail; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="card flex items-start gap-3 border-transparent px-6 py-5" style={{ background: "var(--status-mismatch-soft)" }}>
      <XCircle size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-status-mismatch" />
      <div className="flex-1">
        <div className="title text-base">Processing failed</div>
        <div className="text-text-strong">{email.error ?? "This email could not be processed."}</div>
        <button type="button" className="btn primary mt-3" disabled={retrying} onClick={onRetry}>
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden className={retrying ? "animate-spin" : undefined} />
          {retrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    </div>
  );
}

export function EmailView({ email }: { email: BatchEmail }) {
  return (
    <article className="card flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <span className="avatar">{email.fromAddress.charAt(0).toUpperCase()}</span>
        <div>
          <div className="font-medium">{email.fromAddress}</div>
          <div className="cap">
            to me · {new Date(email.receivedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
      <p className="max-w-[78ch] whitespace-pre-wrap leading-relaxed">{email.body || "(No message content.)"}</p>
      {email.attachments.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="cap">{email.attachments.length} {email.attachments.length === 1 ? "attachment" : "attachments"}</span>
          <div className="flex flex-wrap gap-2">
            {email.attachments.map((a) => (
              <span className="chip" key={a.filename}><File {...ICON} /> {a.filename}</span>
            ))}
          </div>
        </div>
      )}
      <p className="cap">Stored from Gmail. Opening this page reads the stored copy, not Gmail.</p>
    </article>
  );
}
