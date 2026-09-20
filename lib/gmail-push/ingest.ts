import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGmailSync } from "@/lib/email-sync/run-sync";
import { drainProcessingQueue } from "@/lib/email-processing/drain-queue";
import { gmailPushConfig } from "./config";
import { pushError, pushLog } from "./log";

const BUSY_RETRIES = 3;
const BUSY_DELAY_MS = 15_000;

/**
 * Sync new mail, then classify whatever got queued. Runs with the service-role
 * client because push/cron calls have no user session.
 */
export async function ingestNewMail(trigger: "webhook" | "cron" = "webhook") {
  const startedAt = Date.now();
  try {
    const { syncUserId } = gmailPushConfig();
    const supabase = createAdminClient();
    pushLog("ingest started", { trigger });

    // A sync already running (409) will not see mail that arrived after it
    // listed history, so wait for it to finish and go again rather than drop this.
    let outcome = await runGmailSync(supabase, syncUserId);
    for (let i = 0; i < BUSY_RETRIES && outcome.status === 409; i++) {
      pushLog("sync busy, retrying", { attempt: i + 1, delayMs: BUSY_DELAY_MS });
      await new Promise((resolve) => setTimeout(resolve, BUSY_DELAY_MS));
      outcome = await runGmailSync(supabase, syncUserId);
    }
    if (!outcome.body.success) {
      pushError("sync failed", { status: outcome.status, error: outcome.body.error, reconnect: outcome.body.reconnect });
      return;
    }
    const { inserted, skipped, failed } = outcome.body;
    pushLog("sync done", { inserted, skipped, failed });

    const drained = await drainProcessingQueue(supabase, syncUserId, { claimAsService: true });
    if (!drained.ok) {
      pushError("queue drain failed", { error: drained.error });
      return;
    }
    pushLog("ingest finished", { trigger, inserted, classified: drained.processed, ms: Date.now() - startedAt });
  } catch (error) {
    // Runs inside after(), so nothing else would report a throw here.
    pushError("ingest crashed", { trigger, message: error instanceof Error ? error.message : String(error) });
  }
}
