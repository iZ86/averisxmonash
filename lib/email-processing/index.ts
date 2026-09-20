// Service layer for processing emails. Callers pass plain data (parsed email
// fields + attachment bytes), never HTTP objects, so the same functions serve
// the upload route and a future real-inbox integration.

import "server-only";
import { classifyEmail } from "@/lib/email-classification/classify";
import { toClassifierAttachment } from "./extract-text";
import type {
  AttachmentFile,
  ClassificationResponse,
  EmailInput,
  InboxEmail,
  InboxResult,
} from "./types";

export type * from "./types";

const DEFAULT_CONCURRENCY = 10;

/** Classifies one email. Throws if the LLM call fails after retries. */
export async function processEmail(email: EmailInput): Promise<ClassificationResponse> {
  const attachments = await Promise.all(email.attachments.map(toClassifierAttachment));
  return classifyEmail({ ...email, attachments });
}

/**
 * Classifies many emails whose attachments are referenced by filename.
 * Filenames are matched exactly against `files`; a name with no matching file
 * is passed to the model as not provided. One LLM call per email, `concurrency`
 * at a time. Never throws: a failed email becomes an `ok: false` entry.
 * Results are in the same order as `emails`.
 */
export async function processInbox(
  emails: InboxEmail[],
  files: AttachmentFile[],
  options: { concurrency?: number } = {},
): Promise<InboxResult[]> {
  const filesByName = new Map(files.map((file) => [file.filename, file.data]));

  return mapWithConcurrency(emails, options.concurrency ?? DEFAULT_CONCURRENCY, async (email) => {
    try {
      const result = await processEmail({
        ...email,
        attachments: email.attachments.map((filename) => ({
          filename,
          data: filesByName.get(filename) ?? null,
        })),
      });
      return { email_id: email.email_id, ok: true, result };
    } catch (error) {
      console.error(`processInbox: ${email.email_id} failed`, error);
      const message = error instanceof Error ? error.message : String(error);
      return { email_id: email.email_id, ok: false, error: message };
    }
  });
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}
