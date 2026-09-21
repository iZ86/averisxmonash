"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, File, FileText, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { previewKind } from "@/lib/batches/preview-kind";
import type { BatchEmail } from "@/lib/batches/types";

type Attachment = BatchEmail["attachments"][number];

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export const fmtSize = (bytes: number | null) => {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const attachmentUrl = (id: string, mode?: "download" | "preview") => `/api/attachments/${id}${mode ? `?${mode}=1` : ""}`;

export function FileGlyph({ attachment }: { attachment: Attachment }) {
  const kind = previewKind(attachment.filename, attachment.mimeType);
  if (kind === "image") return <ImageIcon {...ICON} />;
  if (kind) return <FileText {...ICON} />;
  return <File {...ICON} />;
}

function Loading() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-text-muted" role="status">
      <LoaderCircle size={28} strokeWidth={1.75} aria-hidden className="animate-spin" />
      <span className="cap">Loading preview…</span>
    </div>
  );
}

/** Shows a spinner over the frame until the browser reports the content has loaded. */
function WithSpinner({ children }: { children: (onLoad: () => void) => React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative min-h-[320px] bg-surface-inset">
      {!loaded && (
        <div className="absolute inset-0">
          <Loading />
        </div>
      )}
      <div className={loaded ? undefined : "invisible"}>{children(() => setLoaded(true))}</div>
    </div>
  );
}

/** Fetches the converted HTML so a failure can be shown as a message instead of a blank frame. */
function HtmlPreview({ attachment }: { attachment: Attachment }) {
  const [state, setState] = useState<{ id: string; html?: string; error?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(attachmentUrl(attachment.id, "preview"), { signal: controller.signal })
      .then(async (res) => {
        if (res.ok) return setState({ id: attachment.id, html: await res.text() });
        const body = await res.json().catch(() => null);
        setState({ id: attachment.id, error: body?.error ?? `The server returned ${res.status}.` });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setState({ id: attachment.id, error: err instanceof Error ? err.message : "Could not load the file." });
      });
    return () => controller.abort();
  }, [attachment.id]);

  if (state?.id !== attachment.id) {
    return (
      <div className="min-h-[320px] bg-surface-inset">
        <Loading />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="title">Could not load this file</div>
        <p className="cap max-w-sm">{state.error}</p>
      </div>
    );
  }
  return <iframe sandbox="" srcDoc={state.html} title={attachment.filename} className="h-[640px] w-full border-0 bg-white" />;
}

export function Preview({ attachment }: { attachment: Attachment }) {
  const kind = previewKind(attachment.filename, attachment.mimeType);
  const url = attachmentUrl(attachment.id);

  if (kind === "image") {
    return (
      <WithSpinner key={attachment.id}>
        {(onLoad) => (
          <div className="flex min-h-[420px] items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={attachment.filename} onLoad={onLoad} onError={onLoad} className="max-h-[640px] max-w-full rounded-md object-contain" />
          </div>
        )}
      </WithSpinner>
    );
  }
  if (kind === "html") return <HtmlPreview attachment={attachment} />;
  if (kind === "pdf") {
    return (
      <WithSpinner key={attachment.id}>
        {(onLoad) => <iframe src={url} title={attachment.filename} onLoad={onLoad} className="h-[640px] w-full border-0 bg-white" />}
      </WithSpinner>
    );
  }
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 bg-surface-inset p-8 text-center">
      <File size={28} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
      <div className="title">No preview for this file type</div>
      <p className="cap max-w-xs">{attachment.mimeType || "Unknown type"} files can be downloaded and opened on your computer.</p>
      <a className="btn accent" href={attachmentUrl(attachment.id, "download")}>
        <Download {...ICON} /> Download
      </a>
    </div>
  );
}

export function AttachmentsView({
  email,
  selectedId,
  onSelect,
  onBackToEmail,
}: {
  email: BatchEmail;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBackToEmail: () => void;
}) {
  if (email.attachments.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-1 p-12 text-center">
        <b className="text-text-strong">No attachments</b>
        <span className="cap">This email did not include any files.</span>
      </div>
    );
  }

  const selected = email.attachments.find((a) => a.id === selectedId) ?? email.attachments[0];

  return (
    <div className="grid items-start gap-4 [@container(min-width:760px)]:grid-cols-[260px_minmax(0,1fr)]">
      <div className="card overflow-hidden">
        <div className="px-4 pt-3">
          <button type="button" className="cap inline-flex items-center gap-1 underline-offset-2 hover:underline" onClick={onBackToEmail}>
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden /> Back to email
          </button>
        </div>
        <div className="px-4 py-3">
          <h2 className="title">
            {email.attachments.length} {email.attachments.length === 1 ? "attachment" : "attachments"}
          </h2>
        </div>
        {email.attachments.map((a) => {
          const on = a.id === selected.id;
          return (
            <button
              key={a.id}
              type="button"
              aria-current={on}
              onClick={() => onSelect(a.id)}
              className={`flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left ${on ? "bg-surface-inset" : "hover:bg-surface-inset"}`}
            >
              <span className="text-text-muted">
                <FileGlyph attachment={a} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium" title={a.filename}>{a.filename}</span>
                <span className="cap">{[a.mimeType, fmtSize(a.sizeBytes)].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <h2 className="title min-w-0 truncate" title={selected.filename}>{selected.filename}</h2>
          <div className="flex gap-2">
            <a
              className="btn ghost sm"
              href={attachmentUrl(selected.id, previewKind(selected.filename, selected.mimeType) === "html" ? "preview" : undefined)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden /> Open
            </a>
            <a className="btn ghost sm" href={attachmentUrl(selected.id, "download")}>
              <Download size={14} strokeWidth={1.75} aria-hidden /> Download
            </a>
          </div>
        </div>
        <Preview attachment={selected} />
      </div>
    </div>
  );
}
