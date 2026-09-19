"use client";

import Link from "next/link";
import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Confidence, ConfidenceStat } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { FIELD_LABEL } from "@/lib/mock/data";
import type { EmailResult } from "@/lib/types";

const SKELETON = [62, 88, 74];
const SKELETON_AFTER = [55, 81];

export function ReviewQueue({ cases }: { cases: EmailResult[] }) {
  const [open, setOpen] = useState(cases);
  const [selectedId, setSelectedId] = useState(cases[0]?.emailId);
  const selected = open.find((c) => c.emailId === selectedId) ?? open[0];

  const flagged = selected?.fields?.find((f) => f.field === selected.evidence?.flagged);
  const [draft, setDraft] = useState<Record<string, string>>({});

  function resolve(message: string) {
    if (!selected) return;
    toast.success(message, { description: selected.subject });
    const rest = open.filter((c) => c.emailId !== selected.emailId);
    setOpen(rest);
    setSelectedId(rest[0]?.emailId);
  }

  if (!selected) {
    return (
      <div className="card flex flex-col items-center gap-2 p-12 text-center">
        <h2 className="title">Nothing to review</h2>
        <p className="p">Cases below {AUTO_ACCEPT_THRESHOLD}% confidence will appear here.</p>
      </div>
    );
  }

  const reasonText = flagged
    ? `${FIELD_LABEL[flagged.field]} could not be verified with enough certainty, so no result was guessed. Auto-accept needs at least ${AUTO_ACCEPT_THRESHOLD}%.`
    : `${selected.reviewReason}. No result was guessed. Auto-accept needs at least ${AUTO_ACCEPT_THRESHOLD}%.`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="title">{open.length} open cases</h2>
          <span className="cap">Lowest confidence first</span>
        </div>
        {open.map((c) => {
          const on = c.emailId === selected.emailId;
          return (
            <button
              key={c.emailId}
              type="button"
              aria-current={on}
              onClick={() => setSelectedId(c.emailId)}
              className={`flex w-full flex-col gap-1.5 border-t border-border px-5 py-4 text-left ${on ? "bg-surface-inset" : "hover:bg-surface-inset"}`}
            >
              <span className="flex items-center gap-2 font-medium">
                {on && <span className="dot" />} {c.subject}
              </span>
              <span className="cap">{c.reviewReason}</span>
              <span className="flex items-center gap-2">
                <span className="lbl">Confidence</span>
                {c.confidence === null ? <span className="cap">n/a · nothing to score</span> : <Confidence score={c.confidence} showLabel />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        <div className="card flex items-start gap-3 border-transparent px-6 py-5 text-status-review" style={{ background: "var(--accent-soft)" }}>
          <Flag size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          <div>
            <div className="title text-base">Why this needs a person</div>
            <div className="text-text-strong">{reasonText}</div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {selected.confidence !== null ? (
            <ConfidenceStat label="Overall confidence" score={selected.confidence} />
          ) : (
            <div className="card stat">
              <span className="lbl">Overall confidence</span>
              <span className="text-[30px] leading-9 font-semibold text-text-subtle">n/a</span>
              <span className="cap">Nothing to score</span>
            </div>
          )}
          {flagged?.confidence != null && (
            <ConfidenceStat label={`${FIELD_LABEL[flagged.field]} read`} score={flagged.confidence} />
          )}
          <ConfidenceStat label="Email classification" score={selected.classificationConfidence} />
        </div>

        {flagged && selected.evidence ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="title">Source evidence</h2>
                <p className="cap">{selected.attachments?.[1] ?? "Draft BL"}</p>
              </div>
              <div className="flex flex-col gap-2.5 bg-surface-inset p-6">
                {SKELETON.map((w) => (
                  <div key={w} className="h-2.5 rounded-sm bg-border-control opacity-50" style={{ width: `${w}%` }} />
                ))}
                <div className="mono rounded-md border-2 border-accent px-3 py-2.5" style={{ background: "var(--accent-soft)" }}>
                  {selected.evidence.bl.join(" · ")}
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
                    value={draft[selected.emailId] ?? String(flagged.bl ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, [selected.emailId]: e.target.value }))}
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
                <button
                  type="button"
                  className="cap text-center underline"
                  onClick={() => resolve("New copy requested")}
                >
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
              <Link className="btn ghost" href={`/emails/${selected.emailId}`}>Open the email</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
