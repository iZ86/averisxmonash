// Pure helpers behind the comparison report (banner text, row ordering). Split
// out from comparison-view.tsx so the logic is testable without rendering React.
import { FIELD_LABEL } from "@/lib/labels";
import type { FieldComparison } from "@/lib/types";

/** Canonical row order for the field table and the banner's field list. */
export const FIELD_ORDER = Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[];

/** Sorts a backend-supplied field list into the canonical display order,
 * tolerating a partial or differently-ordered list. */
export function orderedFields(fields: FieldComparison[]): FieldComparison[] {
  return FIELD_ORDER.map((key) => fields.find((f) => f.field === key)).filter((f): f is FieldComparison => !!f);
}

/** The differing fields' display names (first letter capitalised), for the mismatch banner's bullet list. */
export function differingFieldLabels(fields: FieldComparison[]): string[] {
  return fields
    .filter((f) => !f.match)
    .map((f) => {
      const label = FIELD_LABEL[f.field];
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
}

/** The no-mismatch banner's body text. */
export function matchSummary(fields: FieldComparison[]): string {
  return `All ${fields.length} fields match between the SI and the draft BL.`;
}
