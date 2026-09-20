import { google, type gmail_v1 } from "googleapis";
import { googleConfig } from "@/config/server-env";
import { createOAuthClient } from "@/lib/google/oauth";

export type AttachmentRef = { filename: string; mimeType: string; attachmentId: string; };

export function createGmailClient() {
  if (!googleConfig.refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN not set.");
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: googleConfig.refreshToken });
  return google.gmail({ version: "v1", auth });
}

export async function fetchWithBackoff<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const status = (error as { response?: { status?: number; }; code?: number; })?.response?.status
      ?? (error as { code?: number; })?.code;
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = /quota exceeded|rateLimitExceeded|userRateLimitExceeded/i.test(message);
    const retryable = status === 429 || (typeof status === "number" && status >= 500) || (status === 403 && isQuotaError);
    const maxAttempts = isQuotaError ? 6 : 5;
    if (!retryable || attempt >= maxAttempts) throw error;
    const base = isQuotaError ? 4_000 : 1_000;
    const cap = isQuotaError ? 60_000 : 30_000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(cap, base * 2 ** attempt)));
    return fetchWithBackoff(fn, attempt + 1);
  }
}

// Walks the MIME tree collecting the plain-text/HTML bodies and attachment
// references, in a stable order (so the index of an attachment identifies it).
export function parseMessage(payload: gmail_v1.Schema$MessagePart | undefined) {
  const out = { text: "", html: "", attachments: [] as AttachmentRef[] };
  const walk = (part: gmail_v1.Schema$MessagePart | undefined) => {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      out.attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        attachmentId: part.body.attachmentId,
      });
    } else if (part.mimeType === "text/plain" && part.body?.data) {
      out.text += Buffer.from(part.body.data, "base64url").toString("utf8");
    } else if (part.mimeType === "text/html" && part.body?.data) {
      out.html += Buffer.from(part.body.data, "base64url").toString("utf8");
    }
    part.parts?.forEach(walk);
  };
  walk(payload);
  return out;
}

export function getHeader(payload: gmail_v1.Schema$MessagePart | undefined, name: string) {
  return (
    payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null
  );
}
