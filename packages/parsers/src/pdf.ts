import { PNG } from "pngjs";
import type { BankProfile, CanonicalField, OcrPage, ParsedPdf, ParsePdfOptions, PdfTextItem, PdfTransaction } from "./types.js";
import { parseAmount, parseDate } from "./csv.js";
import { createHeaderFingerprint, matchBankProfile } from "./pdf-profiles.js";

type PdfRow = PdfTextItem[];
const headerAliases: Record<CanonicalField, RegExp> = {
  date: /^(date|transaction date|txn date|posted)$/i, description: /^(description|details|narrative|memo)$/i,
  amount: /^amount$/i, debit: /^(debit|withdrawal|money out)$/i, credit: /^(credit|deposit|money in)$/i, balance: /^(balance|running balance)$/i,
};

export function clusterRows(items: PdfTextItem[], tolerance = 3): PdfRow[] {
  const rows: { y: number; page: number; items: PdfRow }[] = [];
  for (const item of [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)) {
    const row = rows.find((candidate) => candidate.page === item.page && Math.abs(candidate.y - item.y) <= tolerance);
    if (row) { row.items.push(item); row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length; }
    else rows.push({ y: item.y, page: item.page, items: [item] });
  }
  return rows.map(({ items: row }) => row.sort((a, b) => a.x - b.x));
}

function inferColumns(rows: PdfRow[]): BankProfile["columns"] {
  const header = rows.find((row) => row.filter((item) => Object.values(headerAliases).some((pattern) => pattern.test(item.text.trim()))).length >= 2);
  if (!header) return [];
  const anchors = header.map((item) => ({ item, field: (Object.entries(headerAliases).find(([, pattern]) => pattern.test(item.text.trim()))?.[0]) as CanonicalField | undefined }))
    .filter((entry): entry is { item: PdfTextItem; field: CanonicalField } => Boolean(entry.field)).sort((a, b) => a.item.x - b.item.x);
  return anchors.map((anchor, index) => ({ field: anchor.field, minX: index ? (anchors[index - 1]!.item.x + anchor.item.x) / 2 : -Infinity, maxX: index + 1 < anchors.length ? (anchor.item.x + anchors[index + 1]!.item.x) / 2 : Infinity }));
}

function cell(row: PdfRow, columns: BankProfile["columns"], field: CanonicalField): string {
  const range = columns.find((column) => column.field === field);
  return range ? row.filter(({ x }) => x >= range.minX && x < range.maxX).map(({ text }) => text).join(" ").trim() : "";
}

export function reconstructTransactions(items: PdfTextItem[], profile: BankProfile, sourceStatementId: string, method: "digital" | "ocr", confidence = 1): PdfTransaction[] {
  const rows = clusterRows(items, profile.yTolerance ?? 3);
  const columns = profile.columns.length ? profile.columns : inferColumns(rows);
  if (!columns.some(({ field }) => field === "date") || !columns.some(({ field }) => field === "description")) return [];
  const transactions: PdfTransaction[] = [];
  rows.forEach((row, index) => {
    const rawDate = cell(row, columns, "date");
    let date: string;
    try { date = parseDate(rawDate, profile.dateOrder); } catch { return; }
    const description = cell(row, columns, "description");
    if (!description) return;
    const amountText = cell(row, columns, "amount"); const debit = cell(row, columns, "debit"); const credit = cell(row, columns, "credit");
    const parsedAmount = amountText ? parseAmount(amountText) : credit ? parseAmount(credit) : parseAmount(debit);
    if (parsedAmount === undefined) return;
    const amount = amountText ? parsedAmount : credit ? Math.abs(parsedAmount) : -Math.abs(parsedAmount);
    const balanceText = cell(row, columns, "balance");
    let balanceAfter: number | undefined;
    try { if (balanceText) balanceAfter = parseAmount(balanceText); } catch { balanceAfter = undefined; }
    transactions.push({ date, description, amount, ...(balanceAfter === undefined ? {} : { balanceAfter }), sourceStatementId, sourceRowIndex: index, confidence, extractionMethod: method });
  });
  return transactions;
}

export async function extractPdfTextItems(pdf: Uint8Array): Promise<PdfTextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: pdf }).promise;
  const items: PdfTextItem[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber); const content = await page.getTextContent();
    for (const raw of content.items) if ("str" in raw && raw.str.trim()) items.push({ text: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width, height: raw.height, page: pageNumber });
  }
  return items;
}

async function embeddedImages(pdf: Uint8Array): Promise<Buffer[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); const document = await pdfjs.getDocument({ data: pdf }).promise; const output: Buffer[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber); const operations = await page.getOperatorList();
    for (let index = 0; index < operations.fnArray.length; index++) if (operations.fnArray[index] === pdfjs.OPS.paintImageXObject) {
      const image = await page.objs.get(operations.argsArray[index][0]); if (!image?.data || !image.width || !image.height) continue;
      const png = new PNG({ width: image.width, height: image.height });
      for (let pixel = 0; pixel < image.width * image.height; pixel++) { const source = pixel * (image.data.length / (image.width * image.height)); const target = pixel * 4; png.data[target] = image.data[source]; png.data[target + 1] = image.data[source + 1] ?? image.data[source]; png.data[target + 2] = image.data[source + 2] ?? image.data[source]; png.data[target + 3] = 255; }
      output.push(PNG.sync.write(png));
    }
  }
  return output;
}

export async function tesseractOcr(pdf: Uint8Array): Promise<OcrPage[]> {
  const { createWorker } = await import("tesseract.js"); const images = await embeddedImages(pdf); const worker = await createWorker("eng"); const pages: OcrPage[] = [];
  try { for (let index = 0; index < images.length; index++) {
    const result = await worker.recognize(images[index]!, {}, { blocks: true });
    const words = result.data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words.map(({ text, confidence, bbox }) => ({ text, confidence, bbox }))))) ?? [];
    pages.push({ page: index + 1, width: 612, height: 792, words });
  } } finally { await worker.terminate(); }
  return pages;
}

export async function parsePdf(input: Uint8Array | Buffer, options: ParsePdfOptions): Promise<ParsedPdf> {
  const pdf = new Uint8Array(input); let items = await extractPdfTextItems(pdf); const digital = items.length >= (options.minimumTextItems ?? 5); let method: "digital" | "ocr" = "digital"; let confidence = 1;
  if (!digital) { method = "ocr"; const pages = await (options.ocr ?? tesseractOcr)(pdf); items = pages.flatMap((page) => page.words.filter(({ text }) => text.trim()).map((word) => ({ text: word.text, x: word.bbox.x0, y: page.height - word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0, page: page.page }))); confidence = Math.min(.75, pages.flatMap(({ words }) => words).reduce((sum, word, _, all) => sum + word.confidence / all.length / 100, 0)); }
  confidence = Math.round(confidence * 1000) / 1000;
  const fingerprint = createHeaderFingerprint(items); const matchedProfile = matchBankProfile(fingerprint, options.profiles);
  const profile = matchedProfile.id === "generic" && items.some(({ text }) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text.trim())) ? { ...matchedProfile, dateOrder: "YMD" as const } : matchedProfile;
  const transactions = reconstructTransactions(items, profile, options.sourceStatementId, method, confidence);
  return { transactions, profileId: profile.id, fingerprint, extractionMethod: method, needsReview: method === "ocr" || transactions.some((transaction) => transaction.confidence < .8) };
}
