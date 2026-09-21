"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, CheckCircle2, Flag, LoaderCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  REVIEW_CASES,
  REVIEW_FIELDS,
  actionLabel,
  isReviewReason,
  replyContent,
  type FieldValues,
  type ReviewReasonCode,
} from "@/lib/batches/review-cases";
import { REVIEW_REASON_TEXT } from "@/lib/batches/map-labels";
import { DOC_LABEL, blankCells, missingAttachmentRoles } from "@/lib/batches/review-evidence";
import { FIELD_LABEL } from "@/lib/labels";
import type { BatchEmail } from "@/lib/batches/types";
import { FieldTable } from "./field-table";

type Resolution = { decision: "accepted" | "rejected"; action: string };
type Loaded = { defaults: FieldValues | null; resolution: Resolution | null; emailSent: boolean };

const blank = () => Object.fromEntries(REVIEW_FIELDS.map((f) => [f, ""])) as FieldValues;

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error ?? `The server returned ${res.status}.`);
  return data;
}

async function fetchReview(processedId: string): Promise<Loaded | { error: string }> {
  try {
    return await call(`/api/reviews?processedEmailId=${processedId}`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function ReviewView({ email, onResolved }: { email: BatchEmail; onResolved: () => void }) {
  const reason: ReviewReasonCode | null = isReviewReason(email.reviewReasonRaw) ? email.reviewReasonRaw : null;
  const kase = reason ? REVIEW_CASES[reason] : null;

  const [loaded, setLoaded] = useState<Loaded | "loading" | { error: string }>("loading");
  const [mode, setMode] = useState<"accept" | "reject" | null>(null);
  // Cases that can only be rejected (missing attachment / missing value) go straight to the email; the others let the reviewer choose.
  const activeMode = kase && !kase.accept ? "reject" : mode;
  const [fields, setFields] = useState<FieldValues>(blank);
  const [blFields, setBlFields] = useState<FieldValues>(() =>
    Object.fromEntries(REVIEW_FIELDS.map((f) => [f, String(email.fields?.find((x) => x.field === f)?.bl ?? "")])) as FieldValues,
  );
  const [busy, setBusy] = useState(false);

  const processedId = email.processedId;
  const apply = useCallback((result: Loaded | { error: string }) => {
    setLoaded(result);
    if ("defaults" in result && result.defaults) setFields(result.defaults);
  }, []);
  const load = useCallback(async () => {
    if (processedId) apply(await fetchReview(processedId));
  }, [processedId, apply]);

  useEffect(() => {
    if (!processedId) return;
    let cancelled = false;
    fetchReview(processedId).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [processedId, apply]);

  const data = typeof loaded === "object" && "defaults" in loaded ? loaded : null;
  const template = reason ? replyContent({ from: email.fromAddress, subject: email.subject, reason }) : null;
  // The reviewer may edit the subject and body; the recipient is always the original sender.
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const reply = template && { to: template.to, subject: draft?.subject ?? template.subject, body: draft?.body ?? template.body };
  // Maps the two documents onto each other: any blank value on one side is filled from the other. Nothing already typed is overwritten.
  const syncDetails = () => {
    const nextSi = { ...fields };
    const nextBl = { ...blFields };
    for (const f of REVIEW_FIELDS) {
      if (!nextSi[f].trim()) nextSi[f] = blFields[f];
      if (!nextBl[f].trim()) nextBl[f] = fields[f];
    }
    setFields(nextSi);
    setBlFields(nextBl);
  };
  const allFilled = REVIEW_FIELDS.every((f) => fields[f].trim() && blFields[f].trim());

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (err) {
      toast.error("That did not work.", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const post = (payload: object) =>
    call("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

  const saveAccepted = () =>
    run(async () => {
      await post({ processedEmailId: email.processedId, decision: "accepted", fieldValues: fields, blFieldValues: blFields });
      toast.success("Details confirmed and saved", { description: email.subject });
      await load();
      onResolved();
    });

  const saveRejected = () =>
    run(async () => {
      if (!kase || !reply) return;
      const result = await post({ processedEmailId: email.processedId, decision: "rejected", ...(draft ?? {}) });
      toast.success(`Rejected. Reply sent to ${result.sentTo ?? reply.to}.`, { description: email.subject });
      await load();
      onResolved();
    });

  // The decision buttons show once the case has loaded and is unresolved; the SI/BL table follows them.
  const showDecision = Boolean(email.processedId && kase && reason && data && !data.resolution);
  const evidence = (
    <>
      {reason === "missing_attachment" && <MissingDocuments email={email} />}
      {reason === "missing_value" && <BlankValues email={email} />}
      {email.fields && mode !== "accept" && <FieldTable fields={email.fields} attachments={email.attachments} />}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex items-start gap-3 border-transparent px-6 py-5 text-status-review" style={{ background: "var(--accent-soft)" }}>
        <Flag size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="title text-base">Needs review: {kase?.title ?? "The comparison could not be made"}</div>
          <div className="text-text-strong">
            {kase?.problem ?? (email.reviewReasonRaw ? REVIEW_REASON_TEXT[email.reviewReasonRaw] : "The system could not decide this case, so no result was guessed.")}
          </div>
        </div>
      </div>

      {!showDecision && evidence}

      {!email.processedId || !kase || !reason ? (
        <div className="card p-5">
          <p className="cap">This case has no review actions yet. Open the Email tab to read the message.</p>
        </div>
      ) : loaded === "loading" ? (
        <div className="card flex items-center justify-center gap-3 p-8 text-text-muted" role="status">
          <LoaderCircle size={20} strokeWidth={1.75} aria-hidden className="animate-spin" />
          <span className="cap">Loading review details…</span>
        </div>
      ) : !data ? (
        <div className="card p-5">
          <div className="title">Could not load the review details</div>
          <p className="cap mt-1">{(loaded as { error: string }).error}</p>
        </div>
      ) : data.resolution ? (
        <div className="card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            {data.resolution.decision === "rejected" ? <Mail size={18} strokeWidth={1.75} aria-hidden /> : <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden />}
            <h2 className="title">
              {data.resolution.decision === "rejected" ? "Awaiting resend" : "Reviewed and accepted"}
            </h2>
          </div>
          <p className="p">
            {actionLabel(data.resolution.action)}.{" "}
            {data.resolution.decision === "rejected"
              ? `The reply was sent to ${reply?.to ?? "the sender"}. This email stays here until they send a corrected document.`
              : "A person confirmed all 7 fields and they were saved."}
          </p>
        </div>
      ) : (
        <>
          {kase.accept ? (
            <div className="grid gap-3 md:grid-cols-2">
              <OptionCard
                selected={mode === "accept"}
                title={kase.accept.label}
                hint={kase.accept.hint}
                onClick={() => setMode("accept")}
              />
              {data.emailSent ? (
                <SentNotice />
              ) : (
                <OptionCard selected={mode === "reject"} title={kase.reject.label} hint={kase.reject.hint} onClick={() => setMode("reject")} />
              )}
            </div>
          ) : (
            data.emailSent && <SentNotice />
          )}

          {evidence}

          {activeMode === "reject" && !data.emailSent && (
            <div className="card flex flex-col gap-4 p-5">
              <div>
                <h2 className="title">{kase.reject.label}</h2>
                <p className="cap">Edit the wording if you need to. It is sent to the sender from the connected Gmail account, in the same thread. Only one reply is sent per email.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)] md:items-center md:gap-4">
                  <span className="lbl">To</span>
                  <span className="wrap-break-word">{reply?.to}</span>
                </div>
                <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)] md:items-center md:gap-4">
                  <label className="lbl" htmlFor="reply-subject">Subject</label>
                  <div className="input">
                    <input
                      id="reply-subject"
                      className="w-full bg-transparent outline-none"
                      value={reply?.subject ?? ""}
                      maxLength={300}
                      onChange={(e) => setDraft({ subject: e.target.value, body: reply?.body ?? "" })}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)] md:gap-4">
                  <label className="lbl pt-2.5" htmlFor="reply-body">Message</label>
                  <textarea
                    id="reply-body"
                    rows={11}
                    maxLength={5000}
                    className="input h-auto w-full resize-y px-3 py-2.5 text-sm leading-relaxed outline-none"
                    value={reply?.body ?? ""}
                    onChange={(e) => setDraft({ subject: reply?.subject ?? "", body: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn accent"
                  disabled={busy || !reply?.subject.trim() || !reply?.body.trim()}
                  onClick={saveRejected}
                >
                  <Mail size={16} strokeWidth={1.75} aria-hidden /> {busy ? "Sending…" : "Send email"}
                </button>
                {draft && (
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => setDraft(null)}>
                    Reset to the original wording
                  </button>
                )}
              </div>
            </div>
          )}

          {mode === "accept" && (
            <div className="card flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="title">Confirm the details</h2>
                  <p className="cap">
                    {data.defaults ? "Filled in from what the system read. Check each value against the document and correct it where needed." : "Enter each value as it appears on the document."}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn ghost sm"
                  title="Fill each blank SI or BL value from the other document. Values already entered are kept."
                  onClick={syncDetails}
                >
                  <ArrowLeftRight size={14} strokeWidth={1.75} aria-hidden /> Sync SI / BL details
                </button>
              </div>

              <FieldTable
                fields={email.fields ?? REVIEW_FIELDS.map((f) => ({ field: f, si: null, bl: null, match: true, confidence: null }))}
                attachments={email.attachments}
                edit={{
                  si: fields,
                  bl: blFields,
                  onChange: (role, field, value) => (role === "si" ? setFields : setBlFields)((v) => ({ ...v, [field]: value })),
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn accent" disabled={busy || !allFilled} onClick={saveAccepted}>
                  {busy ? "Saving…" : "Confirm details and save"}
                </button>
                {!allFilled && <span className="cap">Fill in all 7 fields on both documents to continue.</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MissingDocuments({ email }: { email: BatchEmail }) {
  const roles = missingAttachmentRoles(email.fields ?? [], email.attachments.length);
  return (
    <div className="card flex flex-col gap-2 p-5">
      <h2 className="title">Missing documents</h2>
      {roles.length > 0 ? (
        <ul className="list-disc pl-5">
          {roles.map((role) => <li key={role}>{DOC_LABEL[role]}</li>)}
        </ul>
      ) : (
        <p className="cap">Both documents have content, so the system could not tell which one is missing. Check the attachments.</p>
      )}
      <p className="cap">
        {email.attachments.length > 0
          ? `Attached: ${email.attachments.map((a) => a.filename).join(", ")}.`
          : "Nothing is attached to this email."}
      </p>
    </div>
  );
}

function BlankValues({ email }: { email: BatchEmail }) {
  const cells = blankCells(email.fields ?? []);
  if (cells.length === 0) return null;
  return (
    <div className="card flex flex-col gap-2 p-5">
      <h2 className="title">Values missing or unreadable on the document</h2>
      <ul className="list-disc pl-5">
        {cells.map((c) => <li key={`${c.role}-${c.field}`}>{FIELD_LABEL[c.field]}: {DOC_LABEL[c.role]}</li>)}
      </ul>
    </div>
  );
}

function SentNotice() {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="font-semibold">Reply already sent</span>
      <span className="cap">The sender has been emailed. Only one reply is sent per email.</span>
    </div>
  );
}

function OptionCard({ selected, title, hint, onClick }: { selected: boolean; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="card flex flex-col gap-1 p-4 text-left"
      style={selected ? { background: "var(--surface-inset)", borderColor: "var(--accent)" } : undefined}
    >
      <span className="font-semibold">{title}</span>
      <span className="cap">{hint}</span>
    </button>
  );
}
