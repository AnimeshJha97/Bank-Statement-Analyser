import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateMonthlyInsights } from "@statement/core";
import { buildApp } from "../dist/index.js";

const transactions = [
  { date: "2026-05-01", amount: -10000n, categoryId: "groceries", categoryName: "Groceries", merchantNormalized: "MARKET" },
  { date: "2026-06-01", amount: -15000n, categoryId: "groceries", categoryName: "Groceries", merchantNormalized: "MARKET" },
  { date: "2026-06-02", amount: -9000n, categoryId: "dining", categoryName: "Dining", merchantNormalized: "CAFE" },
];

class NoopStatementRepository {
  async createStatement() { throw new Error("not used"); }
  async completeStatement() { return 0; }
  async failStatement() {}
}

class MemoryFinanceRepository {
  snapshots = new Map(); budgets = new Map(); refreshCalls = 0; nextId = 1;
  async getInsight(userId, period) { return this.snapshots.get(`${userId}:${period}`) ?? null; }
  async refreshInsight(userId, period) {
    this.refreshCalls++;
    const payload = aggregateMonthlyInsights(transactions, period);
    this.snapshots.set(`${userId}:${period}`, payload);
    return payload;
  }
  async listBudgets(userId, month) {
    const actuals = new Map();
    for (const row of transactions) if (row.date.startsWith(month) && row.amount < 0n) actuals.set(row.categoryId, (actuals.get(row.categoryId) ?? 0) + Number(-row.amount));
    return [...this.budgets.values()].filter((budget) => budget.userId === userId && budget.month === month).map((budget) => {
      const actual = actuals.get(budget.categoryId) ?? 0;
      return { id: budget.id, categoryId: budget.categoryId, categoryName: budget.categoryId === "dining" ? "Dining" : "Groceries", month,
        targetAmountCents: budget.targetAmountCents, actualAmountCents: actual,
        remainingAmountCents: budget.targetAmountCents - actual, percentUsed: budget.targetAmountCents === 0 ? null : actual / budget.targetAmountCents };
    });
  }
  async upsertBudget(userId, input) {
    if (!Number.isSafeInteger(input.targetAmountCents) || input.targetAmountCents < 0) throw new Error("targetAmountCents must be a non-negative integer");
    const key = `${userId}:${input.categoryId}:${input.month}`;
    const old = this.budgets.get(key);
    this.budgets.set(key, { ...input, userId, id: old?.id ?? `budget-${this.nextId++}` });
    return (await this.listBudgets(userId, input.month)).find((row) => row.categoryId === input.categoryId);
  }
  async deleteBudget(userId, categoryId, month) { return this.budgets.delete(`${userId}:${categoryId}:${month}`); }
}

const headers = { "x-user-id": "user-1" };

test("monthly insight reads use the persisted snapshot after one cache miss", async () => {
  const finance = new MemoryFinanceRepository(); const app = buildApp(new NoopStatementRepository(), finance);
  const first = await app.inject({ method: "GET", url: "/api/insights/monthly?period=2026-06", headers });
  assert.equal(first.statusCode, 200); assert.equal(first.json().totalSpendCents, 24000); assert.equal(finance.refreshCalls, 1);
  transactions.push({ date: "2026-06-03", amount: -999n, categoryId: "dining", categoryName: "Dining", merchantNormalized: "LATE" });
  const second = await app.inject({ method: "GET", url: "/api/insights/monthly?period=2026-06", headers });
  assert.equal(second.json().totalSpendCents, 24000); assert.equal(finance.refreshCalls, 1);
  transactions.pop(); await app.close();
});

test("budget CRUD returns target versus actual for the requested month", async () => {
  const finance = new MemoryFinanceRepository(); const app = buildApp(new NoopStatementRepository(), finance);
  const saved = await app.inject({ method: "PUT", url: "/api/budgets", headers, payload: { categoryId: "dining", month: "2026-06", targetAmountCents: 12000 } });
  assert.equal(saved.statusCode, 200); assert.deepEqual(saved.json(), { id: "budget-1", categoryId: "dining", categoryName: "Dining", month: "2026-06", targetAmountCents: 12000, actualAmountCents: 9000, remainingAmountCents: 3000, percentUsed: 0.75 });
  const updated = await app.inject({ method: "PUT", url: "/api/budgets", headers, payload: { categoryId: "dining", month: "2026-06", targetAmountCents: 8000 } });
  assert.equal(updated.json().remainingAmountCents, -1000); assert.equal(updated.json().percentUsed, 1.125);
  const listed = await app.inject({ method: "GET", url: "/api/budgets?month=2026-06", headers });
  assert.equal(listed.json().budgets.length, 1);
  const deleted = await app.inject({ method: "DELETE", url: "/api/budgets?month=2026-06&categoryId=dining", headers });
  assert.equal(deleted.statusCode, 204);
  const empty = await app.inject({ method: "GET", url: "/api/budgets?month=2026-06", headers }); assert.deepEqual(empty.json().budgets, []);
  await app.close();
});

test("finance routes require user context and reject incomplete requests", async () => {
  const app = buildApp(new NoopStatementRepository(), new MemoryFinanceRepository());
  assert.equal((await app.inject({ method: "GET", url: "/api/budgets?month=2026-06" })).statusCode, 401);
  assert.equal((await app.inject({ method: "PUT", url: "/api/budgets", headers, payload: { month: "2026-06" } })).statusCode, 400);
  await app.close();
});
