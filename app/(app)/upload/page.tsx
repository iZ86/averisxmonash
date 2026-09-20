import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Upload shipping data · Averis x Monash",
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
        <UploadForm />
      </div>
    </>
  );
}
