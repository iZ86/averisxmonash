"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FolderOpen, Archive } from "lucide-react";
import { toast } from "sonner";
import type { UploadResponse } from "@/lib/upload/types";
import type { InboxResult } from "@/lib/email-processing/types";
import { ResultsTable } from "./results-table";

type Mode = "zip" | "folders";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units: string[] = ["B", "KB", "MB", "GB"];
  const exp: number = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function summarize(files: File[]) {
  const size: number = files.reduce((sum, f) => sum + f.size, 0);
  return `${files.length} file${files.length === 1 ? "" : "s"} · ${formatBytes(size)}`;
}

/** Strips the user's chosen root folder name, keeping the path beneath it. */
function relativePathWithin(file: File) {
  const full: string = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  if (!full) return file.name;
  const parts: string[] = full.split("/");
  return parts.slice(1).join("/") || file.name;
}

/** The top-level folder name the browser recorded for a directory selection. */
function getRootFolderName(files: File[]): string | null {
  const full = (files[0] as (File & { webkitRelativePath?: string }) | undefined)
    ?.webkitRelativePath;
  if (!full) return null;
  return full.split("/")[0] || null;
}

type DropFieldProps = {
  id: string;
  label: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
  selected?: string | null;
  folder?: boolean;
  dragging?: boolean;
  onDragChange?: (over: boolean) => void;
  onDropFiles?: (files: FileList) => void;
  inputProps: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };
};

/** Real file input inside a dashed drop zone; the label makes the whole zone clickable. */
function DropField({ id, label, title, hint, icon, selected, folder, dragging, onDragChange, onDropFiles, inputProps }: DropFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-5 font-medium text-text-label">{label}</span>
      <label
        htmlFor={id}
        className="dropzone cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
        style={dragging ? { background: "var(--surface-inset)" } : undefined}
        onDragOver={onDropFiles ? (e) => { e.preventDefault(); onDragChange?.(true); } : undefined}
        onDragLeave={onDropFiles ? () => onDragChange?.(false) : undefined}
        onDrop={
          onDropFiles
            ? (e) => {
                e.preventDefault();
                onDragChange?.(false);
                if (e.dataTransfer.files.length > 0) onDropFiles(e.dataTransfer.files);
              }
            : undefined
        }
      >
        <input id={id} type="file" className="sr-only" {...inputProps} />
        <span className="dropicon" aria-hidden>{icon}</span>
        <span className="font-medium">{selected ?? title}</span>
        <span className="cap">{selected ? "Choose a different file to replace it" : hint}</span>
        <span className="btn ghost sm mt-2">Choose {folder ? "folder" : "file"}</span>
      </label>
    </div>
  );
}

