import type { Metadata } from "next";
import { Suspense } from "react";
import { BatchesWorkspace } from "../batches/workspace";

export const metadata: Metadata = {
  title: "Review queue · APRIL Group",
  description: "Cases the system could not decide, waiting for a person.",
};

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="p">Loading…</div>}>
      <BatchesWorkspace mode="review" />
    </Suspense>
  );
}
