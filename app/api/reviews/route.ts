import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { REVIEW_CASES, REVIEW_FIELDS, isReviewReason, replyContent, type FieldValues } from "@/lib/batches/review-cases";
import { createGmailClient } from "@/lib/google/gmail";
import { isSendScopeError, sendReply } from "@/lib/google/send-reply";

export const runtime = "nodejs";

const uuid = z.string().uuid();
const fieldValues = z.object(Object.fromEntries(REVIEW_FIELDS.map((f) => [f, z.string().trim().min(1, "Required")])) as Record<(typeof REVIEW_FIELDS)[number], z.ZodString>);

const body = z.discriminatedUnion("decision", [
  z.object({ processedEmailId: uuid, decision: z.literal("accepted"), fieldValues }),
  z.object({
    processedEmailId: uuid,
    decision: z.literal("rejected"),
    /** The reviewer's edits to the reply. The recipient is always the original sender. */
    subject: z.string().trim().min(1).max(300).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
  }),
]);

const COLUMNS = REVIEW_FIELDS.join(", ");

// GET /api/reviews?processedEmailId=... -> what the system read for the 7 fields (the form's starting
// values), any decision already saved, and whether a reply has already gone to the sender.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const id = uuid.safeParse(new URL(request.url).searchParams.get("processedEmailId"));
  if (!id.success) return NextResponse.json({ success: false, error: "processedEmailId is required." }, { status: 400 });

  const [fields, resolution, sent] = await Promise.all([
    supabase.from("shipping_instructions").select(COLUMNS).eq("processed_email_id", id.data).maybeSingle<Partial<Record<string, string | null>>>(),
    supabase.from("review_resolutions").select("decision, action, resolved_at").eq("processed_email_id", id.data).maybeSingle(),
    supabase.from("processed_emails").select("email_sent").eq("id", id.data).maybeSingle<{ email_sent: boolean }>(),
  ]);
  const failure = fields.error ?? resolution.error ?? sent.error;
  if (failure) return NextResponse.json({ success: false, error: errorMessage(failure) }, { status: 500 });

  const defaults = fields.data
    ? (Object.fromEntries(REVIEW_FIELDS.map((f) => [f, fields.data?.[f] ?? ""])) as FieldValues)
    : null;
  return NextResponse.json({ success: true, defaults, resolution: resolution.data, emailSent: sent.data?.email_sent ?? false });
}

// POST /api/reviews saves a decision. Accepting stores the confirmed fields in shipping_instructions and
// marks the email OK. Rejecting emails the sender (a reply on the original thread, worded for the review
// reason) and then records the decision. Only one reply is ever sent per email (processed_emails.email_sent).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const input = parsed.data;

  let action = "manual_entry";
  let sentTo: string | undefined;
  if (input.decision === "rejected") {
    const { data: processed } = await supabase
      .from("processed_emails")
      .select("email_id, review_reason, email_sent")
      .eq("id", input.processedEmailId)
      .maybeSingle<{ email_id: string; review_reason: string | null; email_sent: boolean }>();
    if (!processed) return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 });
    if (!isReviewReason(processed.review_reason)) {
      return NextResponse.json({ success: false, error: "This case has no reason to reject with." }, { status: 422 });
    }
    if (processed.email_sent) {
      return NextResponse.json({ success: false, error: "A reply has already been sent for this email." }, { status: 409 });
    }
    const { data: email } = await supabase
      .from("emails")
      .select("from_address, subject, gmail_message_id, gmail_thread_id")
      .eq("id", processed.email_id)
      .maybeSingle<{ from_address: string; subject: string; gmail_message_id: string; gmail_thread_id: string | null }>();
    if (!email) return NextResponse.json({ success: false, error: "The original email was not found." }, { status: 404 });

    // Reserve the one reply before sending; false means someone else just sent it.
    const { data: claimed, error: claimError } = await supabase.rpc("claim_email_send", { p_processed_email_id: input.processedEmailId });
    if (claimError) return NextResponse.json({ success: false, error: errorMessage(claimError) }, { status: 500 });
    if (!claimed) return NextResponse.json({ success: false, error: "A reply has already been sent for this email." }, { status: 409 });

    action = REVIEW_CASES[processed.review_reason].reject.action;
    const template = replyContent({ from: email.from_address, subject: email.subject, reason: processed.review_reason });
    const reply = { to: template.to, subject: input.subject ?? template.subject, body: input.body ?? template.body };
    try {
      await sendReply(createGmailClient(), { ...reply, messageId: email.gmail_message_id, threadId: email.gmail_thread_id });
      sentTo = reply.to;
    } catch (err) {
      await supabase.rpc("release_email_send", { p_processed_email_id: input.processedEmailId });
      const needsReauth = isSendScopeError(err);
      return NextResponse.json(
        {
          success: false,
          needsReauth,
          error: needsReauth
            ? "The connected Gmail account is not allowed to send email. Re-authorise it with the gmail.send permission and update GOOGLE_REFRESH_TOKEN."
            : `The reply could not be sent: ${errorMessage(err)}`,
        },
        { status: 502 },
      );
    }
  }

  const { error } = await supabase.rpc("resolve_review", {
    p_processed_email_id: input.processedEmailId,
    p_decision: input.decision,
    p_action: action,
    p_field_values: input.decision === "accepted" ? input.fieldValues : null,
  });
  if (error) {
    const note = sentTo ? ` The reply to ${sentTo} was sent, but the decision could not be saved.` : "";
    return NextResponse.json({ success: false, error: `${errorMessage(error)}${note}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, sentTo });
}
