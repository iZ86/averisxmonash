import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { PageHeader, SampleBadge } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { emails, stats } from "@/lib/mock/data";
import { BatchesTable } from "./batches-table";

export const metadata: Metadata = { title: "Batches · Averis x Monash" };

export default function BatchesPage() {
  const batchId = emails[0]?.batchId ?? "";
  const summary = [
    { label: "Emails in batch", value: stats.emailsProcessed.toLocaleString(), cap: "Uploaded today", color: "var(--text-strong)" },
    { label: "Average confidence", value: `${stats.avgConfidence}%`, cap: "Across all results", color: "var(--status-match)" },
    { label: `Below ${AUTO_ACCEPT_THRESHOLD}% confidence`, value: stats.belowThreshold, cap: `${stats.sentToReview} sent to review`, color: "var(--accent-text)" },
    { label: "Needs review", value: stats.awaitingReview, cap: "Waiting for a person", color: "var(--accent-text)" },
    { label: "Failed", value: stats.failed, cap: "Retry available", color: "var(--status-mismatch)" },
  ];
  const counts = {
    all: stats.emailsProcessed,
    comparison: stats.comparisonRequests,
    review: stats.awaitingReview,
    low: stats.belowThreshold,
    failed: stats.failed,
  };

  return (
    <>
      <PageHeader
        eyebrow="Batches"
        title="Batch overview"
        description={`Batch ${batchId} · every email with its category, confidence and result.`}
        actions={
          <>
            <SampleBadge />
            <Link className="btn accent" href="/upload">
              <Upload size={16} strokeWidth={1.75} aria-hidden /> Upload data
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {summary.map((s) => (
          <div className="card stat" key={s.label}>
            <span className="lbl">{s.label}</span>
            <span className="text-2xl leading-8 font-semibold tracking-[-0.02em]" style={{ color: s.color }}>
              {s.value}
            </span>
            <span className="cap">{s.cap}</span>
          </div>
        ))}
      </div>
      <BatchesTable emails={emails} counts={counts} total={stats.emailsProcessed} />
    </>
  );
}
