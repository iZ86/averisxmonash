import "server-only";
import type { gmail_v1 } from "googleapis";
import { fetchWithBackoff, getHeader } from "@/lib/google/gmail";

const oneLine = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`);

/** True when Gmail refused because the token was not granted permission to send. */
export function isSendScopeError(error: unknown) {
  const e = error as { code?: number; response?: { status?: number }; message?: string };
  const status = e?.response?.status ?? e?.code;
  return status === 403 && /insufficient|scope|permission/i.test(e?.message ?? "");
}

/** Sends `body` as a reply on the original message's thread, from the connected mailbox. */
export async function sendReply(
  gmail: gmail_v1.Gmail,
  input: { to: string; subject: string; body: string; messageId: string; threadId: string | null },
) {
  // Threading headers are best effort: if the original cannot be read the reply is still sent, just not linked.
  let inReplyTo: string | null = null;
  let references: string | null = null;
  try {
    const { data: original } = await fetchWithBackoff(() =>
      gmail.users.messages.get({ userId: "me", id: input.messageId, format: "metadata", metadataHeaders: ["Message-ID", "References"] }),
    );
    inReplyTo = getHeader(original.payload, "Message-ID");
    references = getHeader(original.payload, "References");
  } catch {}

  const headers = [
    `To: ${oneLine(input.to)}`,
    `Subject: ${encodeHeader(oneLine(input.subject))}`,
    ...(inReplyTo ? [`In-Reply-To: ${oneLine(inReplyTo)}`, `References: ${oneLine([references, inReplyTo].filter(Boolean).join(" "))}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  const encodedBody = Buffer.from(input.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${encodedBody}`).toString("base64url");

  await fetchWithBackoff(() =>
    gmail.users.messages.send({ userId: "me", requestBody: { raw, threadId: input.threadId ?? undefined } }),
  );
}
