import { NextResponse } from "next/server";
import { extractZipEntries, sortEntries, type RawEntry } from "@/lib/upload/extract";
import type { UploadResponse } from "@/lib/upload/types";
import { inboxEmailSchema, type InboxEmail } from "@/lib/email-classification/schemas";
import { processInbox, type InboxResult } from "@/lib/email-processing";

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

  try {
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

    const { inbox, attachments, stats } = sortEntries(entries);

    if (stats.emailCount === 0) {
      return json(
        {
          success: false,
          error:
            "No emails were found. Make sure the upload contains an 'inbox' folder with the email .json files.",
        },
        400
      );
    }

    // Bad inbox files become error entries instead of failing the whole batch.
    const slots: ({ email: InboxEmail } | InboxResult)[] = inbox.map(parseInboxEntry);
    const emails = slots.flatMap((slot) => ("email" in slot ? [slot.email] : []));

    // Emails reference attachments by their path from the upload root,
    // e.g. "attachments/email_001_SI.txt", matched exactly.
    const processed = await processInbox(
      emails,
      attachments.map((entry) => ({ filename: `attachments/${entry.relativePath}`, data: entry.buffer }))
    );

    let next = 0;
    const results = slots.map((slot) => ("email" in slot ? processed[next++] : slot));

    return json({ success: true, stats, results });
  } catch (error) {
    console.error("Upload failed", error);
    const message: string = error instanceof Error ? error.message : "Unexpected server error.";
    return json({ success: false, error: message }, 500);
  }
}

function parseInboxEntry(entry: RawEntry): { email: InboxEmail } | InboxResult {
  const failed = (error: string): InboxResult => ({ email_id: entry.relativePath, ok: false, error });

  if (!entry.relativePath.toLowerCase().endsWith(".json")) {
    return failed("Inbox files must be .json.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(entry.buffer.toString("utf8"));
  } catch {
    return failed("Not valid JSON.");
  }

  const parsed = inboxEmailSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return failed(`Invalid email: ${issues.join("; ")}`);
  }
  return { email: parsed.data };
}
