import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { senderAddress } from "@/lib/batches/review-cases";
import { createGmailClient } from "@/lib/google/gmail";
import { isSendScopeError, sendReply } from "@/lib/google/send-reply";

export const runtime = "nodejs";

const body = z.object({
  processedEmailId: z.string().uuid(),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.string().trim().min(1, "Message is required").max(5000),
});

const fail = (error: string, status: number, extra: object = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

// POST /api/emails/reply sends a free-form reply (written by the reviewer) to the sender of a processed email,
// on the original Gmail thread. Only one reply is ever sent per email (processed_emails.email_sent).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return fail("Sign in required.", 401);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  const input = parsed.data;

  const { data: processed } = await supabase
    .from("processed_emails")
    .select("synced_email_id, email_sent")
    .eq("id", input.processedEmailId)
    .maybeSingle<{ synced_email_id: string | null; email_sent: boolean }>();
  if (!processed?.synced_email_id) return fail("Email not found.", 404);
  if (processed.email_sent) return fail("A reply has already been sent for this email.", 409);

  const { data: email } = await supabase
    .from("emails")
    .select("from_address, gmail_message_id, gmail_thread_id")
    .eq("id", processed.synced_email_id)
    .maybeSingle<{ from_address: string; gmail_message_id: string; gmail_thread_id: string | null }>();
  if (!email) return fail("The original email was not found.", 404);

  // Reserve the one reply before sending; false means someone else just sent it.
  const { data: claimed, error: claimError } = await supabase.rpc("claim_email_send", { p_processed_email_id: input.processedEmailId });
  if (claimError) return fail(errorMessage(claimError), 500);
  if (!claimed) return fail("A reply has already been sent for this email.", 409);

  const to = senderAddress(email.from_address);
  try {
    await sendReply(createGmailClient(), {
      to,
      subject: input.subject,
      body: input.body,
      messageId: email.gmail_message_id,
      threadId: email.gmail_thread_id,
    });
  } catch (err) {
    await supabase.rpc("release_email_send", { p_processed_email_id: input.processedEmailId });
    const needsReauth = isSendScopeError(err);
    return fail(
      needsReauth
        ? "The connected Gmail account is not allowed to send email. Re-authorise it with the gmail.send permission and update GOOGLE_REFRESH_TOKEN."
        : `The reply could not be sent: ${errorMessage(err)}`,
      502,
      { needsReauth },
    );
  }
  return NextResponse.json({ success: true, sentTo: to });
}
