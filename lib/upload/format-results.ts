import type { ClassificationResponse, InboxResult } from "@/lib/email-processing/types";

type Category = ClassificationResponse["categories"][number];

export type SubmissionEntry = {
  category: Category["category"];
  status: ClassificationResponse["status"];
  review_reason: ClassificationResponse["review_reason"];
  defect_fields: ClassificationResponse["defect_fields"];
  has_defect: boolean;
};

/** The highest-confidence category; ties go to BL_COMPARISON, matching the output rules. */
export function topCategory(result: ClassificationResponse): Category {
  return [...result.categories].sort(
    (a, b) =>
      b.confidence_score - a.confidence_score ||
      Number(b.category === "BL_COMPARISON") - Number(a.category === "BL_COMPARISON"),
  )[0];
}

/** Formats results for export (submission.json), keyed by email_id. Failed emails are left out. */
export function formatResults(results: InboxResult[]): Record<string, SubmissionEntry> {
  const submission: Record<string, SubmissionEntry> = {};
  for (const r of results) {
    if (!r.ok) continue;
    const { status, review_reason, defect_fields, has_defect } = r.result;
    submission[r.email_id] = {
      category: topCategory(r.result).category,
      status,
      review_reason,
      defect_fields,
      has_defect,
    };
  }
  return submission;
}
