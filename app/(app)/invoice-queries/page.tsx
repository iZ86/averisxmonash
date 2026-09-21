import type { Metadata } from "next";
import { Suspense } from "react";
import { BatchesWorkspace } from "../batches/workspace";

export const metadata: Metadata = {
  title: "Invoice Queries · APRIL Group",
  description: "Emails asking about invoices, charges or payments, waiting for a reply.",
};

export default function InvoiceQueriesPage() {
  return (
    <Suspense fallback={<div className="p">Loading…</div>}>
      <BatchesWorkspace mode="invoice" />
    </Suspense>
  );
}
