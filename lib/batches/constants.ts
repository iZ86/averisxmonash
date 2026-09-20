/** Shared between the sync route (server) and the workspace UI (client) — a
 * sync stuck in "running" longer than this is assumed crashed, not actually
 * in progress. Kept in one neutral file since app/api/emails/sync/route.ts
 * ("server-only") and lib/batches/queries.ts ("client-only") can't import
 * from each other. */
export const SYNC_LOCK_STALE_MS = 5 * 60 * 1000;
