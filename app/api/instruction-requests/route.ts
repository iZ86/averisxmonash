import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { senderAddress } from "@/lib/batches/review-cases";
import { ATTACHMENT_BUCKET } from "@/lib/email-processing/attachment-storage";
import { createGmailClient } from "@/lib/google/gmail";
import { isSendScopeError, sendReply } from "@/lib/google/send-reply";
import { BL_FILENAME, SI_FIELDS, buildBlText, type SiValues } from "@/lib/instruction-requests/bl-text";
import { extractSiValues } from "@/lib/instruction-requests/extract";
import { saveRequestDetails } from "@/lib/instruction-requests/save";

export const runtime = "nodejs";
export const maxDuration = 120;

const uuid = z.string().uuid();
const values = z.object(Object.fromEntries(SI_FIELDS.map((f) => [f, z.string().trim().min(1, "Required")])) as Record<(typeof SI_FIELDS)[number], z.ZodString>);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extract"), processedEmailId: uuid }),
  z.object({ action: z.literal("send"), processedEmailId: uuid, values }),
]);

const COLUMNS = `${SI_FIELDS.join(", ")}, bl_filename`;
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// GET /api/instruction-requests?processedEmailId=... -> the SI values read from an instruction request,
// the BL file already generated for it (if any), and whether the sender has already been replied to.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return fail("Sign in required.", 401);

  const id = uuid.safeParse(new URL(request.url).searchParams.get("processedEmailId"));
  if (!id.success) return fail("processedEmailId is required.", 400);

  const [details, processed] = await Promise.all([
    supabase.from("shipping_instructions_request_details").select(COLUMNS).eq("processed_email_id", id.data).maybeSingle<Record<string, string | null>>(),
    supabase.from("processed_emails").select("email_sent").eq("id", id.data).maybeSingle<{ email_sent: boolean }>(),
  ]);
  const failure = details.error ?? processed.error;
  if (failure) return fail(errorMessage(failure), 500);

  const found = details.data
    ? { values: Object.fromEntries(SI_FIELDS.map((f) => [f, details.data?.[f] ?? ""])) as SiValues, blFilename: details.data.bl_filename ?? null }
    : null;
  return NextResponse.json({ success: true, details: found, emailSent: processed.data?.email_sent ?? false });
}

// POST /api/instruction-requests
//   { action: "extract" }: read the SI values from the stored email and attachment text (for requests processed before this existed).
//   { action: "send", values }: build BL.txt from the (possibly edited) values, store it in Supabase Storage,
//   record it on the request's details row, and reply to the sender with the file attached. One reply per email.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return fail("Sign in required.", 401);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  const input = parsed.data;

  const { data: processed } = await supabase
    .from("processed_emails")
    .select("synced_email_id, email_sent")
    .eq("id", input.processedEmailId)
    .maybeSingle<{ synced_email_id: string | null; email_sent: boolean }>();
  if (!processed?.synced_email_id) return fail("Email not found.", 404);

  const { data: email } = await supabase
    .from("emails")
    .select("id, from_address, subject, body, gmail_message_id, gmail_thread_id")
    .eq("id", processed.synced_email_id)
    .maybeSingle<{ id: string; from_address: string; subject: string; body: string | null; gmail_message_id: string; gmail_thread_id: string | null }>();
  if (!email) return fail("The original email was not found.", 404);

  if (input.action === "extract") {
    const { data: attachments, error: attError } = await supabase
      .from("email_attachments")
      .select("filename, extracted_text")
      .eq("email_id", email.id);
    if (attError) return fail(errorMessage(attError), 500);
    try {
      const extracted = await extractSiValues({
        from: email.from_address,
        subject: email.subject,
        body: email.body ?? "",
        attachments: (attachments ?? []).map((a) => ({ attachment_name: a.filename, attachment_content: a.extracted_text })),
      });
      const error = await saveRequestDetails(supabase, input.processedEmailId, extracted);
      if (error) return fail(errorMessage(error), 500);
      return NextResponse.json({ success: true, values: extracted });
    } catch (err) {
      return fail(`The shipping instruction could not be read: ${errorMessage(err)}`, 502);
    }
  }

  if (processed.email_sent) return fail("A reply has already been sent for this email.", 409);

  // Reserve the one reply before doing any work; false means someone else just sent it.
  const { data: claimed, error: claimError } = await supabase.rpc("claim_email_send", { p_processed_email_id: input.processedEmailId });
  if (claimError) return fail(errorMessage(claimError), 500);
  if (!claimed) return fail("A reply has already been sent for this email.", 409);
  const release = () => supabase.rpc("release_email_send", { p_processed_email_id: input.processedEmailId });

  const text = buildBlText(input.values);
  const bytes = Buffer.from(text, "utf8");
  const path = `${userId}/${email.id}/generated/${BL_FILENAME}`;

  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, { contentType: "text/plain; charset=utf-8", upsert: true });
  if (uploadError) {
    await release();
    return fail(`The BL file could not be stored: ${uploadError.message}`, 500);
  }

  const saveError = await saveRequestDetails(supabase, input.processedEmailId, input.values, BL_FILENAME);
  if (saveError) {
    await release();
    return fail(`The details could not be saved: ${errorMessage(saveError)}`, 500);
  }

  const to = senderAddress(email.from_address);
  const name = email.from_address.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.split(" ")[0];
  try {
    await sendReply(createGmailClient(), {
      to,
      subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`,
      body:
        `Hi${name ? ` ${name}` : ""},\n\n` +
        "Thank you for your Shipping Instruction. We have prepared the draft Bill of Lading from it, attached as " +
        `${BL_FILENAME}. Please review it and let us know if anything needs to change.\n\nThank you,\nAPRIL Group`,
      messageId: email.gmail_message_id,
      threadId: email.gmail_thread_id,
      attachments: [{ filename: BL_FILENAME, mimeType: "text/plain", data: bytes }],
    });
  } catch (err) {
    await release();
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

  return NextResponse.json({ success: true, sentTo: to, filename: BL_FILENAME });
}
