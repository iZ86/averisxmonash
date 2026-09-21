"use client";

import { useState } from "react";
import { CheckCircle2, Mail, Receipt } from "lucide-react";
import { toast } from "sonner";
import { senderAddress } from "@/lib/batches/review-cases";
import type { BatchEmail } from "@/lib/batches/types";

/** An invoice query: a blank reply to write to the sender. Only whether the email was replied to is tracked. */
export function InvoiceQueryView({ email, sent, onSent }: { email: BatchEmail; sent: boolean; onSent: () => void }) {
  // Same default as any reply: "Re: <original subject>". The message itself starts empty.
  const [subject, setSubject] = useState(() => (/^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch("/api/emails/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processedEmailId: email.processedId, subject, body: message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? `The server returned ${res.status}.`);
      toast.success(`Reply sent to ${data.sentTo}.`, { description: email.subject });
      onSent();
    } catch (err) {
      toast.error("That did not work.", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex items-start gap-3 border-transparent px-6 py-5" style={{ background: "var(--category-invoice-soft)", color: "var(--category-invoice)" }}>
        <Receipt size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="title text-base">Invoice query</div>
          <div className="text-text-strong">{sent ? "The sender has been replied to." : "The sender is asking about money. Write a reply below."}</div>
        </div>
      </div>

      {!email.processedId ? (
        <div className="card p-5">
          <p className="cap">This email has not been analysed yet.</p>
        </div>
      ) : sent ? (
        <div className="card flex items-center gap-2 p-5">
          <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden className="text-status-match" />
          <span className="font-semibold">Reply sent</span>
          <span className="cap">Only one reply is sent per email.</span>
        </div>
      ) : (
        <div className="card flex flex-col gap-4 p-5">
          <div>
            <h2 className="title">Reply to the sender</h2>
            <p className="cap">Sent from the connected Gmail account, in the same thread. Only one reply is sent per email.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)] md:items-center md:gap-4">
              <span className="lbl">To</span>
              <span className="wrap-break-word">{senderAddress(email.fromAddress)}</span>
            </div>
            <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)] md:items-center md:gap-4">
              <label className="lbl" htmlFor="invoice-subject">Subject</label>
              <div className="input">
                <input id="invoice-subject" className="w-full bg-transparent outline-none" value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5 md:grid-cols-[72px_minmax(0,1fr)] md:gap-4">
              <label className="lbl pt-2.5" htmlFor="invoice-message">Message</label>
              <textarea
                id="invoice-message"
                rows={11}
                maxLength={5000}
                className="input h-auto w-full resize-y px-3 py-2.5 text-sm leading-relaxed outline-none"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
          <div>
            <button type="button" className="btn accent" disabled={busy || !subject.trim() || !message.trim()} onClick={send}>
              <Mail size={16} strokeWidth={1.75} aria-hidden /> {busy ? "Sending…" : "Send email"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
