import { NextResponse } from "next/server";
import path from "path";
import { mkdir } from "fs/promises";
import { createBatchId, UPLOADS_ROOT } from "@/lib/upload/storage";
import { extractZipEntries, writeEntriesToBatch, type RawEntry } from "@/lib/upload/extract";
import type { UploadResponse } from "@/lib/upload/types";

export const runtime = "nodejs";

function json(body: UploadResponse, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ success: false, error: "Request must be multipart/form-data." }, 400);
  }

  const mode = formData.get("mode");
  const batchId: string = createBatchId();
  const batchDir: string = path.join(UPLOADS_ROOT, batchId);

  try {
    await mkdir(batchDir, { recursive: true });

    let entries: RawEntry[] = [];

    if (mode === "zip") {
      const zipFile = formData.get("file");
      if (!(zipFile instanceof File)) {
        return json({ success: false, error: "No zip file was provided." }, 400);
      }
      const buffer = Buffer.from(await zipFile.arrayBuffer());
      entries = await extractZipEntries(buffer);
    } else if (mode === "folders") {
      const files: File[] = formData.getAll("files").filter((f): f is File => f instanceof File);
      if (files.length === 0) {
        return json({ success: false, error: "No files were provided." }, 400);
      }
      entries = await Promise.all(
        files.map(async (file) => ({
          relativePath: file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
        }))
      );
    } else {
      return json({ success: false, error: "Unknown upload mode." }, 400);
    }

    const stats = await writeEntriesToBatch(entries, batchDir);

    if (stats.emailCount === 0 && stats.attachmentCount === 0) {
      return json(
        {
          success: false,
          error:
            "Nothing recognizable was found. Make sure the upload contains an 'inbox' folder and an 'attachments' folder.",
        },
        400
      );
    }

    return json({ success: true, batchId, stats });
  } catch (error) {
    const message: string = error instanceof Error ? error.message : "Unexpected server error.";
    const isUnsafePath: boolean = message.startsWith("Rejected unsafe path");
    if (!isUnsafePath) console.error("Upload failed", error);
    return json({ success: false, error: message }, isUnsafePath ? 400 : 500);
  }
}
