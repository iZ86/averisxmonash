import "server-only";
import {
  COMPARED_FIELDS,
  findActiveBl,
  findActiveSiRequest,
  type ClassificationResponse,
  type ExtractedDocumentValues,
} from "@/lib/email-classification/schemas";

const EMPTY = Object.fromEntries(
  COMPARED_FIELDS.map((field) => [field, null]),
) as ExtractedDocumentValues;

function hasAnyValue(values: ExtractedDocumentValues): boolean {
  return Object.values(values).some((value) => value !== null);
}

/**
 * The row to write for one of the two documents, or null to write none. Both
 * documents follow the same rule, so the SI and the draft BL are decided
 * independently: an email whose BL was forgotten stores the SI's 7 values and
 * an all-null BL row.
 *
 * This is storage policy rather than classification, so it lives here instead
 * of in `classifyEmail`: `/api/process-email` and the upload path keep
 * returning whatever the model produced.
 */
function documentRow(
  result: ClassificationResponse,
  values: ExtractedDocumentValues | null,
): ExtractedDocumentValues | null {
  // Redundant with toResponse, which already nulls both fields for non-BL
  // emails, and kept anyway: `status` is "OK" on every non-BL email (rules.md
  // invariant 6), so without this a GENERAL email would fall straight into the
  // OK branch below.
  if (!findActiveBl(result.categories)) return null;

  // Nothing extracted on an OK comparison means the document was never sent —
  // the sender is asking us for ours. Nothing to store.
  if (result.status === "OK") return values && hasAnyValue(values) ? values : null;

  // MISMATCH and NEEDS_REVIEW both store what the document carried, nulls
  // included: a missing, wrong-type or unreadable document is recorded as an
  // all-null row rather than as no row at all.
  return values ?? EMPTY;
}

export function shippingInstructionRow(result: ClassificationResponse) {
  return documentRow(result, result.shipping_instruction);
}

export function billOfLadingRow(result: ClassificationResponse) {
  return documentRow(result, result.bill_of_lading);
}

/**
 * The row to write for the instructions an SI_REQUEST email supplied, or null
 * to write none.
 *
 * `documentRow`'s status branches don't apply here: `status` is "OK" on every
 * non-BL email (rules.md invariant 6), so there is no MISMATCH or NEEDS_REVIEW
 * to record and nothing to store an all-null row for. An SI request with
 * nothing readable in it is simply not an extraction.
 */
export function shippingInstructionRequestRow(result: ClassificationResponse) {
  if (!findActiveSiRequest(result.categories)) return null;
  const values = result.shipping_instruction_request;
  return values && hasAnyValue(values) ? values : null;
}
