"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, X } from "lucide-react";
import type { BatchEmail } from "@/lib/batches/types";
import { FileGlyph, Preview } from "./attachments-view";

/** Modal popup showing an email's attachments, so a reviewer can check a value against the source. Mount it only
 * while open; it opens itself and calls onClose when dismissed (X button, Escape, or a click on the backdrop). */
export function FileDialog({
  attachments,
  initialId,
  title,
  onClose,
}: {
  attachments: BatchEmail["attachments"];
  initialId: string;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState(initialId);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const selected = attachments.find((a) => a.id === selectedId) ?? attachments[0];
  if (!selected) return null;

  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="m-auto w-[min(960px,94vw)] max-w-none rounded-lg border border-border bg-surface-card p-0 text-text-strong backdrop:bg-black/50"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="title min-w-0 truncate">{title}</h2>
        <button type="button" className="btn ghost sm" aria-label="Close" onClick={() => ref.current?.close()}>
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {attachments.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          {attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={a.id === selected.id}
              onClick={() => setSelectedId(a.id)}
              className="chip"
              style={a.id === selected.id ? { background: "var(--surface-inset)", borderColor: "var(--accent)" } : undefined}
            >
              <FileGlyph attachment={a} /> {a.filename}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[78vh] overflow-auto">
        <Preview attachment={selected} />
      </div>
    </dialog>
  );
}

/** "View file" button that opens the popup. Which attachment is the SI and which is the BL isn't stored, so it opens on
 * a sensible guess (first for SI, second for BL) and the reviewer can switch. */
export function ViewFileButton({
  attachments,
  preferIndex,
  title,
}: {
  attachments: BatchEmail["attachments"];
  preferIndex: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  if (attachments.length === 0) return null;
  const initial = attachments[Math.min(preferIndex, attachments.length - 1)];

  return (
    <>
      <button type="button" className="btn ghost sm ml-2 align-middle normal-case" onClick={() => setOpen(true)}>
        <Eye size={14} strokeWidth={1.75} aria-hidden /> View file
      </button>
      {open && <FileDialog attachments={attachments} initialId={initial.id} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
