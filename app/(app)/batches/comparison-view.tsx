"use client";

import { AlertTriangle, CheckCircle2, File } from "lucide-react";
import { toast } from "sonner";
import { CategoryChip, Confidence, ResultBadge } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD, confidenceLevel } from "@/lib/confidence";
import { FIELD_LABEL } from "@/lib/labels";
import type { BatchEmail } from "@/lib/batches/types";

// Moved from app/(app)/emails/[emailId]/page.tsx's Report()/Verdict(), adapted
// to a single-email prop (no PageHeader/Breadcrumb — the parent workspace's
// shared detail header covers that) and to BatchEmail's field names.
const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

function fmt(v: string | number | null) {
  if (v === null) return "Missing";
  return typeof v === "number" ? v.toLocaleString("en-US") : v;
}

export function ComparisonView({ email }: { email: BatchEmail }) {
  const fields = email.fields ?? [];
  const differing = fields.filter((f) => !f.match);
  const flagged = email.evidence?.flagged;
  const bad = email.result === "mismatch";

  return (
    <div className="flex flex-col gap-4">
      <div
        className="card flex items-center justify-between gap-4 border-transparent px-6 py-5"
        style={{ background: bad ? "var(--status-mismatch-soft)" : "var(--status-match-soft)" }}
      >
        <div className={`flex items-center gap-3 ${bad ? "text-status-mismatch" : "text-status-match"}`}>
          {bad ? <AlertTriangle size={24} strokeWidth={1.75} aria-hidden /> : <CheckCircle2 size={24} strokeWidth={1.75} aria-hidden />}
          <div>
            <div className="title text-base">{bad ? "Mismatch found" : "No mismatch detected"}</div>
            <div className="text-text-strong">
              {bad ? (
                <>
                  {email.defectFields.length} of 7 fields differ: {email.defectFields.map((f) => FIELD_LABEL[f].toLowerCase()).join(", ")}
                  {differing.length === 1 && differing[0] && (
                    <>, <b>SI: {fmt(differing[0].si)} / BL: {fmt(differing[0].bl)}</b></>
                  )}
                </>
              ) : (
                "All 7 fields match between the Shipping Instruction and the draft BL."
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="lbl">Overall confidence</span>
          <Confidence score={email.confidence} showLabel />
        </div>
      </div>

      {fields.length > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>SI (reference)</th>
                  <th>Draft BL</th>
                  <th>Confidence</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const low = f.confidence !== null && confidenceLevel(f.confidence) !== "high";
                  return (
                    <tr key={f.field} style={!f.match ? { background: "var(--status-mismatch-soft)" } : undefined}>
                      <td>
                        <div className="font-medium">{FIELD_LABEL[f.field]}</div>
                        {f.blLabel && <div className="cap">BL calls it &ldquo;{f.blLabel}&rdquo;</div>}
                      </td>
                      <td>{f.match ? fmt(f.si) : <b>{fmt(f.si)}</b>}</td>
                      <td>{f.match ? fmt(f.bl) : <b className="text-status-mismatch">{fmt(f.bl)}</b>}</td>
                      <td><Confidence score={f.confidence} /></td>
                      <td>
                        {f.match ? (
                          <span className="inline-flex items-center gap-1.5 text-status-match">
                            <CheckCircle2 {...ICON} />
                            <span className="lbl text-[13px]" style={{ color: "var(--status-match)" }}>Match</span>
                          </span>
                        ) : low && f.confidence !== null && f.confidence < AUTO_ACCEPT_THRESHOLD && email.result === "needs_review" ? (
                          <ResultBadge result="needs_review" />
                        ) : (
                          <ResultBadge result="mismatch" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="cap">
            Overall confidence is the lowest field confidence. Anything under {AUTO_ACCEPT_THRESHOLD}% is sent to the review queue.
          </p>
        </>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card flex flex-col gap-3 p-5">
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
            Classified with {email.classificationConfidence}% confidence as a document-comparison request
            {fields.length > 0 ? ", so both attachments were read and compared." : "."}
          </p>
        </div>

        {email.evidence && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="title">Source evidence</h2>
              <p className="cap">Where the flagged values were read.</p>
            </div>
            <div className="lbl bg-surface-inset px-5 py-3">Shipping Instruction</div>
            <div className="mono px-5 py-3">
              {email.evidence.si.map((l) => <div key={l}>{l}</div>)}
            </div>
            <div className="lbl bg-surface-inset px-5 py-3">Draft Bill of Lading</div>
            <div className="mono px-5 py-3">
              {email.evidence.bl.map((l, i) => (
                <div key={l}>
                  {i === 0 && flagged ? (
                    <span className="rounded-sm px-1" style={{ background: "var(--status-mismatch-soft)" }}>{l}</span>
                  ) : (
                    l
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ComparisonActions({ email }: { email: BatchEmail }) {
  function exportResult() {
    const blob = new Blob([JSON.stringify(email, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${email.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        onClick={() => toast.success("Sent to review", { description: email.subject })}
      >
        Send to review
      </button>
      <button type="button" className="btn primary" onClick={exportResult}>
        Export result
      </button>
    </>
  );
}
