export type PreviewKind = "image" | "pdf" | "html" | null;

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export const extensionOf = (filename: string) => filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** How an attachment can be previewed. Uses the extension first, since Gmail often reports octet-stream. */
export function previewKind(filename: string, mimeType: string | null): PreviewKind {
  const ext = extensionOf(filename);
  const mime = mimeType ?? "";
  if (ext in IMAGE_TYPES || /^image\/(png|jpe?g|gif|webp)$/i.test(mime)) return "image";
  if (ext === "pdf" || /^application\/pdf$/i.test(mime)) return "pdf";
  if (["txt", "csv", "docx", "doc", "xlsx"].includes(ext) || /^text\/(plain|csv)$/i.test(mime)) return "html";
  return null;
}

/** Content type to serve inline; corrects generic types using the extension. */
export function inlineContentType(filename: string, mimeType: string | null): string {
  const ext = extensionOf(filename);
  if (ext in IMAGE_TYPES) return IMAGE_TYPES[ext];
  if (ext === "pdf") return "application/pdf";
  return mimeType ?? "application/octet-stream";
}
