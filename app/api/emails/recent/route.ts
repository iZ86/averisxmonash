import type { NextRequest } from "next/server";
import { createGmailClient, parseMessage } from "@/lib/google/gmail";

// GET /api/emails/recent — lists Gmail messages received in the past hour,
// with body text and a download link for each attachment.
export async function GET(request: NextRequest) {
  try {
    const gmail = createGmailClient();
    const since = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      q: `after:${since}`,
      maxResults: 50,
    });

    const emails = await Promise.all(
      (list.data.messages ?? []).map(async ({ id }) => {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: id!,
          format: "full",
        });
        const { text, attachments } = parseMessage(data.payload);
        const header = (name: string) =>
          data.payload?.headers?.find((h) => h.name === name)?.value ?? null;
        return {
          id: data.id,
          threadId: data.threadId,
          from: header("From"),
          to: header("To"),
          subject: header("Subject"),
          date: header("Date"),
          snippet: data.snippet,
          body: text,
          attachments: attachments.map((a, i) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            downloadUrl: `${request.nextUrl.origin}/api/emails/${id}/attachments/${i}`,
          })),
        };
      }),
    );

    return Response.json({ count: emails.length, emails });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch emails";
    return Response.json({ error: message }, { status: 502 });
  }
}
