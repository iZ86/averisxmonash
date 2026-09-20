import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyEmail } from "@/lib/email-classification/classify";

export const runtime = "nodejs";

// Re-runs classification for one already-synced email, using the attachment
// text already cached in email_attachments from the original sync (no Gmail
// call needed). A retry always inserts a new processed_emails row rather than
// updating the failed one — the batch_emails view already picks the most
// recent row per email, so this becomes the new result without needing a
// separate update path.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });

  let emailId: string;
  try {
    ({ emailId } = await request.json());
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof emailId !== "string" || !emailId) {
    return NextResponse.json({ success: false, error: "emailId is required." }, { status: 400 });
  }

  const { data: email, error: emailError } = await supabase
    .from("emails")
    .select("id, from_address, subject, body")
    .eq("id", emailId)
    .maybeSingle();
  if (emailError) return NextResponse.json({ success: false, error: emailError.message }, { status: 500 });
  if (!email) return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 });

  const { data: attachments, error: attError } = await supabase
    .from("email_attachments")
    .select("filename, extracted_text")
    .eq("email_id", emailId);
  if (attError) return NextResponse.json({ success: false, error: attError.message }, { status: 500 });

  try {
    // Re-classify from the text already extracted during sync — skips
    // toClassifierAttachment (which parses raw bytes by file extension; we
    // only have cached text here, not the original file bytes).
    const result = await classifyEmail({
      email_id: email.id,
      from: email.from_address,
      subject: email.subject,
      body: email.body ?? "",
      attachments: (attachments ?? []).map((a) => ({
        attachment_name: a.filename,
        attachment_content: a.extracted_text,
        ...(a.extracted_text ? {} : { note: "No text was extracted from this file during sync." }),
      })),
    });

    const { error } = await supabase.from("processed_emails").insert({
      email_id: email.id,
      synced_email_id: email.id,
      reasoning: result.reasoning,
      status: result.status,
      review_reason: result.review_reason,
      has_defect: result.has_defect,
      defect_fields: result.defect_fields,
      categories: result.categories,
    });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("processed_emails").insert({
      email_id: email.id,
      synced_email_id: email.id,
      status: "FAILED",
      reasoning: message,
      review_reason: null,
      has_defect: false,
      defect_fields: [],
      categories: null,
    });
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
