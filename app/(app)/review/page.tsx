import type { Metadata } from "next";
import { PageHeader, SampleBadge } from "@/components/ui";
import { getReviewCases } from "@/lib/mock/data";
import { ReviewQueue } from "./review-queue";

export const metadata: Metadata = { title: "Review queue · Averis x Monash" };

export default function ReviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Human in the loop"
        title="Review queue"
        description="Cases the system could not decide on its own. Confirm or correct, then the report updates."
        actions={<SampleBadge />}
      />
      <ReviewQueue cases={getReviewCases()} />
    </>
  );
}
