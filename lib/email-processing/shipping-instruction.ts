import "server-only";
import {
  COMPARED_FIELDS,
  findActiveBl,
  type ClassificationResponse,
  type ShippingInstructionValues,
} from "@/lib/email-classification/schemas";

const EMPTY_SI = Object.fromEntries(
  COMPARED_FIELDS.map((field) => [field, null]),
) as ShippingInstructionValues;

function hasAnyValue(si: ShippingInstructionValues): boolean {
  return Object.values(si).some((value) => value !== null);
}

/**
 * The `shipping_instructions` row to write for one classified email, or null to
 * write none. This is storage policy rather than classification, so it lives
 * here instead of in `classifyEmail`: `/api/process-email` and the upload path
 * keep returning whatever the model produced.
 */
export function shippingInstructionRow(
  result: ClassificationResponse,
): ShippingInstructionValues | null {
  // Redundant with toResponse, which already nulls the field for non-BL
  // emails, and kept anyway: `status` is "OK" on every non-BL email (rules.md
  // invariant 6), so without this a GENERAL email would fall straight into the
  // OK branch below.
  if (!findActiveBl(result.categories)) return null;

  const si = result.shipping_instruction;

  // Nothing extracted on an OK comparison means no SI was sent — the sender is
  // asking us for ours. Nothing to store.
  if (result.status === "OK") return si && hasAnyValue(si) ? si : null;

  // MISMATCH and NEEDS_REVIEW both store what the SI carried, nulls included:
  // a missing_attachment or unreadable SI is recorded as an all-null row.
  return si ?? EMPTY_SI;
}
