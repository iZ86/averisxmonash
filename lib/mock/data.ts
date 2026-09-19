// Typed mock data so every screen renders before the pipeline exists.
// Swap these accessors for real queries later; the types in ../types stay the same.
import type { Category, EmailResult, Field, FieldComparison, Result, Shipment } from "../types";

export const FIELD_LABEL: Record<Field, string> = {
  shipper: "Shipper",
  consignee: "Consignee",
  notify_party: "Notify party",
  port_of_loading: "Port of loading",
  port_of_discharge: "Port of discharge",
  container_count: "Container count",
  gross_weight_kg: "Gross weight (kg)",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  document_comparison: "Document comparison",
  new_si_request: "New SI request",
  invoice_query: "Invoice query",
  general: "General message",
  spam: "Spam",
};

export const RESULT_LABEL: Record<Result, string> = {
  no_mismatch: "No mismatch detected",
  mismatch: "Mismatch found",
  needs_review: "Needs review",
  not_compared: "Not compared",
  failed: "Processing failed",
};

function fields(overrides: Partial<Record<Field, Partial<FieldComparison>>> = {}): FieldComparison[] {
  const base: FieldComparison[] = [
    { field: "shipper", si: "Northwind Traders Sdn Bhd", bl: "Northwind Traders Sdn Bhd", match: true, confidence: 98 },
    { field: "consignee", si: "Fjord Imports BV", bl: "Fjord Imports BV", match: true, confidence: 96 },
    { field: "notify_party", si: "Fjord Imports BV", bl: "Fjord Imports BV", match: true, confidence: 95 },
    { field: "port_of_loading", si: "Port Klang", bl: "Port Klang", match: true, confidence: 93, blLabel: "Load Port" },
    { field: "port_of_discharge", si: "Rotterdam", bl: "Rotterdam", match: true, confidence: 97 },
    { field: "container_count", si: 3, bl: 3, match: true, confidence: 99 },
    { field: "gross_weight_kg", si: 22000, bl: 22000, match: true, confidence: 98 },
  ];
  return base.map((f) => ({ ...f, ...overrides[f.field] }));
}

export const emails: EmailResult[] = [
  {
    emailId: "e-001",
    batchId: "sample-batch-01",
    subject: "Draft BL check, booking request",
    sender: "ops@northwind.example",
    receivedAt: "Today, 09:12",
    category: "document_comparison",
    result: "mismatch",
    status: "processed",
    classificationConfidence: 97,
    confidence: 93,
    attachments: ["si_northwind.txt", "bl_draft_northwind.txt"],
    fields: fields({ container_count: { bl: 4, match: false } }),
    evidence: {
      si: ["Number of Containers: 3", "Gross Weight: 22,000 KG"],
      bl: ["Containers: 4", "Gross Wt: 22,000 KG"],
      flagged: "container_count",
    },
  },
  {
    emailId: "e-002",
    batchId: "sample-batch-01",
    subject: "Corrected BL for review",
    sender: "docs@northwind.example",
    receivedAt: "Today, 08:58",
    category: "document_comparison",
    result: "needs_review",
    status: "in_review",
    classificationConfidence: 96,
    confidence: 58,
    reviewReason: "Consignee wording differs; formatting or real difference?",
    attachments: ["si_northwind.txt", "bl_corrected.txt"],
    fields: fields({
      consignee: { si: "Fjord Imports BV", bl: "Fjord Imports B.V.", match: false, confidence: 58 },
    }),
    evidence: {
      si: ["Consignee: Fjord Imports BV"],
      bl: ["Consignee: Fjord Imports B.V."],
      flagged: "consignee",
    },
  },
  {
    emailId: "e-003",
    batchId: "sample-batch-01",
    subject: "Question about invoice 2291",
    sender: "accounts@harbor.example",
    receivedAt: "Today, 08:30",
    category: "invoice_query",
    result: "not_compared",
    status: "classified",
    classificationConfidence: 97,
    confidence: null,
    body: "[Message body shown here as received. The system read it only to decide its category.]",
  },
  {
    emailId: "e-004",
    batchId: "sample-batch-01",
    subject: "New shipping instruction",
    sender: "sales@northwind.example",
    receivedAt: "Yesterday, 17:05",
    category: "new_si_request",
    result: "not_compared",
    status: "classified",
    classificationConfidence: 96,
    confidence: null,
    body: "[Message body shown here as received. The system read it only to decide its category.]",
  },
  {
    emailId: "e-005",
    batchId: "sample-batch-01",
    subject: "BL vs SI, Rotterdam",
    sender: "ops@fjord.example",
    receivedAt: "Yesterday, 15:41",
    category: "document_comparison",
    result: "no_mismatch",
    status: "processed",
    classificationConfidence: 92,
    confidence: 92,
    attachments: ["si_fjord.txt", "bl_fjord.txt"],
    fields: fields(),
  },
  {
    emailId: "e-006",
    batchId: "sample-batch-01",
    subject: "BL scan, Jebel Ali booking",
    sender: "docs@gulf.example",
    receivedAt: "Yesterday, 13:26",
    category: "document_comparison",
    result: "needs_review",
    status: "in_review",
    classificationConfidence: 97,
    confidence: 41,
    reviewReason: "Gross weight unreadable on scanned BL",
    attachments: ["si_gulf.txt", "bl_scan_gulf.png"],
    fields: fields({
      gross_weight_kg: { bl: "2█,0█0", match: false, confidence: 41 },
    }),
    evidence: {
      si: ["Gross Weight: 22,000 KG"],
      bl: ["Gross Wt: 2█,0█0 KG"],
      flagged: "gross_weight_kg",
    },
  },
  {
    emailId: "e-007",
    batchId: "sample-batch-01",
    subject: "Please verify BL before release",
    sender: "docs@fjord.example",
    receivedAt: "Yesterday, 11:47",
    category: "document_comparison",
    result: "needs_review",
    status: "in_review",
    classificationConfidence: 95,
    confidence: null,
    reviewReason: "No draft BL attached",
    attachments: ["si_fjord.txt"],
  },
  {
    emailId: "e-008",
    batchId: "sample-batch-01",
    subject: "Shipping docs, Hamburg",
    sender: "ops@elbe.example",
    receivedAt: "Yesterday, 10:02",
    category: "document_comparison",
    result: "failed",
    status: "failed",
    classificationConfidence: 94,
    confidence: null,
  },
  {
    emailId: "e-009",
    batchId: "sample-batch-01",
    subject: "You have won a prize",
    sender: "no-reply@promo.example",
    receivedAt: "2 days ago",
    category: "spam",
    result: "not_compared",
    status: "classified",
    classificationConfidence: 99,
    confidence: null,
    body: "[Message body shown here as received. The system read it only to decide its category.]",
  },
  {
    emailId: "e-010",
    batchId: "sample-batch-01",
    subject: "BL vs SI, Penang",
    sender: "ops@penang.example",
    receivedAt: "2 days ago",
    category: "document_comparison",
    result: "needs_review",
    status: "in_review",
    classificationConfidence: 93,
    confidence: 72,
    reviewReason: "Notify party missing on BL",
    attachments: ["si_penang.txt", "bl_penang.txt"],
    fields: fields({ notify_party: { bl: null, match: false, confidence: 72 } }),
    evidence: { si: ["Notify Party: Fjord Imports BV"], bl: ["(no notify party found)"], flagged: "notify_party" },
  },
];

