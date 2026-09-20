import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createOAuthClient } from "@/lib/google/oauth";
import { gmailPushConfig } from "./config";
import { pushError } from "./log";

/** Verifies the Google-signed OIDC bearer token Pub/Sub attaches to each push. */
export async function verifyPubSubRequest(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    pushError("auth rejected", { reason: "missing bearer token" });
    return false;
  }
  const { audience, pushServiceAccount } = gmailPushConfig();
  try {
    const ticket = await createOAuthClient().verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    if (payload?.email_verified !== true || payload.email !== pushServiceAccount) {
      pushError("auth rejected", {
        reason: "token is for a different service account",
        tokenEmail: payload?.email,
        expected: pushServiceAccount,
      });
      return false;
    }
    return true;
  } catch (error) {
    // Usually an audience mismatch, an expired token, or a bad signature.
    pushError("auth rejected", {
      reason: "token verification failed",
      message: error instanceof Error ? error.message : String(error),
      expectedAudience: audience,
    });
    return false;
  }
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function verifyCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    pushError("cron auth rejected", { reason: "CRON_SECRET is not set" });
    return false;
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!ok) pushError("cron auth rejected", { reason: "wrong or missing secret" });
  return ok;
}
