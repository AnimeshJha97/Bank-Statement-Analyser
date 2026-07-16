import { and, eq, gte, lt, sql } from "drizzle-orm";
import { accounts, budgets, categories, transactions } from "../db/schema.js";
import { normalizeMonth } from "../insights/engine.js";
import type { createDatabase } from "../db/client.js";
import type { BudgetResult } from "./types.js";

type Database = ReturnType<typeof createDatabase>["db"];
const toNumber = (value: bigint) => { const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error("amount exceeds safe integer range"); return number; };

export class DrizzleBudgetStore {
  constructor(private readonly db: Database) {}

  async list(userId: string, month: string): Promise<BudgetResult[]> {
    normalizeMonth(month);
    const start = `${month}-01`;
    const [year, number] = month.split("-").map(Number);
    const endDate = new Date(Date.UTC(year!, number!, 1));
    const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const actuals = this.db.select({
      categoryId: transactions.categoryId,
      amount: sql<bigint>`coalesce(sum(-${transactions.amount}), 0)::bigint`.as("actual_amount"),
    }).from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(eq(accounts.userId, userId), gte(transactions.date, start), lt(transactions.date, end), lt(transactions.amount, 0n)))
      .groupBy(transactions.categoryId).as("actuals");
    const rows = await this.db.select({
      id: budgets.id, categoryId: budgets.categoryId, categoryName: categories.name,
      target: budgets.targetAmount, actual: actuals.amount,
    }).from(budgets).innerJoin(categories, eq(budgets.categoryId, categories.id))
      .leftJoin(actuals, eq(budgets.categoryId, actuals.categoryId))
      .where(and(eq(budgets.userId, userId), eq(budgets.month, start)));
    return rows.map((row) => {
      const target = toNumber(row.target); const actual = toNumber(row.actual ?? 0n);
      return { id: row.id, categoryId: row.categoryId, categoryName: row.categoryName, month,
        targetAmountCents: target, actualAmountCents: actual, remainingAmountCents: target - actual,
        percentUsed: target === 0 ? null : actual / target };
    });
  }

  async upsert(userId: string, input: { categoryId: string; month: string; targetAmountCents: number }): Promise<BudgetResult> {
    normalizeMonth(input.month);
    if (!Number.isSafeInteger(input.targetAmountCents) || input.targetAmountCents < 0) throw new Error("targetAmountCents must be a non-negative integer");
    const [ownedCategory] = await this.db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, input.categoryId), sql`(${categories.userId} is null or ${categories.userId} = ${userId})`)).limit(1);
    if (!ownedCategory) throw new Error("category not found");
    await this.db.insert(budgets).values({ userId, categoryId: input.categoryId, month: `${input.month}-01`, targetAmount: BigInt(input.targetAmountCents) })
      .onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId, budgets.month], set: { targetAmount: BigInt(input.targetAmountCents) } });
    const result = (await this.list(userId, input.month)).find((budget) => budget.categoryId === input.categoryId);
    if (!result) throw new Error("failed to save budget");
    return result;
  }

  async delete(userId: string, categoryId: string, month: string): Promise<boolean> {
    normalizeMonth(month);
    const deleted = await this.db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId), eq(budgets.month, `${month}-01`))).returning({ id: budgets.id });
    return deleted.length > 0;
  }
}
