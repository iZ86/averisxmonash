import "server-only";
import { required } from "@/lib/utils";

// Read lazily so the rest of the app still boots without push configured.
export function gmailPushConfig() {
  return {
    /** Full Pub/Sub topic name: projects/<gcp-project>/topics/<topic> */
    topicName: required("GMAIL_PUBSUB_TOPIC", process.env.GMAIL_PUBSUB_TOPIC),
    /** Exact URL Pub/Sub pushes to; must equal the subscription's OIDC audience. */
    audience: required("GMAIL_PUSH_AUDIENCE", process.env.GMAIL_PUSH_AUDIENCE),
    /** Service account the push subscription signs its OIDC token as. */
    pushServiceAccount: required("GMAIL_PUSH_SERVICE_ACCOUNT", process.env.GMAIL_PUSH_SERVICE_ACCOUNT),
    /** Supabase user who owns emails ingested from the shared mailbox. */
    syncUserId: required("GMAIL_SYNC_USER_ID", process.env.GMAIL_SYNC_USER_ID),
    /** Optional: ignore notifications for any other mailbox. */
    accountEmail: process.env.GMAIL_ACCOUNT_EMAIL?.toLowerCase(),
  };
}
