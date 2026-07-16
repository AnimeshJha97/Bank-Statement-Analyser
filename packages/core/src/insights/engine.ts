import type { InsightTransaction, MonthlyInsightPayload } from "./types.js";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizeMonth(month: string): string {
  if (!MONTH.test(month)) throw new Error("month must use YYYY-MM format");
  return month;
}

export function priorMonth(month: string): string {
  normalizeMonth(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function safeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("aggregate exceeds the safe integer range");
  return result;
}

function ratio(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null;
  return (safeNumber(current) - safeNumber(previous)) / safeNumber(previous);
}

/** Aggregates debits only. Transaction amounts remain signed; spend is exposed as positive cents. */
export function aggregateMonthlyInsights(
  transactions: readonly InsightTransaction[],
  period: string,
  topMerchantLimit = 5,
): MonthlyInsightPayload {
  normalizeMonth(period);
  const previousPeriod = priorMonth(period);
  const currentCategories = new Map<string, { id: string | null; name: string; amount: bigint }>();
  const previousCategories = new Map<string, bigint>();
  const merchants = new Map<string, bigint>();
  let currentTotal = 0n;
  let previousTotal = 0n;

  for (const transaction of transactions) {
    const transactionMonth = transaction.date.slice(0, 7);
    if (transaction.amount >= 0n || (transactionMonth !== period && transactionMonth !== previousPeriod)) continue;
    const spend = -transaction.amount;
    const key = transaction.categoryId ?? "uncategorized";
    if (transactionMonth === period) {
      currentTotal += spend;
      const existing = currentCategories.get(key);
      currentCategories.set(key, {
        id: transaction.categoryId,
        name: transaction.categoryName ?? "Uncategorized",
        amount: (existing?.amount ?? 0n) + spend,
      });
      merchants.set(transaction.merchantNormalized, (merchants.get(transaction.merchantNormalized) ?? 0n) + spend);
    } else {
      previousTotal += spend;
      previousCategories.set(key, (previousCategories.get(key) ?? 0n) + spend);
    }
  }

  return {
    period,
    totalSpendCents: safeNumber(currentTotal),
    priorMonthTotalSpendCents: safeNumber(previousTotal),
    trendVsPriorMonth: ratio(currentTotal, previousTotal),
    byCategory: [...currentCategories.entries()].map(([key, value]) => {
      const previous = previousCategories.get(key) ?? 0n;
      return {
        categoryId: value.id,
        categoryName: value.name,
        amountCents: safeNumber(value.amount),
        priorMonthAmountCents: safeNumber(previous),
        trendVsPriorMonth: ratio(value.amount, previous),
      };
    }).sort((a, b) => b.amountCents - a.amountCents),
    topMerchants: [...merchants.entries()]
      .map(([merchant, amount]) => ({ merchant, amountCents: safeNumber(amount) }))
      .sort((a, b) => b.amountCents - a.amountCents || a.merchant.localeCompare(b.merchant))
      .slice(0, topMerchantLimit),
  };
}
