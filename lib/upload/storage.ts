import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

export function createBatchId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}_${randomUUID().slice(0, 8)}`;
}

/**
 * Resolves `relativePath` against `baseDir`, rejecting any path that would
 * escape `baseDir` (zip-slip / path traversal protection for untrusted
 * upload content).
 */
export function safeResolve(baseDir: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(baseDir, normalized);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;

  if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) {
    return null;
  }

  return resolved;
}

export async function writeBatchFile(
  baseDir: string,
  relativePath: string,
  data: Buffer | Uint8Array
) {
  const target = safeResolve(baseDir, relativePath);
  if (!target) {
    throw new Error(`Rejected unsafe path: ${relativePath}`);
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return target;
}
