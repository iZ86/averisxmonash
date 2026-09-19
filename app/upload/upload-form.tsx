"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { UploadResponse } from "@/lib/upload/types";

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

export function UploadForm() {
  const [mode, setMode] = useState<Mode>("zip");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [inboxFiles, setInboxFiles] = useState<File[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const toastId: string | number = toast.loading("Uploading shipping data…");

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
      notes.push(`Batch ID: ${data.batchId}`);

      toast.success(
        `Uploaded ${data.stats.emailCount} email${data.stats.emailCount === 1 ? "" : "s"} and ${
          data.stats.attachmentCount
        } attachment${data.stats.attachmentCount === 1 ? "" : "s"}.`,
        { id: toastId, description: notes.join(" · ") },
      );

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
      <div className="inline-flex w-fit rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {(["zip", "folders"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            }`}
          >
            {m === "zip" ? "Upload .zip" : "Upload folders"}
          </button>
        ))}
      </div>

      {mode === "zip" ? (
        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
            htmlFor="zip-input"
          >
            Archive (.zip)
          </label>
          <input
            id="zip-input"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:file:bg-zinc-50 dark:file:text-black"
          />
          {zipFile && (
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Selected: {zipFile.name} · {formatBytes(zipFile.size)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              htmlFor="inbox-input"
            >
              Inbox folder
            </label>
            <input
              id="inbox-input"
              ref={(el) => {
                inboxInputRef.current = el;
                setDirectoryAttrs(el);
              }}
              type="file"
              multiple
              onChange={(e) =>
                handleFolderSelect(e.target.files, "inbox", setInboxFiles, inboxInputRef)
              }
              className="block w-full cursor-pointer rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:file:bg-zinc-50 dark:file:text-black"
            />
            {inboxFiles.length > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {summarize(inboxFiles)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              htmlFor="attachments-input"
            >
              Attachments folder
            </label>
            <input
              id="attachments-input"
              ref={(el) => {
                attachmentsInputRef.current = el;
                setDirectoryAttrs(el);
              }}
              type="file"
              multiple
              onChange={(e) =>
                handleFolderSelect(e.target.files, "attachments", setAttachmentFiles, attachmentsInputRef)
              }
              className="block w-full cursor-pointer rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:file:bg-zinc-50 dark:file:text-black"
            />
            {attachmentFiles.length > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {summarize(attachmentFiles)}
              </p>
            )}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || isSubmitting}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-black"
      >
        {isSubmitting ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
