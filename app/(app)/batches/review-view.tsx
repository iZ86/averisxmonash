"use client";

import Link from "next/link";
import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Confidence, ConfidenceStat } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { FIELD_LABEL } from "@/lib/mock/data";
import type { BatchEmail } from "@/lib/batches/types";
import { REVIEW_REASON_TEXT } from "@/lib/batches/map-labels";

// Moved from app/(app)/review/review-queue.tsx, adapted to operate on a single
// selected email (the parent workspace now owns the list/selection) instead of
// its own case list. The flagged-field correction form only ever renders once a
// classification pipeline records per-field evidence (see BatchEmail.fields) —
// today real cases always take the "missing input" branch below, same as the
// original component did for its no-evidence cases.
const SKELETON = [62, 88, 74];
const SKELETON_AFTER = [55, 81];

export function ReviewView({ email, onResolved }: { email: BatchEmail; onResolved: (message: string) => void }) {
  const flagged = email.fields?.find((f) => f.field === email.evidence?.flagged);
  const [draft, setDraft] = useState<Record<string, string>>({});

  function resolve(message: string) {
    toast.success(message, { description: email.subject });
    onResolved(message);
  }

  const reasonText = flagged
    ? `${FIELD_LABEL[flagged.field]} could not be verified with enough certainty, so no result was guessed. Auto-accept needs at least ${AUTO_ACCEPT_THRESHOLD}%.`
    : `${email.reviewReasonRaw ? REVIEW_REASON_TEXT[email.reviewReasonRaw] : "The comparison could not be made"}. No result was guessed. Auto-accept needs at least ${AUTO_ACCEPT_THRESHOLD}%.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex items-start gap-3 border-transparent px-6 py-5 text-status-review" style={{ background: "var(--accent-soft)" }}>
        <Flag size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
        <div>
          <div className="title text-base">Why this needs a person</div>
          <div className="text-text-strong">{reasonText}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {email.confidence !== null ? (
          <ConfidenceStat label="Overall confidence" score={email.confidence} />
        ) : (
          <div className="card stat">
            <span className="lbl">Overall confidence</span>
            <span className="text-[30px] leading-9 font-semibold text-text-subtle">n/a</span>
            <span className="cap">Nothing to score</span>
          </div>
        )}
        {flagged?.confidence != null && <ConfidenceStat label={`${FIELD_LABEL[flagged.field]} read`} score={flagged.confidence} />}
        {email.classificationConfidence !== null && (
          <ConfidenceStat label="Email classification" score={email.classificationConfidence} />
        )}
      </div>

      {flagged && email.evidence ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="title">Source evidence</h2>
              <p className="cap">{email.attachments[1]?.filename ?? "Draft BL"}</p>
            </div>
            <div className="flex flex-col gap-2.5 bg-surface-inset p-6">
              {SKELETON.map((w) => (
                <div key={w} className="h-2.5 rounded-sm bg-border-control opacity-50" style={{ width: `${w}%` }} />
              ))}
              <div className="mono rounded-md border-2 border-accent px-3 py-2.5" style={{ background: "var(--accent-soft)" }}>
                {email.evidence.bl.join(" · ")}
              </div>
              {SKELETON_AFTER.map((w) => (
                <div key={w} className="h-2.5 rounded-sm bg-border-control opacity-50" style={{ width: `${w}%` }} />
              ))}
            </div>
            <div className="cap px-5 py-3">Highlighted area is where the value was expected.</div>
          </div>

          <div className="card flex flex-col gap-4 p-5">
            <h2 className="title">{FIELD_LABEL[flagged.field]}</h2>
            <div>
              <div className="lbl">Shipping Instruction (reference)</div>
              <div className="text-lg font-semibold">{flagged.si?.toLocaleString("en-US") ?? "Missing"}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="lbl" htmlFor="bl-value">Draft BL, as you read it</label>
              <div className="input justify-between">
                <input
                  id="bl-value"
                  className="w-full bg-transparent outline-none"
                  value={draft[email.id] ?? String(flagged.bl ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [email.id]: e.target.value }))}
                />
                {flagged.confidence != null && <Confidence score={flagged.confidence} />}
              </div>
              <span className="cap">
                Best guess by the system{flagged.confidence != null ? `, ${flagged.confidence}% sure` : ""}. Please check it against the source.
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn accent" onClick={() => resolve("Report updated")}>
                Confirm and update report
              </button>
              <button type="button" className="btn ghost" onClick={() => resolve("Marked as a real difference")}>
                Value is different
              </button>
              <button type="button" className="cap text-center underline" onClick={() => resolve("New copy requested")}>
                Or mark the BL as unreadable to request a new copy.
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="title">Missing input</h2>
          <p className="p">There is no value to compare, so nothing was guessed. Ask the sender for the missing document.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn accent" onClick={() => resolve("New copy requested")}>
              Request a new copy
            </button>
            <Link className="btn ghost" href={`/batches?email=${email.id}&tab=all`}>Open the email</Link>
          </div>
        </div>
      )}
    </div>
  );
}
