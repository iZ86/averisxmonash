// Pure helpers behind the comparison report (banner text, row ordering). Split
// out from comparison-view.tsx so the logic is testable without rendering React.
import { FIELD_LABEL } from "@/lib/labels";
import type { FieldComparison } from "@/lib/types";
import { displayValue } from "./word-diff";

/** Canonical row order for the field table and the banner's field list. */
export const FIELD_ORDER = Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[];

/** Sorts a backend-supplied field list into the canonical display order,
 * tolerating a partial or differently-ordered list. */
export function orderedFields(fields: FieldComparison[]): FieldComparison[] {
  return FIELD_ORDER.map((key) => fields.find((f) => f.field === key)).filter((f): f is FieldComparison => !!f);
}

/** "gross weight (kg), SI: 22,000 / BL: 18,050" for one differing field. */
function bannerLine(f: FieldComparison): string {
  const si = displayValue(f.si) || "—";
  const bl = displayValue(f.bl) || "—";
  return `${FIELD_LABEL[f.field].toLowerCase()}, SI: ${si} / BL: ${bl}`;
}

/** The mismatch banner's body text: "N of M fields differ: ...; ...". */
export function mismatchSummary(fields: FieldComparison[]): string {
  const differing = fields.filter((f) => !f.match);
  const lines = differing.map(bannerLine).join("; ");
  return `${differing.length} of ${fields.length} fields differ: ${lines}`;
}

/** The no-mismatch banner's body text. */
export function matchSummary(fields: FieldComparison[]): string {
  return `All ${fields.length} fields match between the SI and the draft BL.`;
}
