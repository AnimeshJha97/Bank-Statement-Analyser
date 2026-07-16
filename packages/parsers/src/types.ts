export type RawTransaction = {
  date: string;
  description: string;
  amount: number;
  balanceAfter?: number;
  sourceStatementId: string;
  sourceRowIndex: number;
};

export type TransactionWithDedupeHash = RawTransaction & {
  dedupeHash: string;
};

export type DateOrder = "DMY" | "MDY" | "YMD";

export type ParseCsvOptions = {
  sourceStatementId: string;
  defaultDateOrder?: Exclude<DateOrder, "YMD">;
};

export type ParsedCsv = {
  transactions: RawTransaction[];
  delimiter: string;
  encoding: "utf-8" | "utf-16le" | "utf-16be" | "latin1";
  dateOrder: DateOrder;
  headerRowIndex: number;
  columns: Partial<Record<CanonicalField, number>>;
};

export type CanonicalField =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "balance";

export type PdfTextItem = { text: string; x: number; y: number; width: number; height: number; page: number };
export type PdfColumn = CanonicalField;
export type PdfColumnRange = { field: PdfColumn; minX: number; maxX: number };
export type BankProfile = {
  id: string;
  fingerprints: string[];
  columns: PdfColumnRange[];
  dateOrder: DateOrder;
  yTolerance?: number;
};
export type PdfTransaction = RawTransaction & { confidence: number; extractionMethod: "digital" | "ocr" };
export type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
export type OcrPage = { page: number; width: number; height: number; words: OcrWord[] };
export type ParsePdfOptions = {
  sourceStatementId: string;
  profiles?: BankProfile[];
  ocr?: (pdf: Uint8Array) => Promise<OcrPage[]>;
  minimumTextItems?: number;
};
export type ParsedPdf = {
  transactions: PdfTransaction[];
  profileId: string;
  fingerprint: string;
  extractionMethod: "digital" | "ocr";
  needsReview: boolean;
};
