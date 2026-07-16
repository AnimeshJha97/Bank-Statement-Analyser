import { createHash } from "node:crypto";
import type { RawTransaction, TransactionWithDedupeHash } from "./types.js";

export function normalizeDescription(description: string): string {
  return description.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function createDedupeHash(accountId: string, transaction: Pick<RawTransaction, "date" | "amount" | "description">): string {
  const amountInMinorUnits = Math.round(transaction.amount * 100);
  const identity = JSON.stringify([accountId, transaction.date, amountInMinorUnits, normalizeDescription(transaction.description)]);
  return createHash("sha256").update(identity).digest("hex");
}

export function assignDedupeHashes(accountId: string, transactions: readonly RawTransaction[]): TransactionWithDedupeHash[] {
  const occurrences = new Map<string, number>();
  return transactions.map((transaction) => {
    const base = createDedupeHash(accountId, transaction);
    const ordinal = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, ordinal);
    return { ...transaction, dedupeHash: ordinal === 1 ? base : `${base}:${ordinal}` };
  });
}
