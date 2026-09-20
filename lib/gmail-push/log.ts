import "server-only";

// One prefix so `gmail-push` is greppable in Vercel logs. Never log tokens or secrets.
export function pushLog(event: string, details: Record<string, unknown> = {}) {
  console.log(`[gmail-push] ${event}`, JSON.stringify(details));
}

export function pushError(event: string, details: Record<string, unknown> = {}) {
  console.error(`[gmail-push] ${event}`, JSON.stringify(details));
}
