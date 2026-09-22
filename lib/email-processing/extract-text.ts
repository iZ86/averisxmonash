import path from "path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import WordExtractor from "word-extractor";
import type { ClassifierAttachment } from "@/lib/email-classification/schemas";
import { ocrPdfs } from "./ocr";
import type { EmailAttachment } from "./types";

const NO_TEXT_LAYER_NOTE = "The PDF has no text layer (it is a scanned image), so no text could be extracted.";

/**
 * `toClassifierAttachment` for every attachment on one email, plus the OCR
 * fallback: PDFs that opened but had no text layer are transcribed together in
 * a single OCR request and marked `used_ocr`. Only the empty-text case is
 * OCR'd — a PDF that fails to parse at all stays unreadable, and a PDF with a
 * text layer keeps its exact text. Never throws: if OCR fails, those PDFs keep
 * their no-text-layer note, exactly as before OCR existed.
 */
export async function toClassifierAttachments(attachments: EmailAttachment[]): Promise<ClassifierAttachment[]> {
  const results = await Promise.all(attachments.map(toClassifierAttachment));

  const scanned = attachments.flatMap((attachment, index) =>
    results[index].note === NO_TEXT_LAYER_NOTE && attachment.data ? [{ index, filename: attachment.filename, data: attachment.data }] : [],
  );
  if (scanned.length === 0) return results;

  let texts: Map<string, string>;
  try {
    texts = await ocrPdfs(scanned);
  } catch (error) {
    console.error("OCR failed; scanned PDFs stay unreadable", error);
    return results;
  }

  for (const { index, filename } of scanned) {
    const text = texts.get(filename)?.trim();
    if (text) results[index] = { attachment_name: filename, attachment_content: text, used_ocr: true };
  }
  return results;
}

/**
 * Converts an attachment into what the LLM sees: its text, or `null` plus a
 * note explaining why there is no text. Never throws: a file that fails to
 * parse becomes a note, so the model can judge it (e.g. as unreadable).
 */
export async function toClassifierAttachment(attachment: EmailAttachment): Promise<ClassifierAttachment> {
  const { filename, data } = attachment;

  if (data === null) {
    return withNote(filename, "Referenced by the email but the file was not provided.");
  }

  const extension = path.extname(filename).toLowerCase();
  try {
    switch (extension) {
      case ".txt":
        return withText(filename, data.toString("utf8"), "The file is empty.");
      case ".pdf":
        return withText(filename, await pdfToText(data), NO_TEXT_LAYER_NOTE);
      case ".docx":
        return withText(filename, (await mammoth.extractRawText({ buffer: data })).value, "The document contains no text.");
      case ".doc":
        return withText(filename, (await new WordExtractor().extract(data)).getBody(), "The document contains no text.");
      case ".xlsx":
        return withText(filename, await xlsxToText(data), "The spreadsheet contains no data.");
      default:
        return withNote(filename, `Unsupported file type "${extension || "(none)"}".`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return withNote(filename, `The file could not be parsed: ${reason}`);
  }
}

async function pdfToText(data: Buffer): Promise<string> {
  // unpdf needs its own copy: pdf.js may detach the buffer it's given.
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((page, i) => (text.length > 1 ? `--- Page ${i + 1} ---\n${page}` : page)).join("\n\n");
}

async function xlsxToText(data: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // exceljs' types predate Node's generic Buffer<ArrayBufferLike>.
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);

  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      for (let col = 1; col <= row.cellCount; col++) cells.push(csvEscape(row.getCell(col).text));
      rows.push(cells.join(","));
    });
    if (rows.length > 0) sheets.push(`--- Sheet: ${sheet.name} ---\n${rows.join("\n")}`);
  });
  return sheets.join("\n\n");
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function withText(filename: string, text: string, emptyNote: string): ClassifierAttachment {
  return text.trim() ? { attachment_name: filename, attachment_content: text } : withNote(filename, emptyNote);
}

function withNote(filename: string, note: string): ClassifierAttachment {
  return { attachment_name: filename, attachment_content: null, note };
}
