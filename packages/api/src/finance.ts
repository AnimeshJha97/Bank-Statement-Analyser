import { DrizzleBudgetStore, DrizzleInsightStore, type BudgetResult, type MonthlyInsightPayload } from "@statement/core";
import type { createDatabase } from "@statement/core";

export interface FinanceRepository {
  getInsight(userId: string, period: string): Promise<MonthlyInsightPayload | null>;
  refreshInsight(userId: string, period: string): Promise<MonthlyInsightPayload>;
  listBudgets(userId: string, month: string): Promise<BudgetResult[]>;
  upsertBudget(userId: string, input: { categoryId: string; month: string; targetAmountCents: number }): Promise<BudgetResult>;
  deleteBudget(userId: string, categoryId: string, month: string): Promise<boolean>;
}

export function createDrizzleFinanceRepository(db: ReturnType<typeof createDatabase>["db"]): FinanceRepository {
  const insights = new DrizzleInsightStore(db);
  const budgets = new DrizzleBudgetStore(db);
  return {
    getInsight: (userId, period) => insights.get(userId, period),
    refreshInsight: (userId, period) => insights.refresh(userId, period),
    listBudgets: (userId, month) => budgets.list(userId, month),
    upsertBudget: (userId, input) => budgets.upsert(userId, input),
    deleteBudget: (userId, categoryId, month) => budgets.delete(userId, categoryId, month),
  };
}
