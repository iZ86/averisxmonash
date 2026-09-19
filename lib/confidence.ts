export const AUTO_ACCEPT_THRESHOLD = 85;

export type ConfidenceLevel = "high" | "medium" | "low";

/** >= 85 high, 60-84 medium, < 60 low. */
export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= AUTO_ACCEPT_THRESHOLD) return "high";
  if (score >= 60) return "medium";
  return "low";
}

export const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Class suffix used by `.meter i.*`. */
export const LEVEL_METER: Record<ConfidenceLevel, "hi" | "mid" | "lo"> = {
  high: "hi",
  medium: "mid",
  low: "lo",
};

/** Text colour token for a large confidence number. */
export const LEVEL_TEXT: Record<ConfidenceLevel, string> = {
  high: "text-status-match",
  medium: "text-accent-text",
  low: "text-status-mismatch",
};
