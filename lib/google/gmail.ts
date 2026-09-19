import { google, type gmail_v1 } from "googleapis";
import { env } from "@/config/env";
import { createOAuthClient } from "@/lib/google/oauth";

export type AttachmentRef = { filename: string; mimeType: string; attachmentId: string };

export function createGmailClient() {
  if (!env.googleRefreshToken) throw new Error("GOOGLE_REFRESH_TOKEN not set.");
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: env.googleRefreshToken });
  return google.gmail({ version: "v1", auth });
}

// Walks the MIME tree collecting the plain-text body and attachment references,
// in a stable order (so the index of an attachment identifies it).
export function parseMessage(payload: gmail_v1.Schema$MessagePart | undefined) {
  const out = { text: "", attachments: [] as AttachmentRef[] };
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
    }
    part.parts?.forEach(walk);
  };
  walk(payload);
  return out;
}
