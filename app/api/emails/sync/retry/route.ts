import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyEmail } from "@/lib/email-classification/classify";
import type { ExtractedDocumentValues } from "@/lib/email-classification/schemas";
import { errorMessage } from "@/lib/errors";
import {
  billOfLadingRow,
  shippingInstructionRequestRow,
  shippingInstructionRow,
} from "@/lib/email-processing/extracted-documents";

export const runtime = "nodejs";

// Re-runs classification for one already-synced email, using the attachment
// text already cached in email_attachments from the original sync (no Gmail
// call needed). processed_emails.email_id is unique, so a retry upserts over
// the existing row (including a FAILED one) instead of adding a second.
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

    // ON CONFLICT DO UPDATE keeps the existing row's `id` (it isn't in the
    // payload), so any shipping_instructions row already pointing at it stays
    // valid and is overwritten below rather than orphaned.
    const { data: processed, error } = await supabase.from("processed_emails").upsert(
      {
        email_id: email.id,
        synced_email_id: email.id,
        reasoning: result.reasoning,
        status: result.status,
        review_reason: result.review_reason,
        has_defect: result.has_defect,
        defect_fields: result.defect_fields,
        categories: result.categories,
        created_at: new Date().toISOString(),
      },
      { onConflict: "email_id" },
    )
      .select("id")
      .single();
    if (error) throw error;

    // Unlike the sync path, a retry can also need to *clear* a row: a
    // re-classification that turns MISMATCH into OK-with-nothing-attached would
    // otherwise leave the old values behind. `on delete cascade` doesn't help —
    // the parent is upserted, not deleted.
    const siError = await writeDocumentRow(
      supabase,
      "shipping_instructions",
      processed.id,
      shippingInstructionRow(result),
    );
    if (siError) throw siError;

    const blError = await writeDocumentRow(
      supabase,
      "bill_of_lading",
      processed.id,
      billOfLadingRow(result),
    );
    if (blError) throw blError;

    // Cleared the same way: an email re-classified out of SI_REQUEST shouldn't
    // keep the instructions extracted under the old category.
    const siRequestError = await writeDocumentRow(
      supabase,
      "shipping_instructions_request_details",
      processed.id,
      shippingInstructionRequestRow(result),
    );
    if (siRequestError) throw siRequestError;

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = errorMessage(error);
    await supabase.from("processed_emails").upsert(
      {
        email_id: email.id,
        synced_email_id: email.id,
        status: "FAILED",
        reasoning: message,
        review_reason: null,
        has_defect: false,
        defect_fields: [],
        categories: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "email_id" },
    );
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

/** Upserts the extracted row, or clears it when this classification wants none. */
async function writeDocumentRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "shipping_instructions" | "bill_of_lading" | "shipping_instructions_request_details",
  processedEmailId: string,
  row: ExtractedDocumentValues | null,
) {
  const { error } = row
    ? await supabase
        .from(table)
        .upsert({ processed_email_id: processedEmailId, ...row }, { onConflict: "processed_email_id" })
    : await supabase.from(table).delete().eq("processed_email_id", processedEmailId);
  return error;
}
