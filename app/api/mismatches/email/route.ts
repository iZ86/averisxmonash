import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { mismatchEmail } from "@/lib/batches/mismatch-email";
import { createGmailClient } from "@/lib/google/gmail";
import { isSendScopeError, sendReply } from "@/lib/google/send-reply";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PER_REQUEST = 200;
const uuid = z.string().uuid();

const body = z
  .object({
    /** processed_emails ids to email. */
    processedEmailIds: z.array(uuid).min(1).max(MAX_PER_REQUEST).optional(),
    /** Email every mismatch instead. */
    all: z.boolean().optional(),
  })
  .refine((v) => v.all || v.processedEmailIds, { message: "Give processedEmailIds or all" });

type Processed = { id: string; email_id: string; defect_fields: string[] | null; email_sent: boolean };
type EmailRow = { id: string; from_address: string; subject: string; gmail_message_id: string; gmail_thread_id: string | null };

// POST /api/mismatches/email emails the sender of each MISMATCH email (a reply on the original thread listing the
// fields that differ) from the connected Gmail account. An email is only ever replied to once: each one is
// claimed (processed_emails.email_sent) before sending, so repeats, double clicks and parallel requests skip it.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const { all, processedEmailIds } = parsed.data;

  let query = supabase.from("processed_emails").select("id, email_id, defect_fields, email_sent").eq("status", "MISMATCH");
  if (!all) query = query.in("id", processedEmailIds!);
  const { data: processed, error: processedError } = await query.limit(MAX_PER_REQUEST + 1).returns<Processed[]>();
  if (processedError) {
    return NextResponse.json(
      { success: false, error: `${errorMessage(processedError)}. Has the email_sent migration been run?` },
      { status: 500 },
    );
  }
  if (processed.length > MAX_PER_REQUEST) {
    return NextResponse.json({ success: false, error: `Too many at once. Send at most ${MAX_PER_REQUEST} per request.` }, { status: 413 });
  }

  const { data: emails, error: emailsError } = await supabase
    .from("emails")
    .select("id, from_address, subject, gmail_message_id, gmail_thread_id")
    .in("id", processed.map((p) => p.email_id))
    .returns<EmailRow[]>();
  if (emailsError) return NextResponse.json({ success: false, error: errorMessage(emailsError) }, { status: 500 });
  const emailById = new Map(emails.map((e) => [e.id, e]));

  const gmail = createGmailClient();
  let sent = 0;
  let skipped = 0;
  const failed: { id: string; subject: string; error: string }[] = [];

  for (const row of processed) {
    if (row.email_sent) {
      skipped++;
      continue;
    }
    const email = emailById.get(row.email_id);
    if (!email) {
      failed.push({ id: row.id, subject: "(email not found)", error: "The original email was not found." });
      continue;
    }

    // Reserve the one reply first; false means it was already sent (or is being sent right now).
    const { data: claimed, error: claimError } = await supabase.rpc("claim_email_send", { p_processed_email_id: row.id });
    if (claimError) {
      failed.push({ id: row.id, subject: email.subject, error: errorMessage(claimError) });
      continue;
    }
    if (!claimed) {
      skipped++;
      continue;
    }

    const message = mismatchEmail({ from: email.from_address, subject: email.subject, fields: row.defect_fields ?? [] });
    try {
      await sendReply(gmail, { ...message, messageId: email.gmail_message_id, threadId: email.gmail_thread_id });
      sent++;
    } catch (err) {
      await supabase.rpc("release_email_send", { p_processed_email_id: row.id });
      if (isSendScopeError(err)) {
        return NextResponse.json(
          {
            success: false,
            needsReauth: true,
            sent,
            skipped,
            error: "The connected Gmail account is not allowed to send email. Re-authorise it with the gmail.send permission and update GOOGLE_REFRESH_TOKEN.",
          },
          { status: 502 },
        );
      }
      failed.push({ id: row.id, subject: email.subject, error: errorMessage(err) });
    }
  }

  return NextResponse.json({ success: true, sent, skipped, failed });
}
