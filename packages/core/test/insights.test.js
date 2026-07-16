import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateMonthlyInsights, normalizeMonth, priorMonth } from "../dist/index.js";
import { multiMonthTransactions } from "./fixtures/multi-month-transactions.js";

test("aggregates category spend, month trend, and top merchants from multi-month history", () => {
  const snapshot = aggregateMonthlyInsights(multiMonthTransactions, "2026-06");
  assert.equal(snapshot.totalSpendCents, 27000);
  assert.equal(snapshot.priorMonthTotalSpendCents, 15000);
  assert.equal(snapshot.trendVsPriorMonth, 0.8);
  assert.deepEqual(snapshot.byCategory, [
    { categoryId: "groceries", categoryName: "Groceries", amountCents: 15000, priorMonthAmountCents: 10000, trendVsPriorMonth: 0.5 },
    { categoryId: "dining", categoryName: "Dining", amountCents: 10000, priorMonthAmountCents: 5000, trendVsPriorMonth: 1 },
    { categoryId: null, categoryName: "Uncategorized", amountCents: 2000, priorMonthAmountCents: 0, trendVsPriorMonth: null },
  ]);
  assert.deepEqual(snapshot.topMerchants, [
    { merchant: "MARKET", amountCents: 15000 }, { merchant: "CAFE", amountCents: 7000 },
    { merchant: "BISTRO", amountCents: 3000 }, { merchant: "MYSTERY SHOP", amountCents: 2000 },
  ]);
});

test("ignores credits and transactions outside current and prior months", () => {
  const snapshot = aggregateMonthlyInsights(multiMonthTransactions, "2026-05");
  assert.equal(snapshot.totalSpendCents, 15000);
  assert.equal(snapshot.priorMonthTotalSpendCents, 8000);
  assert.equal(snapshot.byCategory.some((row) => row.categoryId === "income"), false);
});

test("validates and rolls month keys across year boundaries", () => {
  assert.equal(priorMonth("2026-01"), "2025-12");
  assert.throws(() => normalizeMonth("2026-13"), /YYYY-MM/);
});
