import type { Metadata } from "next";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Upload shipping data",
  description:
    "Upload an inbox + attachments bundle for shipping document verification.",
};

export default function UploadPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Upload shipping data
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Provide a single{" "}
            <code className="rounded bg-black/6 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/8">
              .zip
            </code>{" "}
            containing{" "}
            <code className="rounded bg-black/6 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/8">
              inbox/
            </code>{" "}
            and{" "}
            <code className="rounded bg-black/6 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/8">
              attachments/
            </code>{" "}
            folders, or upload the two folders separately.
          </p>
        </div>

        <UploadForm />
      </main>
    </div>
  );
}
