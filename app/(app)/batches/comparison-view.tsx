"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Confidence, ResultBadge } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { FIELD_LABEL } from "@/lib/mock/data";
import { orderedFields, mismatchSummary, matchSummary } from "@/lib/batches/comparison-report";
import { diffField, displayValue, type DiffSegment } from "@/lib/batches/word-diff";
import type { BatchEmail } from "@/lib/batches/types";
import type { FieldComparison } from "@/lib/types";

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

function renderSegments(segments: DiffSegment[]): ReactNode {
  if (segments.length === 0) return "—";
  return segments.map((s, i) => (
    <span key={i}>
      {i > 0 && " "}
      {s.differs ? <mark className="diff-mark">{s.text}</mark> : s.text}
    </span>
  ));
}

function ValueCell({ value, match, diff }: { value: string | number | null; match: boolean; diff: DiffSegment[] }) {
  const text = displayValue(value);
  if (match) return <>{text || "—"}</>;
  return <>{renderSegments(diff)}</>;
}

export function ComparisonView({ email }: { email: BatchEmail }) {
  const fields = orderedFields(email.fields ?? []);
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
            <div className="text-text-strong">{fields.length > 0 ? (bad ? mismatchSummary(fields) : matchSummary(fields)) : "No field-level comparison is available for this email."}</div>
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
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const diff = f.match ? { si: [], bl: [] } : diffField(f.si, f.bl);
                  return (
                    <tr key={f.field} style={!f.match ? { background: "var(--status-mismatch-soft)" } : undefined}>
                      <td>
                        <div className="font-medium">{FIELD_LABEL[f.field]}</div>
                        {f.blLabel && <div className="cap">BL calls it &ldquo;{f.blLabel}&rdquo;</div>}
                      </td>
                      <td><ValueCell value={f.si} match={f.match} diff={diff.si} /></td>
                      <td><ValueCell value={f.bl} match={f.match} diff={diff.bl} /></td>
                      <td>
                        {f.match ? (
                          <span className="inline-flex items-center gap-1.5 text-status-match">
                            <CheckCircle2 {...ICON} />
                            <span className="lbl text-[13px]" style={{ color: "var(--status-match)" }}>Match</span>
                          </span>
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
            Overall confidence is the lowest confidence across all fields. Anything under {AUTO_ACCEPT_THRESHOLD}% is sent for review.
          </p>
        </>
      )}
    </div>
  );
}

/** Shapes the per-field export row: explicit SI value, BL value and result
 * (rather than dumping BatchEmail's internal `match` boolean as-is). */
function exportFieldRow(f: FieldComparison) {
  return {
    field: FIELD_LABEL[f.field],
    si: f.si,
    bl: f.bl,
    result: f.match ? "match" : "mismatch",
    ...(f.blLabel ? { blLabel: f.blLabel } : {}),
  };
}

export function ComparisonActions({ email }: { email: BatchEmail }) {
  function exportResult() {
    const payload = {
      id: email.id,
      subject: email.subject,
      fromAddress: email.fromAddress,
      receivedAt: email.receivedAt,
      category: email.category,
      result: email.result,
      confidence: email.confidence,
      fields: orderedFields(email.fields ?? []).map(exportFieldRow),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
