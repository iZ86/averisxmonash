import type { Metadata } from "next";
import { Suspense } from "react";
import { BatchesWorkspace } from "../batches/workspace";

export const metadata: Metadata = {
  title: "Mismatches · Averis x Monash",
  description: "Emails where the Shipping Instruction and the draft BL differ.",
};

export default function MismatchesPage() {
  return (
    <Suspense fallback={<div className="p">Loading…</div>}>
      <BatchesWorkspace mode="mismatch" />
    </Suspense>
  );
}
