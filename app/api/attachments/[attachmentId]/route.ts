import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createGmailClient, fetchWithBackoff, parseMessage } from "@/lib/google/gmail";
import { inlineContentType, previewKind } from "@/lib/batches/preview-kind";
import { renderPreviewHtml } from "@/lib/email-processing/preview-html";
import { ATTACHMENT_BUCKET, attachmentPath, uploadAttachment } from "@/lib/email-processing/attachment-storage";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

type Row = {
  id: string;
  email_id: string;
  filename: string;
  mime_type: string | null;
  position: number;
  storage_path: string | null;
};

// GET /api/attachments/:attachmentId[?download=1|?preview=1] streams the stored copy of an attachment.
// Emails synced before storage existed are fetched from Gmail once and stored on first view.
export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  const { data: row } = await supabase
    .from("email_attachments")
    .select("id, email_id, filename, mime_type, position, storage_path")
    .eq("id", attachmentId)
    .maybeSingle<Row>();
  if (!row) return Response.json({ error: "Attachment not found." }, { status: 404 });

  let bytes: Buffer | null = null;
  if (row.storage_path) {
    const { data } = await supabase.storage.from(ATTACHMENT_BUCKET).download(row.storage_path);
    if (data) bytes = Buffer.from(await data.arrayBuffer());
  }

  if (!bytes) {
    try {
      bytes = await backfillFromGmail(supabase, userId, row);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not fetch the attachment from Gmail.";
      return Response.json({ error: message }, { status: 502 });
    }
    if (!bytes) return Response.json({ error: "Attachment file is not available." }, { status: 404 });
  }

  const search = new URL(request.url).searchParams;
  const kind = previewKind(row.filename, row.mime_type);
  const common = { "x-content-type-options": "nosniff", "cache-control": "private, max-age=3600" };

  // Text, CSV, Word and Excel files are converted to inert HTML; scripts and remote loads are blocked.
  if (search.get("preview") === "1" && kind === "html") {
    const html = await renderPreviewHtml(row.filename, bytes);
    if (html) {
      return new Response(html, {
        headers: {
          ...common,
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        },
      });
    }
  }

  // Only PDFs and images render inline; everything else, including HTML/SVG, downloads.
  const inline = (kind === "pdf" || kind === "image") && search.get("download") !== "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...common,
      "content-type": inline ? inlineContentType(row.filename, row.mime_type) : (row.mime_type ?? "application/octet-stream"),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      // The sandbox directive blocks Chrome's built-in PDF viewer, so PDFs are served without it.
      ...(kind === "pdf" && inline ? {} : { "content-security-policy": "sandbox" }),
    },
  });
}

async function backfillFromGmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  row: Row,
): Promise<Buffer | null> {
  const { data: email } = await supabase
    .from("emails")
    .select("gmail_message_id")
    .eq("id", row.email_id)
    .maybeSingle<{ gmail_message_id: string }>();
  if (!email) return null;

  const gmail = createGmailClient();
  const { data: message } = await fetchWithBackoff(() =>
    gmail.users.messages.get({ userId: "me", id: email.gmail_message_id, format: "full" }),
  );
  // `position` is the index into parseMessage's attachment order, as written at sync time.
  const ref = parseMessage(message.payload).attachments[row.position];
  if (!ref) return null;

  const { data } = await fetchWithBackoff(() =>
    gmail.users.messages.attachments.get({ userId: "me", messageId: email.gmail_message_id, id: ref.attachmentId }),
  );
  if (!data.data || (data.size ?? 0) > MAX_BYTES) return null;
  const bytes = Buffer.from(data.data, "base64url");

  const path = await uploadAttachment(
    supabase,
    attachmentPath(userId, row.email_id, row.position, row.filename),
    bytes,
    row.mime_type,
  );
  if (path) await supabase.from("email_attachments").update({ storage_path: path }).eq("id", row.id);
  return bytes;
}
