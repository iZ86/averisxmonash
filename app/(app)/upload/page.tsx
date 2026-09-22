import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Upload shipping data · APRIL Group",
  description: "Upload an inbox + attachments bundle for shipping document verification.",
};

export default function UploadPage() {
  return (
    <>
      <PageHeader
        eyebrow="Upload"
        title="Upload shipping data"
        description="Add a bundle of inbox emails and attachments to check."
        actions={<span className="badge neutral">Manual upload</span>}
      />
      <div className="flex max-w-2xl flex-col gap-6">
        <p className="p">
          Provide a single <span className="code">.zip</span> containing <span className="code">inbox/</span> and{" "}
          <span className="code">attachments/</span> folders, or upload the two folders separately.
        </p>
        <div className="card flex items-start gap-3 border-transparent px-5 py-4" style={{ background: "var(--accent-soft)" }}>
          <AlertTriangle size={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-status-review" />
          <p className="cap">
            Due to a server deployment limit, a single upload can process at most <b>100 emails</b> at once. Split larger
            batches into multiple uploads.
          </p>
        </div>
        <UploadForm />
      </div>
    </>
  );
}
