// Pure helpers that read a needs-review case's SI/BL field rows: which document
// is missing, and which single values are blank. No LLM and no extra queries:
// everything is derived from the rows already joined in by getBatchEmailDetail.
import type { Field, FieldComparison } from "@/lib/types";

export type DocRole = "si" | "bl";

export const DOC_LABEL: Record<DocRole, string> = {
  si: "Shipping Instruction",
  bl: "Draft Bill of Lading",
};

const isBlank = (v: string | number | null) => v === null || String(v).trim() === "";

/** Documents whose 7 values are all blank: nothing was read from them. */
export function emptyRoles(fields: FieldComparison[]): DocRole[] {
  const roles: DocRole[] = [];
  if (fields.every((f) => isBlank(f.si))) roles.push("si");
  if (fields.every((f) => isBlank(f.bl))) roles.push("bl");
  return roles;
}

/** Which of the two documents were never provided. With no attachments at all,
 * both are missing; otherwise a document counts as missing when nothing was read from it. */
export function missingAttachmentRoles(fields: FieldComparison[], attachmentCount: number): DocRole[] {
  return attachmentCount === 0 ? ["si", "bl"] : emptyRoles(fields);
}

/** Single blank values on a document that otherwise has values, e.g. "Gross Weight: N/A". */
export function blankCells(fields: FieldComparison[]): { field: Field; role: DocRole }[] {
  const empty = new Set(emptyRoles(fields));
  const cells: { field: Field; role: DocRole }[] = [];
  for (const f of fields) {
    if (isBlank(f.si) && !empty.has("si")) cells.push({ field: f.field, role: "si" });
    if (isBlank(f.bl) && !empty.has("bl")) cells.push({ field: f.field, role: "bl" });
  }
  return cells;
}
