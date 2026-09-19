import { AlertTriangle, CheckCircle2, Flag, XCircle } from "lucide-react";
import { CATEGORY_LABEL, RESULT_LABEL } from "@/lib/mock/data";
import {
  LEVEL_LABEL,
  LEVEL_METER,
  LEVEL_TEXT,
  confidenceLevel,
} from "@/lib/confidence";
import type { Category, Result } from "@/lib/types";

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Meter + number. Low scores are always labelled "Low"; `showLabel` labels every level. */
export function Confidence({ score, showLabel = false }: { score: number | null; showLabel?: boolean }) {
  if (score === null) return <span className="cap">n/a</span>;
  const level = confidenceLevel(score);
  return (
    <span className="conf">
      <span className="meter" aria-hidden>
        <i className={LEVEL_METER[level]} style={{ width: `${score}%` }} />
      </span>
      <b>{score}%</b>
      {(showLabel || level === "low") && <span className="cap">{LEVEL_LABEL[level]}</span>}
    </span>
  );
}

/** Large confidence figure with a full-width meter, used for the summary cards. */
export function ConfidenceStat({ label, score }: { label: string; score: number }) {
  const level = confidenceLevel(score);
  return (
    <div className="card stat">
      <span className="lbl">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-[30px] leading-9 font-semibold tracking-[-0.025em] ${LEVEL_TEXT[level]}`}>
          {score}%
        </span>
        <span className="cap font-medium">{LEVEL_LABEL[level]}</span>
      </div>
      <span className="meter lg" aria-hidden>
        <i className={LEVEL_METER[level]} style={{ width: `${score}%` }} />
      </span>
    </div>
  );
}

export function ResultBadge({ result }: { result: Result }) {
  const label = RESULT_LABEL[result];
  switch (result) {
    case "no_mismatch":
      return (
        <span className="badge ok">
          <CheckCircle2 {...ICON} /> {label}
        </span>
      );
    case "mismatch":
      return (
        <span className="badge bad">
          <AlertTriangle {...ICON} /> {label}
        </span>
      );
    case "needs_review":
      return (
        <span className="badge rev">
          <Flag {...ICON} /> {label}
        </span>
      );
    case "failed":
      return (
        <span className="badge bad">
          <XCircle {...ICON} /> {label}
        </span>
      );
    default:
      return <span className="badge neutral">{label}</span>;
  }
}

export function CategoryChip({ category }: { category: Category }) {
  return <span className="chip">{CATEGORY_LABEL[category]}</span>;
}

/** Marks screens that still render mock data. */
export function SampleBadge() {
  return <span className="badge neutral">Sample data</span>;
}

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <>
      {breadcrumb}
      <div className="top">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="h1">{title}</h1>
          <p className="p">{description}</p>
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
    </>
  );
}
