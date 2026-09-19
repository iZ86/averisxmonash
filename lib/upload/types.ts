import type { InboxResult } from "@/lib/email-processing/types";

export type UploadStats = {
  emailCount: number;
  attachmentCount: number;
  skippedCount: number;
  skipped: string[];
  junkCount: number;
};

export type UploadResponse =
  | { success: true; stats: UploadStats; results: InboxResult[]; }
  | { success: false; error: string; };
