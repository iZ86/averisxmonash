import "server-only";
import { after, NextResponse } from "next/server";
import { gmailPushConfig } from "@/lib/gmail-push/config";
import { verifyPubSubRequest } from "@/lib/gmail-push/verify";
import { ingestNewMail } from "@/lib/gmail-push/ingest";
import { pushError, pushLog } from "@/lib/gmail-push/log";

export const runtime = "nodejs";
export const maxDuration = 300;

// Pub/Sub push endpoint for Gmail `users.watch` notifications. Authenticated
// by the OIDC token on the request, not a user session (see proxy public list).
// The notification only carries { emailAddress, historyId }, so it is used as a
// trigger: ack immediately, then sync + classify after the response is sent.
export async function POST(request: Request) {
  if (!(await verifyPubSubRequest(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let emailAddress: string | undefined;
  let historyId: unknown;
  try {
    const envelope = await request.json();
    const data = envelope?.message?.data;
    if (typeof data === "string") {
      const notification = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
      emailAddress = notification?.emailAddress;
      historyId = notification?.historyId;
    }
  } catch (error) {
    // Malformed body: ack so Pub/Sub does not redeliver it forever.
    pushError("malformed notification, acked and ignored", { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: true });
  }
  pushLog("notification received", { emailAddress, historyId });

  const { accountEmail } = gmailPushConfig();
  if (accountEmail && emailAddress?.toLowerCase() !== accountEmail) {
    pushLog("ignored: different mailbox", { emailAddress, expected: accountEmail });
    return NextResponse.json({ ok: true });
  }

  after(() => ingestNewMail("webhook"));
  return NextResponse.json({ ok: true });
}
