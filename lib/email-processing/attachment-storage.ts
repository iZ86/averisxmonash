import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ATTACHMENT_BUCKET = "email-attachments";

export function attachmentPath(userId: string, emailId: string, position: number, filename: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
  return `${userId}/${emailId}/${position}-${safe}`;
}

/** Best-effort upload: returns the stored path, or null when the upload failed. */
export async function uploadAttachment(
  supabase: SupabaseClient,
  path: string,
  data: Buffer,
  mimeType: string | null,
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, data, { contentType: mimeType ?? "application/octet-stream", upsert: true });
  if (error) {
    console.error(`Could not store attachment ${path}: ${error.message}`);
    return null;
  }
  return path;
}