export function UploadForm() {
  const [mode, setMode] = useState<Mode>("zip");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [inboxFiles, setInboxFiles] = useState<File[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<InboxResult[] | null>(null);
  const [summary, setSummary] = useState<{ title: string; notes: string[] } | null>(null);

  const inboxInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);

  const setDirectoryAttrs = (el: HTMLInputElement | null) => {
    if (!el) return;
    el.setAttribute("webkitdirectory", "true");
    el.setAttribute("directory", "true");
  };

  function handleFolderSelect(
    fileList: FileList | null,
    expectedRoot: "inbox" | "attachments",
    setFiles: (files: File[]) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      setFiles([]);
      return;
    }

    const root = getRootFolderName(files);
    if (root !== expectedRoot) {
      toast.error(`Wrong folder selected`, {
        description: `The folder must be named "${expectedRoot}" — got "${root ?? "unknown"}".`,
      });
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setFiles(files);
  }

  const canSubmit: boolean =
    mode === "zip"
      ? zipFile !== null
      : inboxFiles.length > 0 && attachmentFiles.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;

    const formData: FormData = new FormData();
    formData.set("mode", mode);

    if (mode === "zip" && zipFile) {
      formData.set("file", zipFile);
    } else {
      for (const file of inboxFiles) {
        formData.append("files", file, `inbox/${relativePathWithin(file)}`);
      }
      for (const file of attachmentFiles) {
        formData.append(
          "files",
          file,
          `attachments/${relativePathWithin(file)}`,
        );
      }
    }

    setIsSubmitting(true);
    setSummary(null);
    setResults(null);
    const toastId: string | number = toast.loading("Uploading and classifying emails…", {
      description: "Large batches can take several minutes.",
    });

    try {
      const res: Response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data: UploadResponse = await res.json();

      if (!res.ok || !data.success) {
        const message: string = !data.success ? data.error : "Upload failed.";
        toast.error(message, { id: toastId });
        return;
      }

      const notes: string[] = [];
      if (data.stats.skippedCount > 0) {
        notes.push(
          `${data.stats.skippedCount} file(s) skipped (outside inbox/attachments)`,
        );
      }
      if (data.stats.junkCount > 0) {
        notes.push(`${data.stats.junkCount} OS metadata file(s) ignored`);
      }
      const failedCount: number = data.results.filter((r) => !r.ok).length;
      if (failedCount > 0) notes.push(`${failedCount} email(s) failed`);
      const title = `Classified ${data.results.length - failedCount} of ${data.results.length} email${
        data.results.length === 1 ? "" : "s"
      } (${data.stats.attachmentCount} attachment${data.stats.attachmentCount === 1 ? "" : "s"}).`;
      toast.success(title, { id: toastId, description: notes.join(" · ") || undefined });
      setSummary({ title, notes });
      setResults(data.results);

      setZipFile(null);
      setInboxFiles([]);
      setAttachmentFiles([]);
      if (inboxInputRef.current) inboxInputRef.current.value = "";
      if (attachmentsInputRef.current) attachmentsInputRef.current.value = "";
    } catch {
      toast.error("Could not reach the server. Please try again.", {
        id: toastId,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="seg self-start" role="group" aria-label="Upload type">
        {(["zip", "folders"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            className={mode === m ? "on" : undefined}
            onClick={() => setMode(m)}
          >
            {m === "zip" ? "Upload .zip" : "Upload folders"}
          </button>
        ))}
      </div>

      {mode === "zip" ? (
        <DropField
          id="zip-input"
          label="Archive (.zip)"
          title="Drop a .zip here or choose a file"
          hint="Contains inbox/ and attachments/"
          icon={<Archive size={26} strokeWidth={1.75} />}
          selected={zipFile ? `${zipFile.name} · ${formatBytes(zipFile.size)}` : null}
          dragging={dragging}
          onDragChange={setDragging}
          onDropFiles={(files) => {
            const file = Array.from(files).find((f) => f.name.toLowerCase().endsWith(".zip"));
            if (file) setZipFile(file);
            else toast.error("Only .zip archives can be dropped here.");
          }}
          inputProps={{
            accept: ".zip,application/zip,application/x-zip-compressed",
            onChange: (e) => setZipFile(e.target.files?.[0] ?? null),
          }}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <DropField
            id="inbox-input"
            folder
            label="Inbox folder"
            title="Choose the inbox folder"
            hint="The folder must be named inbox"
            icon={<FolderOpen size={26} strokeWidth={1.75} />}
            selected={inboxFiles.length > 0 ? summarize(inboxFiles) : null}
            inputProps={{
              ref: (el) => {
                inboxInputRef.current = el;
                setDirectoryAttrs(el);
              },
              multiple: true,
              onChange: (e) => handleFolderSelect(e.target.files, "inbox", setInboxFiles, inboxInputRef),
            }}
          />
          <DropField
            id="attachments-input"
            folder
            label="Attachments folder"
            title="Choose the attachments folder"
            hint="The folder must be named attachments"
            icon={<FolderOpen size={26} strokeWidth={1.75} />}
            selected={attachmentFiles.length > 0 ? summarize(attachmentFiles) : null}
            inputProps={{
              ref: (el) => {
                attachmentsInputRef.current = el;
                setDirectoryAttrs(el);
              },
              multiple: true,
              onChange: (e) => handleFolderSelect(e.target.files, "attachments", setAttachmentFiles, attachmentsInputRef),
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn accent" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "Processing…" : "Upload and classify"}
        </button>
        <span className="cap">Nothing is checked until the upload finishes.</span>
      </div>

      {summary && (
        <div
          role="status"
          className="card flex items-start gap-3 border-transparent px-5 py-4"
          style={{ background: "var(--status-match-soft)" }}
        >
          <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-status-match" />
          <div>
            <div className="title">{summary.title}</div>
            <div className="cap text-text-muted">
              {summary.notes.join(" · ")}
            </div>
            <Link href="/batches" className="lbl mt-2 inline-block text-accent-text underline-offset-2 hover:underline">
              View batch results
            </Link>
          </div>
        </div>
      )}

      {results && <ResultsTable results={results} />}
    </form>
  );
}
