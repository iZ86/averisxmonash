import "server-only";
import { resolvePort, type ResolvedPort } from "@/lib/geo/resolve-port";
import { haversineKm } from "@/lib/ports";
import { createClient } from "@/lib/supabase/server";
import type { Result, Shipment, ShipmentPort } from "@/lib/types";

type ProcessedRow = {
  email_id: string | null;
  status: string | null;
  categories: { category: string; confidence_score: number }[] | null;
  created_at: string;
};

type InstructionRow = {
  id: string;
  created_at: string;
  shipper: string | null;
  consignee: string | null;
  notify_party: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  container_count: string | null;
  gross_weight_kg: string | null;
  processed_emails: ProcessedRow | ProcessedRow[] | null;
};

const RESULT: Record<string, Result> = {
  OK: "no_mismatch",
  MISMATCH: "mismatch",
  NEEDS_REVIEW: "needs_review",
  FAILED: "failed",
};

const clean = (v: string | null) => v?.trim() || null;

/** "72,450.00 KG" -> 72450. Values given in tonnes are converted. */
function parseWeightKg(text: string | null): number | null {
  const match = text?.replace(/,/g, "").match(/\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return /\b(MT|TON|TONS|TONNE|TONNES)\b/i.test(text!) ? value * 1000 : value;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** Confidence in the BL comparison (or the top category when there is none), as 0-100. */
function confidenceOf(categories: ProcessedRow["categories"]): number | null {
  if (!categories?.length) return null;
  const pick = categories.find((c) => c.category === "BL_COMPARISON") ?? categories.reduce((a, b) => (b.confidence_score > a.confidence_score ? b : a));
  const score = pick.confidence_score;
  return Math.round(score <= 1 ? score * 100 : score);
}

function toPort(resolved: ResolvedPort | null): ShipmentPort | null {
  return resolved && { name: resolved.name, country: resolved.country, countryName: resolved.countryName, lat: resolved.lat, lng: resolved.lng };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EmailRow = { id: string; subject: string; from_address: string; received_at: string };

export async function getShipments(): Promise<Shipment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_instructions")
    .select(
      "id, created_at, shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count, gross_weight_kg, processed_emails(email_id, status, categories, created_at)",
    )
    .returns<InstructionRow[]>();
  if (error) throw new Error(`shipping_instructions: ${error.message}`);

  const emailIds = [...new Set(data.map((r) => (Array.isArray(r.processed_emails) ? r.processed_emails[0] : r.processed_emails)?.email_id).filter((id): id is string => !!id && UUID.test(id)))];
  const emails = new Map<string, EmailRow>();
  if (emailIds.length) {
    const { data: rows, error: emailError } = await supabase
      .from("emails")
      .select("id, subject, from_address, received_at")
      .in("id", emailIds)
      .returns<EmailRow[]>();
    if (emailError) throw new Error(`emails: ${emailError.message}`);
    for (const e of rows) emails.set(e.id, e);
  }

  return data
    .map((row) => {
      const processed = Array.isArray(row.processed_emails) ? row.processed_emails[0] : row.processed_emails;
      const email = processed?.email_id ? emails.get(processed.email_id) : undefined;
      const entry = toPort(resolvePort(row.port_of_loading));
      const exit = toPort(resolvePort(row.port_of_discharge));
      const shipment: Shipment = {
        id: row.id,
        label: `SHP-${row.id.slice(0, 6).toUpperCase()}`,
        emailId: processed?.email_id ?? null,
        subject: email?.subject ?? null,
        sender: email?.from_address ?? null,
        receivedAt: email?.received_at ?? null,
        entryPort: entry?.name ?? (row.port_of_loading ? titleCase(row.port_of_loading) : "Unknown"),
        exitPort: exit?.name ?? (row.port_of_discharge ? titleCase(row.port_of_discharge) : "Unknown"),
        entryText: row.port_of_loading,
        exitText: row.port_of_discharge,
        entry,
        exit,
        distanceKm: entry && exit ? Math.round(haversineKm(entry, exit)) : null,
        containers: clean(row.container_count),
        grossWeightKg: parseWeightKg(row.gross_weight_kg),
        shipper: clean(row.shipper),
        consignee: clean(row.consignee),
        notifyParty: clean(row.notify_party),
        result: RESULT[processed?.status ?? ""] ?? "not_compared",
        confidence: confidenceOf(processed?.categories ?? null),
      };
      return { shipment, at: row.created_at };
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((s) => s.shipment);
}
