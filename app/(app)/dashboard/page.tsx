import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Flag, Globe, Inbox, Mail, ShieldCheck, Upload } from "lucide-react";
import { PageHeader, SampleBadge, Confidence, ResultBadge } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD } from "@/lib/confidence";
import { getReviewCases, stats } from "@/lib/mock/data";

export const metadata: Metadata = { title: "Dashboard · Averis x Monash" };

const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

function Bars({ rows }: { rows: { label: string; value: number; highlight?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar" key={r.label}>
          <span>{r.label}</span>
          <div className="track">
            <div className={`fill${r.highlight ? " hi" : ""}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const s = stats;
  const total = s.results.noMismatch + s.results.mismatch + s.results.needsReview;
  const differing = s.byField.reduce((n, f) => n + f.value, 0);
  const review = getReviewCases();

  // Empty state once real data is wired: no batches yet.
  if (s.emailsProcessed === 0) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="Dashboard" description="What Averis x Monash has processed from your inbox." />
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="dropicon"><Inbox size={28} strokeWidth={1.75} aria-hidden /></div>
          <h2 className="title">No batches yet</h2>
          <p className="p">Upload an inbox and attachments bundle to see results here.</p>
          <Link className="btn accent" href="/upload">Upload data</Link>
        </div>
      </>
    );
  }

  const kpis = [
    { label: "Emails processed", n: s.emailsProcessed.toLocaleString(), cap: "Across all categories", icon: <Mail {...ICON} /> },
    { label: "Comparison requests", n: s.comparisonRequests, cap: `${pct(s.comparisonRequests, s.emailsProcessed)} of emails`, icon: <Inbox {...ICON} /> },
    { label: "With a mismatch", n: s.withMismatch, cap: `${pct(s.withMismatch, s.comparisonRequests)} of requests`, icon: <AlertTriangle {...ICON} />, tone: "bad" },
    { label: "Awaiting review", n: s.awaitingReview, cap: "Needs a person", icon: <Flag {...ICON} />, tone: "rev", accent: true },
    { label: "Shipments mapped", n: s.shipmentsMapped, cap: "Checked, with ports", icon: <Globe {...ICON} /> },
    { label: "Avg. confidence", n: `${s.avgConfidence}%`, cap: `Below ${AUTO_ACCEPT_THRESHOLD}% goes to review`, icon: <ShieldCheck {...ICON} />, tone: "ok" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="What Averis x Monash has processed from your inbox."
        actions={
          <>
            <SampleBadge />
            <span className="chip">Last 30 days</span>
            <Link className="btn accent" href="/upload">
              <Upload size={16} strokeWidth={1.75} aria-hidden /> Upload data
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k) => (
          <div className="card kpi" key={k.label}>
            <div className="head">
              <span className="lbl">{k.label}</span>
              <span className={`kicon ${k.tone ?? ""}`}>{k.icon}</span>
            </div>
            <span className="n" style={k.accent ? { color: "var(--accent-text)" } : undefined}>{k.n}</span>
            <span className="cap">{k.cap}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-col gap-5 p-6">
          <div>
            <h2 className="title">Emails by category</h2>
            <p className="cap">Only document-comparison requests continue to checking.</p>
          </div>
          <Bars rows={s.byCategory} />
        </div>
        <div className="card flex flex-col gap-5 p-6">
          <div>
            <h2 className="title">Mismatches by field</h2>
            <p className="cap">{differing} differing fields across {s.withMismatch} reports.</p>
          </div>
          <Bars rows={s.byField} />
        </div>
      </div>

      <div className="card flex flex-col gap-4 p-6">
        <h2 className="title">Result of {s.comparisonRequests} comparison requests</h2>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Share of results">
          <div style={{ width: `${(s.results.noMismatch / total) * 100}%`, background: "var(--status-match)" }} />
          <div style={{ width: `${(s.results.mismatch / total) * 100}%`, background: "var(--status-mismatch)" }} />
          <div style={{ width: `${(s.results.needsReview / total) * 100}%`, background: "var(--accent)" }} />
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <span className="inline-flex items-center gap-2 text-status-match">
            <CheckCircle2 {...ICON} />
            <span className="text-text-strong">No mismatch detected <b>{s.results.noMismatch}</b></span>
          </span>
          <span className="inline-flex items-center gap-2 text-status-mismatch">
            <AlertTriangle {...ICON} />
            <span className="text-text-strong">Mismatch found <b>{s.results.mismatch}</b></span>
          </span>
          <span className="inline-flex items-center gap-2 text-status-review">
            <Flag {...ICON} />
            <span className="text-text-strong">Needs review <b>{s.results.needsReview}</b></span>
          </span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="title">Needs your review, lowest confidence first</h2>
          <Link className="btn ghost sm" href="/review">Open review queue</Link>
        </div>
        {review.slice(0, 3).map((c) => (
          <Link
            key={c.emailId}
            href="/review"
            className="flex items-center justify-between gap-4 border-t border-border px-5 py-3 hover:bg-surface-inset"
          >
            <div>
              <div className="font-medium">{c.subject}</div>
              <div className="cap">{c.reviewReason}</div>
            </div>
            <div className="flex items-center gap-5">
              <Confidence score={c.confidence} />
              <ResultBadge result="needs_review" />
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
