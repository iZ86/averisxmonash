"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SI_FIELDS, blankSiValues, buildBlText, type SiField, type SiValues } from "@/lib/instruction-requests/bl-text";
import { REVIEW_FIELD_LABEL } from "@/lib/batches/review-cases";
import type { BatchEmail } from "@/lib/batches/types";
import { ViewFileButton } from "./file-viewer";

type Loaded = { details: { values: SiValues; blFilename: string | null } | null; emailSent: boolean };

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error ?? `The server returned ${res.status}.`);
  return data;
}

/** An instruction request (SI_REQUEST email): the Shipping Instruction's 7 values, a BL.txt built from them,
 * and a button that stores that file and replies to the sender with it attached. */
export function SiRequestView({ email, onSent }: { email: BatchEmail; onSent: () => void }) {
  const processedId = email.processedId;
  const [loaded, setLoaded] = useState<Loaded | "loading" | { error: string }>("loading");
  const [values, setValues] = useState<SiValues>(blankSiValues);
  const [busy, setBusy] = useState<"extract" | "send" | null>(null);

  const apply = useCallback((result: Loaded) => {
    setLoaded(result);
    if (result.details) setValues(result.details.values);
  }, []);

  useEffect(() => {
    if (!processedId) return;
    let cancelled = false;
    call(`/api/instruction-requests?processedEmailId=${processedId}`)
      .then((r) => !cancelled && apply({ details: r.details, emailSent: r.emailSent }))
      .catch((err) => !cancelled && setLoaded({ error: err instanceof Error ? err.message : String(err) }));
    return () => {
      cancelled = true;
    };
  }, [processedId, apply]);

  if (!processedId) {
    return <div className="card p-5"><p className="cap">This email has not been analysed yet.</p></div>;
  }
  if (loaded === "loading") {
    return (
      <div className="card flex items-center justify-center gap-3 p-8 text-text-muted" role="status">
        <LoaderCircle size={20} strokeWidth={1.75} aria-hidden className="animate-spin" />
        <span className="cap">Loading the shipping instruction…</span>
      </div>
    );
  }
  if ("error" in loaded) {
    return (
      <div className="card p-5">
        <div className="title">Could not load the shipping instruction</div>
        <p className="cap mt-1">{loaded.error}</p>
      </div>
    );
  }

  const { details, emailSent } = loaded;
  const allFilled = SI_FIELDS.every((f) => values[f].trim());
  const text = buildBlText(values);

  async function run(kind: "extract" | "send", task: () => Promise<void>) {
    setBusy(kind);
    try {
      await task();
    } catch (err) {
      toast.error("That did not work.", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const extract = () =>
    run("extract", async () => {
      const r = await call("/api/instruction-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract", processedEmailId: processedId }),
      });
      apply({ details: { values: r.values, blFilename: null }, emailSent });
      toast.success("Shipping instruction read", { description: email.subject });
    });

  const send = () =>
    run("send", async () => {
      const r = await call("/api/instruction-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", processedEmailId: processedId, values }),
      });
      toast.success(`Bill of Lading generated and sent to ${r.sentTo}.`, { description: email.subject });
      apply({ details: { values, blFilename: r.filename }, emailSent: true });
      onSent();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex items-start gap-3 border-transparent px-6 py-5" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
        <FileText size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="title text-base">Instruction request</div>
          <div className="text-text-strong">
            {emailSent
              ? `The Bill of Lading was generated and sent to the sender${details?.blFilename ? ` as ${details.blFilename}` : ""}.`
              : "The sender submitted a Shipping Instruction. Check the values, then generate the Bill of Lading and reply with it."}
          </div>
        </div>
      </div>

      {!details ? (
        <div className="card flex flex-col items-start gap-3 p-5">
          <div>
            <h2 className="title">No shipping instruction values yet</h2>
            <p className="cap">Nothing has been read from this email so far. The system can read the 7 values from its attachments now.</p>
          </div>
          <button type="button" className="btn accent" disabled={busy !== null} onClick={extract}>
            <Sparkles size={16} strokeWidth={1.75} aria-hidden /> {busy === "extract" ? "Reading…" : "Read shipping instruction"}
          </button>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="tbl w-full table-fixed">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[72%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>
                    SI (reference)
                    <ViewFileButton attachments={email.attachments} preferIndex={0} title="Shipping Instruction: attached files" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {SI_FIELDS.map((f: SiField) => {
                  const empty = !values[f].trim();
                  return (
                    <tr key={f} style={empty ? { background: "var(--accent-soft)" } : undefined}>
                      <td className="font-medium">{REVIEW_FIELD_LABEL[f]}</td>
                      <td>
                        <div className="input">
                          <input
                            aria-label={`${REVIEW_FIELD_LABEL[f]} (SI)`}
                            className="w-full bg-transparent outline-none"
                            value={values[f]}
                            disabled={emailSent}
                            placeholder="Missing or unreadable"
                            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {emailSent ? (
              <span className="badge ok">
                <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden /> Bill of Lading sent
              </span>
            ) : (
              <button type="button" className="btn accent" disabled={busy !== null || !allFilled} onClick={send}>
                <Send size={16} strokeWidth={1.75} aria-hidden /> {busy === "send" ? "Sending…" : "Generate and Send Bill of Lading"}
              </button>
            )}
            {!allFilled && <span className="cap">Fill in all 7 values to generate the Bill of Lading.</span>}
          </div>

          <div className="card overflow-hidden">
            <div className="lbl bg-surface-inset px-5 py-3">Bill of Lading preview</div>
            <pre className="mono overflow-x-auto px-5 py-4 whitespace-pre-wrap">{text}</pre>
          </div>
        </>
      )}
    </div>
  );
}
