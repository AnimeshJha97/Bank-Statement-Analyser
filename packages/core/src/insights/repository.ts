import { and, eq, gte, lt } from "drizzle-orm";
import { accounts, categories, insightSnapshots, transactions } from "../db/schema.js";
import { aggregateMonthlyInsights, normalizeMonth, priorMonth } from "./engine.js";
import type { MonthlyInsightPayload } from "./types.js";
import type { createDatabase } from "../db/client.js";

type Database = ReturnType<typeof createDatabase>["db"];

export class DrizzleInsightStore {
  constructor(private readonly db: Database) {}

  async get(userId: string, period: string): Promise<MonthlyInsightPayload | null> {
    const month = `${normalizeMonth(period)}-01`;
    const [snapshot] = await this.db.select({ payload: insightSnapshots.payload }).from(insightSnapshots)
      .where(and(eq(insightSnapshots.userId, userId), eq(insightSnapshots.period, month))).limit(1);
    return (snapshot?.payload as MonthlyInsightPayload | undefined) ?? null;
  }

  async refresh(userId: string, period: string): Promise<MonthlyInsightPayload> {
    normalizeMonth(period);
    const from = `${priorMonth(period)}-01`;
    const [year, month] = period.split("-").map(Number);
    const untilDate = new Date(Date.UTC(year!, month!, 1));
    const until = `${untilDate.getUTCFullYear()}-${String(untilDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const rows = await this.db.select({
      date: transactions.date, amount: transactions.amount, categoryId: transactions.categoryId,
      categoryName: categories.name, merchantNormalized: transactions.merchantNormalized,
    }).from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(eq(accounts.userId, userId), gte(transactions.date, from), lt(transactions.date, until)));
    const payload = aggregateMonthlyInsights(rows, period);
    await this.db.insert(insightSnapshots).values({ userId, period: `${period}-01`, payload })
      .onConflictDoUpdate({ target: [insightSnapshots.userId, insightSnapshots.period], set: { payload, generatedAt: new Date() } });
    return payload;
  }
}
