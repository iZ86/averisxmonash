export type UploadStats = {
  emailCount: number;
  attachmentCount: number;
  skippedCount: number;
  skipped: string[];
  junkCount: number;
};

export type UploadResponse =
  | { success: true; batchId: string; stats: UploadStats; }
  | { success: false; error: string; };
