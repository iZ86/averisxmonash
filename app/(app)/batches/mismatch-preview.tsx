"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { mismatchEmail } from "@/lib/batches/mismatch-email";
import type { BatchEmail } from "@/lib/batches/types";

// Shown when nothing is selected, so the template can still be read.
const SAMPLE = { from: "Sender <sender@example.com>", subject: "Shipping documents", fields: ["consignee", "container_count"] };

/** The email a sender receives, for the selected mismatch (or an example when none is selected). */
export function MismatchPreview({ email, onClose }: { email: BatchEmail | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const message = mismatchEmail(
    email ? { from: email.fromAddress, subject: email.subject, fields: email.defectFields } : SAMPLE,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Email preview"
        className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="title">Email preview</h2>
            <p className="cap">{email ? "What the sender of the selected mismatch receives." : "An example. Select a mismatch to see its own."}</p>
          </div>
          <button type="button" aria-label="Close preview" onClick={onClose} className="rounded-md p-1 text-text-muted hover:bg-surface-inset hover:text-text-strong">
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto border-t border-border px-6 py-5 text-sm">
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1">
            <span className="lbl">To</span>
            <span className="wrap-break-word">{message.to}</span>
            <span className="lbl">Subject</span>
            <span className="font-semibold wrap-break-word">{message.subject}</span>
          </div>
          <div className="rounded-md bg-surface-inset p-4 leading-relaxed whitespace-pre-wrap">{message.body}</div>
        </div>
        <div className="flex justify-end border-t border-border px-6 py-3">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
