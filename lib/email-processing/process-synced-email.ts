import "server-only";
import type { gmail_v1 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMessage } from "@/lib/google/gmail";
import { toClassifierAttachment } from "./extract-text";
import { attachmentPath, uploadAttachment } from "./attachment-storage";
import { processEmail } from "./index";

type SyncedEmail = {
  id: string;
  user_id: string;
  gmail_message_id: string;
  from_address: string;
  subject: string;
  body: string | null;
};

export async function processSyncedEmail(
  supabase: SupabaseClient,
  gmail: gmail_v1.Gmail,
  email: SyncedEmail,
  fetchWithBackoff: <T>(fn: () => Promise<T>) => Promise<T>,
) {
  const { data: message } = await fetchWithBackoff(() =>
    gmail.users.messages.get({ userId: "me", id: email.gmail_message_id, format: "full" }),
  );
  const { attachments } = parseMessage(message.payload);
  const attachmentBuffers = await Promise.all(
    attachments.map(async (ref) => {
      const { data } = await fetchWithBackoff(() =>
        gmail.users.messages.attachments.get({ userId: "me", messageId: email.gmail_message_id, id: ref.attachmentId }),
      );
      const bytes = data.data ? Buffer.from(data.data, "base64url") : null;
      return { ...ref, data: bytes };
    }),
  );
  const extracted = await Promise.all(
    attachmentBuffers.map((attachment) => toClassifierAttachment({ filename: attachment.filename, data: attachment.data })),
  );

  const storagePaths = await Promise.all(
    attachmentBuffers.map((attachment, index) =>
      attachment.data
        ? uploadAttachment(
            supabase,
            attachmentPath(email.user_id, email.id, index, attachment.filename),
            attachment.data,
            attachment.mimeType,
          )
        : null,
    ),
  );

  if (attachmentBuffers.length > 0) {
    const { error } = await supabase.from("email_attachments").insert(
      attachmentBuffers.map((attachment, index) => ({
        email_id: email.id,
        gmail_attachment_id: attachment.attachmentId,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
        size_bytes: attachment.data?.byteLength ?? null,
        extracted_text: extracted[index].attachment_content,
        extraction_note: extracted[index].note ?? null,
        position: index,
        storage_path: storagePaths[index],
      })),
    );
    if (error) throw new Error(`Saving attachments: ${error.message}`);
  }

  const result = await processEmail({
    email_id: email.id,
    from: email.from_address,
    subject: email.subject,
    body: email.body ?? "",
    attachments: attachmentBuffers.map((attachment) => ({ filename: attachment.filename, data: attachment.data })),
  });
  const { error } = await supabase.from("processed_emails").insert({
    email_id: email.id,
    synced_email_id: email.id,
    reasoning: result.reasoning,
    status: result.status,
    review_reason: result.review_reason,
    has_defect: result.has_defect,
    defect_fields: result.defect_fields,
    categories: result.categories,
  });
  if (error) throw new Error(`Saving analysis: ${error.message}`);
}
