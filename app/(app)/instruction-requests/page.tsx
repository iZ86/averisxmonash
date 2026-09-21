import type { Metadata } from "next";
import { Suspense } from "react";
import { BatchesWorkspace } from "../batches/workspace";

export const metadata: Metadata = {
  title: "Instructions Requests · APRIL Group",
  description: "Shipping instructions sent in by senders, waiting for a Bill of Lading.",
};

export default function InstructionRequestsPage() {
  return (
    <Suspense fallback={<div className="p">Loading…</div>}>
      <BatchesWorkspace mode="instruction" />
    </Suspense>
  );
}
