import type { ClassificationResponse, InboxEmail } from "@/lib/email-classification/schemas";

export type { ClassificationResponse, InboxEmail };

/** An attachment on a single email. `data: null` means it was referenced but not provided. */
export type EmailAttachment = {
  filename: string;
  data: Buffer | null;
};

/** Input to processEmail: one email with its attachment files. */
export type EmailInput = {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
};

/** An uploaded attachment file, matched to emails by exact filename. */
export type AttachmentFile = {
  filename: string;
  data: Buffer;
};

export type InboxResult =
  | { email_id: string; ok: true; result: ClassificationResponse }
  | { email_id: string; ok: false; error: string };
