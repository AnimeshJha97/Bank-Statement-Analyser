import type { RawTransaction } from "@statement/parsers";

/** Returns source row indices whose running balance does not reconcile in cents. */
export function validateBalanceChain(transactions: readonly RawTransaction[]): number[] {
  const failures: number[] = [];
  for (let index = 1; index < transactions.length; index++) {
    const previous = transactions[index - 1]!;
    const current = transactions[index]!;
    if (previous.balanceAfter === undefined || current.balanceAfter === undefined) continue;
    const expectedCents = Math.round(previous.balanceAfter * 100) + Math.round(current.amount * 100);
    if (Math.round(current.balanceAfter * 100) !== expectedCents) failures.push(current.sourceRowIndex);
  }
  return failures;
}
