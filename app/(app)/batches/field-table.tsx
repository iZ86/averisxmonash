import { Flag } from "lucide-react";
import type { BatchEmail } from "@/lib/batches/types";
import { ViewFileButton } from "./file-viewer";
import { FIELD_LABEL } from "@/lib/labels";
import { orderedFields } from "@/lib/batches/comparison-report";
import { displayValue } from "@/lib/batches/word-diff";
import type { FieldComparison } from "@/lib/types";

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

type Props = {
  fields: FieldComparison[];
  /** Attachments for the "View file" buttons in the column headers; omit to hide them. */
  attachments?: BatchEmail["attachments"];
  /** When set, both value columns become editable inputs. */
  edit?: { si: Record<string, string>; bl: Record<string, string>; onChange: (role: "si" | "bl", field: string, value: string) => void };
};

/** SI vs draft BL values for a needs-review case. Blank values are marked "Missing or unreadable"; no match/mismatch verdict is shown, because none was made. */
export function FieldTable({ fields, attachments, edit }: Props) {
  const rows = orderedFields(fields);
  if (rows.length === 0) return null;

  return (
    <div className="card overflow-x-auto">
      <table className="tbl w-full table-fixed">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[33%]" />
          <col className="w-[33%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead>
          <tr>
            <th>Field</th>
            <th>
              SI (reference)
              {attachments && <ViewFileButton attachments={attachments} preferIndex={0} title="Shipping Instruction: attached files" />}
            </th>
            <th>
              Draft BL
              {attachments && <ViewFileButton attachments={attachments} preferIndex={1} title="Draft Bill of Lading: attached files" />}
            </th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const si = displayValue(f.si);
            const bl = displayValue(f.bl);
            const editedSi = edit ? edit.si[f.field] ?? "" : si;
            const editedBl = edit ? edit.bl[f.field] ?? "" : bl;
            const missing = edit ? !editedSi.trim() || !editedBl.trim() : !si || !bl;
            return (
              <tr key={f.field} style={missing ? { background: "var(--accent-soft)" } : undefined}>
                <td className="font-medium">{FIELD_LABEL[f.field]}</td>
                <td className="wrap-break-word">
                  {edit ? (
                    <div className="input">
                      <input
                        aria-label={`${FIELD_LABEL[f.field]} (SI)`}
                        className="w-full bg-transparent outline-none"
                        value={editedSi}
                        onChange={(e) => edit.onChange("si", f.field, e.target.value)}
                      />
                    </div>
                  ) : (
                    si || <span className="text-text-muted">Missing or unreadable</span>
                  )}
                </td>
                <td className="wrap-break-word">
                  {edit ? (
                    <div className="input">
                      <input
                        aria-label={`${FIELD_LABEL[f.field]} (BL)`}
                        className="w-full bg-transparent outline-none"
                        value={editedBl}
                        onChange={(e) => edit.onChange("bl", f.field, e.target.value)}
                      />
                    </div>
                  ) : (
                    bl || <span className="text-text-muted">Missing or unreadable</span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {missing ? (
                    <span className="badge rev">
                      <Flag {...ICON} /> Missing or unreadable
                    </span>
                  ) : (
                    <span className="text-text-muted">Read</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
