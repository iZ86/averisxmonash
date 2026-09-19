import type { NextRequest } from "next/server";
import { createGmailClient, getHeader } from "@/lib/google/gmail";

const PAGE_SIZE = 25;

// GET /api/emails?pageToken=...&q=...
// One page of the inbox, newest first. With `q` (Gmail search syntax) it searches
// the whole mailbox instead. Pass the returned nextPageToken to get the next page.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim() || undefined;
  const pageToken = searchParams.get("pageToken") || undefined;

  try {
    const gmail = createGmailClient();
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: PAGE_SIZE,
      pageToken,
      q,
      labelIds: q ? undefined : ["INBOX"],
    });

    const emails = await Promise.all(
      (list.data.messages ?? []).map(async ({ id }) => {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        return {
          id: data.id,
          from: getHeader(data.payload, "From"),
          subject: getHeader(data.payload, "Subject"),
          date: getHeader(data.payload, "Date"),
          snippet: data.snippet,
          unread: data.labelIds?.includes("UNREAD") ?? false,
        };
      }),
    );

    return Response.json({ emails, nextPageToken: list.data.nextPageToken ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch emails";
    return Response.json({ error: message }, { status: 502 });
  }
}
