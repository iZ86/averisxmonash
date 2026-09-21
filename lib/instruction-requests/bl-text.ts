// Pure helpers for the "Instructions Requests" flow: the 7 SI values and the BL.txt document built from them.
// No server-only import: the browser previews and downloads the same text the server stores and emails.

export const SI_FIELDS = [
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
] as const;
export type SiField = (typeof SI_FIELDS)[number];
export type SiValues = Record<SiField, string>;

export const BL_FILENAME = "BL.txt";

export const blankSiValues = (): SiValues => Object.fromEntries(SI_FIELDS.map((f) => [f, ""])) as SiValues;

/** How each field is labelled in the BL.txt document. */
const BL_LABEL: Record<SiField, string> = {
  shipper: "SHIPPER",
  consignee: "CONSIGNEE",
  notify_party: "Notify",
  port_of_loading: "Port of Loading (POL)",
  port_of_discharge: "POD",
  container_count: "Container Count",
  gross_weight_kg: "Gross Wt (kgs)",
};

/** Parties are stored on one line as "NAME; ADDRESS...". The document puts the name first and the address on an indented line below it. */
const PARTY_FIELDS: readonly SiField[] = ["shipper", "consignee", "notify_party"];

function line(field: SiField, raw: string): string {
  const value = raw.trim();
  if (PARTY_FIELDS.includes(field)) {
    const cut = value.indexOf(";");
    if (cut !== -1) {
      const name = value.slice(0, cut).trim();
      const address = value.slice(cut + 1).trim();
      return address ? `${BL_LABEL[field]}: ${name}\n  ${address}` : `${BL_LABEL[field]}: ${name}`;
    }
  }
  return `${BL_LABEL[field]}: ${value}`;
}

/** The BL.txt document for one Shipping Instruction. */
export function buildBlText(values: SiValues): string {
  return ["BILL OF LADING (DRAFT)", "=".repeat(40), "", ...SI_FIELDS.map((f) => line(f, values[f] ?? ""))].join("\n") + "\n";
}
