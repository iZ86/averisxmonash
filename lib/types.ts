export type Category =
  | "document_comparison"
  | "new_si_request"
  | "invoice_query"
  | "general"
  | "spam";

export type Result =
  | "no_mismatch"
  | "mismatch"
  | "needs_review"
  | "not_compared"
  | "failed";

export type Field =
  | "shipper"
  | "consignee"
  | "notify_party"
  | "port_of_loading"
  | "port_of_discharge"
  | "container_count"
  | "gross_weight_kg";

export type EmailStatus = "processed" | "processing" | "failed" | "classified" | "in_review";

export interface FieldComparison {
  field: Field;
  si: string | number | null;
  bl: string | number | null;
  match: boolean;
  /** How the BL labelled the field when it differs from the canonical name, e.g. "Load Port". */
  blLabel?: string;
  /** 0-100, null when nothing could be scored. */
  confidence: number | null;
}

export interface EmailResult {
  emailId: string;
  batchId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  category: Category;
  result: Result;
  status: EmailStatus;
  /** Classification confidence, 0-100. */
  classificationConfidence: number;
  /** Overall result confidence (lowest field confidence), null when not compared. */
  confidence: number | null;
  fields?: FieldComparison[];
  reviewReason?: string;
  attachments?: string[];
  body?: string;
  evidence?: { si: string[]; bl: string[]; flagged?: Field };
}

export interface ShipmentPort {
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  countryName: string;
  lat: number;
  lng: number;
}

export interface Shipment {
  id: string;
  /** Short reference shown in the UI. */
  label: string;
  emailId: string | null;
  /** Display names; the resolved port name, or the text as written when it could not be placed. */
  entryPort: string;
  exitPort: string;
  /** Port text exactly as stored on the shipping invoice. */
  entryText: string | null;
  exitText: string | null;
  /** Null when the port could not be matched to coordinates. */
  entry: ShipmentPort | null;
  exit: ShipmentPort | null;
  /** Straight-line distance between the two ports. */
  distanceKm: number | null;
  containers: string | null;
  grossWeightKg: number | null;
  shipper: string | null;
  consignee: string | null;
  notifyParty: string | null;
  result: Result;
  /** 0-100, null when nothing was scored. */
  confidence: number | null;
}