export function getEmail(emailId: string) {
  return emails.find((e) => e.emailId === emailId);
}

/** Review cases: anything needing a person, lowest confidence first; unscored cases last. */
export function getReviewCases() {
  return emails
    .filter((e) => e.result === "needs_review")
    .sort((a, b) => (a.confidence ?? 101) - (b.confidence ?? 101));
}

export const stats = {
  emailsProcessed: 1284,
  comparisonRequests: 312,
  withMismatch: 38,
  awaitingReview: 9,
  shipmentsMapped: 303,
  avgConfidence: 91,
  belowThreshold: 23,
  sentToReview: 14,
  failed: 2,
  byCategory: [
    { label: CATEGORY_LABEL.document_comparison, value: 312, highlight: true },
    { label: CATEGORY_LABEL.general, value: 341 },
    { label: CATEGORY_LABEL.invoice_query, value: 226 },
    { label: CATEGORY_LABEL.spam, value: 207 },
    { label: CATEGORY_LABEL.new_si_request, value: 198 },
  ],
  byField: [
    { label: FIELD_LABEL.container_count, value: 18, highlight: true },
    { label: FIELD_LABEL.gross_weight_kg, value: 11 },
    { label: FIELD_LABEL.consignee, value: 6 },
    { label: FIELD_LABEL.notify_party, value: 5 },
    { label: FIELD_LABEL.port_of_discharge, value: 3 },
    { label: FIELD_LABEL.port_of_loading, value: 2 },
    { label: FIELD_LABEL.shipper, value: 2 },
  ],
  results: { noMismatch: 265, mismatch: 38, needsReview: 9 },
};

export const shipments: Shipment[] = [
  { id: "SHP-001", emailId: "e-001", entryPort: "Port Klang", entryLocode: "MYPKG", exitPort: "Rotterdam", exitLocode: "NLRTM", distanceKm: 10240, containers: "3 / 4", grossWeightKg: 22000, shipper: "Northwind Traders Sdn Bhd", consignee: "Fjord Imports BV", result: "mismatch", confidence: 94 },
  { id: "SHP-002", emailId: "e-005", entryPort: "Shanghai", entryLocode: "CNSHA", exitPort: "Los Angeles", exitLocode: "USLAX", distanceKm: 10456, containers: "3", grossWeightKg: 18400, shipper: "Eastbridge Trading Co", consignee: "Pacific Rim Imports", result: "no_mismatch", confidence: 96 },
  { id: "SHP-003", emailId: "e-002", entryPort: "Singapore", entryLocode: "SGSIN", exitPort: "Hamburg", exitLocode: "DEHAM", distanceKm: 10148, containers: "—", grossWeightKg: null, shipper: "Northwind Traders Sdn Bhd", consignee: "Elbe Handel GmbH", result: "needs_review", confidence: 58 },
  { id: "SHP-004", emailId: "e-005", entryPort: "Port Klang", entryLocode: "MYPKG", exitPort: "Melbourne", exitLocode: "AUMEL", distanceKm: 6375, containers: "3", grossWeightKg: 21300, shipper: "Harbor Goods Sdn Bhd", consignee: "Southern Cross Pty", result: "no_mismatch", confidence: 92 },
  { id: "SHP-005", emailId: "e-005", entryPort: "Penang", entryLocode: "MYPEN", exitPort: "Jebel Ali", exitLocode: "AEJEA", distanceKm: 5289, containers: "3", grossWeightKg: 19750, shipper: "Penang Textiles Bhd", consignee: "Gulf Distribution FZE", result: "no_mismatch", confidence: 95 },
];
