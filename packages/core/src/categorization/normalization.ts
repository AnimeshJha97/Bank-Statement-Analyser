const PREFIXES = [
  /^(?:POS(?:\s+DEBIT)?|DEBIT\s+CARD|CHECKCARD|VISA|MASTERCARD|MC)\s*[-:*#]?\s*/i,
  /^(?:SQ\s*\*|TST\s*\*)\s*/i,
];

/** Deterministically removes payment-rail and location noise from a statement description. */
export function normalizeMerchant(description: string): string {
  let merchant = description.normalize("NFKC").trim();
  for (const prefix of PREFIXES) merchant = merchant.replace(prefix, "");

  merchant = merchant
    .replace(/\s+(?:CARD|REF|AUTH|TRACE|TXN|TRANSACTION)\s*[#:*-]?\s*[A-Z0-9-]{4,}\s*$/i, "")
    .replace(/\s+[#*]\s*\d{3,}\b.*$/i, "")
    .replace(/\s+STORE\s*(?:#|NO\.?)?\s*\d+\b/gi, "")
    .replace(/\s+#\d+\b/g, "")
    .replace(/\s+\d{3,}\s+[A-Z][A-Z .'-]+,?\s+[A-Z]{2}\s*$/i, "")
    .replace(/\s+[A-Z][A-Z .'-]+,?\s+[A-Z]{2}\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:*#-]+$/g, "")
    .trim();

  return merchant.toUpperCase();
}
