import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGmailClient, fetchWithBackoff } from "@/lib/google/gmail";
import { errorMessage } from "@/lib/errors";
import { processSyncedEmail } from "@/lib/email-processing/process-synced-email";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const gmail = createGmailClient();
  let processed = 0;

  while (true) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_next_email_processing_job");
    if (claimError) return NextResponse.json({ success: false, error: claimError.message }, { status: 500 });

    const emailId = (claimed as { email_id: string; }[] | null)?.[0]?.email_id;
    if (!emailId) break;

    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("id, user_id, gmail_message_id, from_address, subject, body")
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
      const message = errorMessage(error);
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

  return NextResponse.json({ success: true, processed });
}

async function markJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  emailId: string,
  status: "completed" | "failed",
  error: string | null,
) {
  await supabase
    .from("email_processing_queue")
    .update({ status, last_error: error, updated_at: new Date().toISOString() })
    .eq("email_id", emailId);
}
