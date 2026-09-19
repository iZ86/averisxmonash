import JSZip from "jszip";

export type ExtractStats = {
  emailCount: number;
  attachmentCount: number;
  skippedCount: number;
  skipped: string[];
  junkCount: number;
};

export type RawEntry = { relativePath: string; buffer: Buffer };

function emptyStats(): ExtractStats {
  return { emailCount: 0, attachmentCount: 0, skippedCount: 0, skipped: [], junkCount: 0 };
}

/** Locates the inbox/attachments bucket in a path, tolerating one wrapping root folder. */
function classify(relativePath: string): { bucket: "inbox" | "attachments" | null; rest: string } {
  const parts = relativePath.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "inbox" || p === "attachments");
  if (idx === -1) return { bucket: null, rest: "" };
  const bucket = parts[idx] as "inbox" | "attachments";
  const rest = parts.slice(idx + 1).join("/");
  return { bucket, rest };
}

/** Filesystem/archive metadata noise (macOS AppleDouble files, .DS_Store, __MACOSX/) that isn't real data. */
function isJunkPath(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  const basename = parts[parts.length - 1] ?? "";
  return parts.includes("__MACOSX") || basename.startsWith("._") || basename === ".DS_Store";
}

export async function extractZipEntries(zipBuffer: Buffer): Promise<RawEntry[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  return Promise.all(
    entries.map(async (entry) => ({
      relativePath: entry.name,
      buffer: await entry.async("nodebuffer"),
    }))
  );
}

export type SortedUpload = {
  /** Inbox JSON files; relativePath is the path inside inbox/. */
  inbox: RawEntry[];
  /** Attachment files; relativePath is the path inside attachments/. */
  attachments: RawEntry[];
  stats: ExtractStats;
};

/** Sorts uploaded entries into inbox and attachments in memory; nothing is written to disk. */
export function sortEntries(entries: RawEntry[]): SortedUpload {
  const sorted: SortedUpload = { inbox: [], attachments: [], stats: emptyStats() };
  const { stats } = sorted;

  for (const entry of entries) {
    if (isJunkPath(entry.relativePath)) {
      stats.junkCount += 1;
      continue;
    }

    const { bucket, rest } = classify(entry.relativePath);
    if (!bucket || !rest) {
      stats.skippedCount += 1;
      stats.skipped.push(entry.relativePath);
      continue;
    }

    sorted[bucket].push({ relativePath: rest, buffer: entry.buffer });
    if (bucket === "inbox") stats.emailCount += 1;
    else stats.attachmentCount += 1;
  }

  return sorted;
}
