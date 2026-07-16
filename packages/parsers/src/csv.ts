import type {
  CanonicalField,
  DateOrder,
  ParsedCsv,
  ParseCsvOptions,
  RawTransaction,
} from "./types.js";

const SYNONYMS: Record<CanonicalField, readonly string[]> = {
  date: ["date", "transaction date", "txn date", "posting date", "posted date", "value date"],
  description: ["description", "details", "memo", "narrative", "particulars", "transaction details", "payee"],
  amount: ["amount", "transaction amount", "signed amount", "value"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "paid out", "debit amount"],
  credit: ["credit", "deposit", "deposits", "money in", "paid in", "credit amount"],
  balance: ["balance", "running balance", "closing balance", "available balance"],
};

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[_\-.]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function headerScore(header: string, synonym: string): number {
  if (header === synonym) return 100;
  if (header.startsWith(`${synonym} `) || header.endsWith(` ${synonym}`)) return 70;
  const headerWords = new Set(header.split(" "));
  const words = synonym.split(" ");
  return words.every((word) => headerWords.has(word)) ? 50 + words.length : 0;
}

export function matchHeaders(headers: readonly string[]): Partial<Record<CanonicalField, number>> {
  const candidates: Array<{ field: CanonicalField; index: number; score: number }> = [];
  headers.forEach((raw, index) => {
    const header = normalizedHeader(raw);
    for (const field of Object.keys(SYNONYMS) as CanonicalField[]) {
      const score = Math.max(...SYNONYMS[field].map((synonym) => headerScore(header, synonym)));
      if (score > 0) candidates.push({ field, index, score });
    }
  });

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const result: Partial<Record<CanonicalField, number>> = {};
  const usedColumns = new Set<number>();
  for (const candidate of candidates) {
    if (result[candidate.field] === undefined && !usedColumns.has(candidate.index)) {
      result[candidate.field] = candidate.index;
      usedColumns.add(candidate.index);
    }
  }
  return result;
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (quoted) throw new Error("Malformed CSV: unterminated quoted field");
  return rows;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 10);
  const delimiters = [",", ";", "\t"];
  const scores = delimiters.map((delimiter) => {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter)).filter((count) => count > 0);
    const frequency = new Map<number, number>();
    counts.forEach((count) => frequency.set(count, (frequency.get(count) ?? 0) + 1));
    const consistency = Math.max(0, ...frequency.values());
    return { delimiter, score: consistency * 100 + counts.reduce((sum, count) => sum + count, 0) };
  });
  scores.sort((a, b) => b.score - a.score);
  if (scores[0]!.score === 0) throw new Error("Unable to detect CSV delimiter");
  return scores[0]!.delimiter;
}

export function decodeCsv(input: Uint8Array | string): { text: string; encoding: ParsedCsv["encoding"] } {
  if (typeof input === "string") return { text: input.replace(/^\uFEFF/, ""), encoding: "utf-8" };
  if (input[0] === 0xff && input[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(input.subarray(2)), encoding: "utf-16le" };
  }
  if (input[0] === 0xfe && input[1] === 0xff) {
    const swapped = new Uint8Array(input.length - 2);
    for (let index = 2; index + 1 < input.length; index += 2) {
      swapped[index - 2] = input[index + 1]!;
      swapped[index - 1] = input[index]!;
    }
    return { text: new TextDecoder("utf-16le").decode(swapped), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(input).replace(/^\uFEFF/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("latin1").decode(input), encoding: "latin1" };
  }
}

function dateParts(value: string): [number, number, number] | undefined {
  const match = value.trim().match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:\s|$)/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function inferDateOrder(values: readonly string[], fallback: Exclude<DateOrder, "YMD"> = "DMY"): DateOrder {
  const parts = values.map(dateParts).filter((value): value is [number, number, number] => value !== undefined);
  if (parts.length === 0) throw new Error("No recognizable dates found");
  if (parts.some(([first]) => first > 31)) return "YMD";
  const dmyEvidence = parts.some(([first]) => first > 12);
  const mdyEvidence = parts.some(([, second]) => second > 12);
  if (dmyEvidence && mdyEvidence) throw new Error("CSV contains conflicting DD/MM/YYYY and MM/DD/YYYY date evidence");
  if (dmyEvidence) return "DMY";
  if (mdyEvidence) return "MDY";
  return fallback;
}

export function parseDate(value: string, order: DateOrder): string {
  const parts = dateParts(value);
  if (!parts) throw new Error(`Invalid date: ${value}`);
  let year: number;
  let month: number;
  let day: number;
  if (order === "YMD") [year, month, day] = parts;
  else if (order === "DMY") [day, month, year] = parts;
  else [month, day, year] = parts;
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function parseAmount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return undefined;
  const negative = /^\(.*\)$/.test(trimmed) || /-$/.test(trimmed);
  const cleaned = trimmed.replace(/[()]/g, "").replace(/[^0-9.,+\-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else normalized = cleaned.replace(/,/g, "");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount: ${value}`);
  return negative ? -Math.abs(amount) : amount;
}

function findHeader(rows: readonly string[][]): { index: number; columns: Partial<Record<CanonicalField, number>> } {
  let best: { index: number; columns: Partial<Record<CanonicalField, number>>; score: number } | undefined;
  rows.slice(0, 20).forEach((row, index) => {
    const columns = matchHeaders(row);
    const valid = columns.date !== undefined && columns.description !== undefined &&
      (columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined);
    if (!valid) return;
    const score = Object.keys(columns).length;
    if (!best || score > best.score) best = { index, columns, score };
  });
  if (!best) throw new Error("Unable to identify a transaction header row");
  return best;
}

export function parseCsv(input: Uint8Array | string, options: ParseCsvOptions): ParsedCsv {
  const decoded = decodeCsv(input);
  const delimiter = sniffDelimiter(decoded.text);
  const rows = parseDelimited(decoded.text, delimiter);
  const header = findHeader(rows);
  const dateColumn = header.columns.date!;
  const dataRows = rows.slice(header.index + 1).filter((row) => row[dateColumn]?.trim());
  const dateOrder = inferDateOrder(dataRows.map((row) => row[dateColumn]!), options.defaultDateOrder);
  const transactions: RawTransaction[] = dataRows.map((row, offset) => {
    const description = row[header.columns.description!]?.trim() ?? "";
    if (!description) throw new Error(`Missing description at source row ${header.index + offset + 1}`);
    let amount: number | undefined;
    if (header.columns.amount !== undefined) amount = parseAmount(row[header.columns.amount] ?? "");
    else {
      const debit = header.columns.debit === undefined ? undefined : parseAmount(row[header.columns.debit] ?? "");
      const credit = header.columns.credit === undefined ? undefined : parseAmount(row[header.columns.credit] ?? "");
      if (debit !== undefined && credit !== undefined) throw new Error(`Both debit and credit are populated at source row ${header.index + offset + 1}`);
      amount = credit !== undefined ? Math.abs(credit) : debit !== undefined ? -Math.abs(debit) : undefined;
    }
    if (amount === undefined) throw new Error(`Missing amount at source row ${header.index + offset + 1}`);
    const balance = header.columns.balance === undefined ? undefined : parseAmount(row[header.columns.balance] ?? "");
    return {
      date: parseDate(row[dateColumn]!, dateOrder), description, amount,
      ...(balance === undefined ? {} : { balanceAfter: balance }),
      sourceStatementId: options.sourceStatementId,
      sourceRowIndex: header.index + offset + 1,
    };
  });
  return { transactions, delimiter, encoding: decoded.encoding, dateOrder, headerRowIndex: header.index, columns: header.columns };
}
