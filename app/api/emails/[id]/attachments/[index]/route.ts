import { createGmailClient, parseMessage } from "@/lib/google/gmail";

const MAX_BYTES = 10 * 1024 * 1024;

// GET /api/emails/:id/attachments/:index — downloads the index-th attachment
// of a message (same order as the attachments list in /api/emails/recent).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await params;

  try {
    const gmail = createGmailClient();
    const { data: message } = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    const attachment = parseMessage(message.payload).attachments[Number(index)];
    if (!attachment) {
      return Response.json({ error: "Attachment not found" }, { status: 404 });
    }

    const { data } = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: id,
      id: attachment.attachmentId,
    });
    if (!data.data) {
      return Response.json({ error: "Attachment is empty" }, { status: 404 });
    }
    if ((data.size ?? 0) > MAX_BYTES) {
      return Response.json({ error: "Attachment too large" }, { status: 413 });
    }

    return new Response(Buffer.from(data.data, "base64url"), {
      headers: {
        "content-type": attachment.mimeType,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch attachment";
    return Response.json({ error: message }, { status: 502 });
  }
}
