import "server-only";
import { after, NextResponse } from "next/server";
import { createGmailClient, fetchWithBackoff } from "@/lib/google/gmail";
import { gmailPushConfig } from "@/lib/gmail-push/config";
import { verifyCronRequest } from "@/lib/gmail-push/verify";
import { ingestNewMail } from "@/lib/gmail-push/ingest";
import { pushError, pushLog } from "@/lib/gmail-push/log";

export const runtime = "nodejs";
export const maxDuration = 300;

// Gmail watches expire after ~7 days, so a daily Vercel Cron (vercel.json)
// re-registers it. It also runs a catch-up sync in case Pub/Sub dropped or
// delayed a notification. Also safe to call by hand to register the first watch:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/gmail/watch
export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { data } = await fetchWithBackoff(() =>
      createGmailClient().users.watch({
        userId: "me",
        requestBody: {
          topicName: gmailPushConfig().topicName,
          labelIds: ["INBOX"],
          labelFilterBehavior: "INCLUDE",
        },
      }),
    );
    const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : null;
    pushLog("watch registered", { historyId: data.historyId, expiration });
    after(() => ingestNewMail("cron"));
    return NextResponse.json({ success: true, historyId: data.historyId, expiration });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushError("watch registration failed", { message });
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
