import type { NextRequest } from "next/server";
import { createGmailClient, getHeader, parseMessage } from "@/lib/google/gmail";

// GET /api/emails/:id — one full message: headers, bodies and attachment links.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const gmail = createGmailClient();
    const { data } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const { text, html, attachments } = parseMessage(data.payload);

    return Response.json({
      id: data.id,
      threadId: data.threadId,
      from: getHeader(data.payload, "From"),
      to: getHeader(data.payload, "To"),
      cc: getHeader(data.payload, "Cc"),
      subject: getHeader(data.payload, "Subject"),
      date: getHeader(data.payload, "Date"),
      text,
      html,
      attachments: attachments.map((a, i) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        downloadUrl: `${request.nextUrl.origin}/api/emails/${id}/attachments/${i}`,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch email";
    return Response.json({ error: message }, { status: 502 });
  }
}
