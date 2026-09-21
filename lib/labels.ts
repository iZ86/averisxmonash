import type { Category, Field, Result } from "./types";

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
