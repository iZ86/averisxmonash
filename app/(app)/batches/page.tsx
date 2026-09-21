import type { Metadata } from "next";
import { Suspense } from "react";
import { BatchesWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "Batches · APRIL Group",
  description: "Every stored email with its category, confidence and result.",
};

export default function BatchesPage() {
  return (
    <Suspense fallback={<div className="p">Loading…</div>}>
      <BatchesWorkspace />
    </Suspense>
  );
}
