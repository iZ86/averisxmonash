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

export interface Shipment {
  id: string;
  emailId: string;
  entryPort: string;
  entryLocode: string;
  exitPort: string;
  exitLocode: string;
  distanceKm: number;
  containers: string;
  grossWeightKg: number | null;
  shipper: string;
  consignee: string;
  result: Result;
  confidence: number;
}
