import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGmailClient, fetchWithBackoff } from "@/lib/google/gmail";
import { processSyncedEmail } from "./process-synced-email";

export type DrainResult = { ok: true; processed: number; } | { ok: false; error: string; };

/**
 * Claims and classifies queued emails one at a time until the queue is empty.
 * Shared by the process-queue route (user session client) and the Gmail push
 * webhook (service-role client).
 *
 * `claimAsService`: the original claim function filters on auth.uid(), which is
 * null under the service-role key, so it would never find a job. The webhook
 * uses the variant that takes the owner id explicitly.
 */
export async function drainProcessingQueue(
  supabase: SupabaseClient,
  userId: string,
  options: { claimAsService?: boolean } = {},
): Promise<DrainResult> {
  const gmail = createGmailClient();
  let processed = 0;

  while (true) {
    const { data: claimed, error: claimError } = options.claimAsService
      ? await supabase.rpc("claim_next_email_processing_job_for_user", { p_user_id: userId })
      : await supabase.rpc("claim_next_email_processing_job");
    if (claimError) return { ok: false, error: claimError.message };

    const emailId = (claimed as { email_id: string; }[] | null)?.[0]?.email_id;
    if (!emailId) break;

    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("id, gmail_message_id, from_address, subject, body")
      .eq("id", emailId)
      .eq("user_id", userId)
      .maybeSingle();

    if (emailError || !email) {
      await markJob(supabase, emailId, "failed", emailError?.message ?? "Email not found.");
      continue;
    }

    try {
      await processSyncedEmail(supabase, gmail, email, fetchWithBackoff);
      await markJob(supabase, emailId, "completed", null);
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from("processed_emails").insert({
        email_id: emailId,
        synced_email_id: emailId,
        status: "FAILED",
        reasoning: message,
        review_reason: null,
        has_defect: false,
        defect_fields: [],
        categories: null,
      });
      await markJob(supabase, emailId, "failed", message);
    }
  }

  return { ok: true, processed };
}

async function markJob(
  supabase: SupabaseClient,
  emailId: string,
  status: "completed" | "failed",
  error: string | null,
) {
  await supabase
    .from("email_processing_queue")
    .update({ status, last_error: error, updated_at: new Date().toISOString() })
    .eq("email_id", emailId);
}
