import "server-only";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { extensionOf } from "@/lib/batches/preview-kind";

const MAX_ROWS = 500;
const MAX_COLS = 40;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 20px 24px; background: #fff; color: #1a2233; font: 14px/1.6 system-ui, sans-serif; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 13px/1.6 ui-monospace, Menlo, Consolas, monospace; }
  table { border-collapse: collapse; margin: 0 0 24px; font-size: 13px; }
  th, td { border: 1px solid #d5dbe6; padding: 4px 10px; text-align: left; vertical-align: top; }
  th { background: #f1f4f9; }
  h2 { font-size: 14px; margin: 0 0 8px; }
  img { max-width: 100%; }
  .note { color: #5b6577; font-size: 12px; margin: 0 0 12px; }
`;

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`;
const text = (value: string) => page(value.trim() ? `<pre>${escapeHtml(value)}</pre>` : `<p class="note">This file is empty.</p>`);

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, newlines inside quotes. */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function table(rows: string[][], header: boolean) {
  const shown = rows.slice(0, MAX_ROWS);
  const cells = (r: string[], tag: string) => r.slice(0, MAX_COLS).map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join("");
  const head = header && shown.length ? `<thead><tr>${cells(shown[0], "th")}</tr></thead>` : "";
  const body = shown.slice(header ? 1 : 0).map((r) => `<tr>${cells(r, "td")}</tr>`).join("");
  const more = rows.length > MAX_ROWS ? `<p class="note">Showing the first ${MAX_ROWS} of ${rows.length} rows. Download the file to see the rest.</p>` : "";
  return `<table>${head}<tbody>${body}</tbody></table>${more}`;
}

async function xlsxToHtml(data: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  const sections: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      for (let col = 1; col <= Math.min(row.cellCount, MAX_COLS); col++) cells.push(row.getCell(col).text);
      rows.push(cells);
    });
    if (rows.length) sections.push(`<h2>${escapeHtml(sheet.name)}</h2>${table(rows, true)}`);
  });
  return page(sections.join("") || `<p class="note">The spreadsheet contains no data.</p>`);
}

/** Self-contained, script-free HTML for text-like files; null when the type has no HTML preview. */
export async function renderPreviewHtml(filename: string, data: Buffer): Promise<string | null> {
  try {
    switch (extensionOf(filename)) {
      case "txt":
        return text(data.toString("utf8"));
      case "csv":
        return page(table(parseCsv(data.toString("utf8")), true));
      case "docx": {
        const { value } = await mammoth.convertToHtml({ buffer: data });
        return page(value || `<p class="note">The document contains no content.</p>`);
      }
      case "doc":
        return text((await new WordExtractor().extract(data)).getBody());
      case "xlsx":
        return await xlsxToHtml(data);
      default:
        return null;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return page(`<p class="note">This file could not be previewed (${escapeHtml(reason)}). Download it to open it on your computer.</p>`);
  }
}
