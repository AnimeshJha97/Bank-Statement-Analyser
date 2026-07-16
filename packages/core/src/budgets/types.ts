export type BudgetResult = {
  id: string;
  categoryId: string;
  categoryName: string;
  month: string;
  targetAmountCents: number;
  actualAmountCents: number;
  remainingAmountCents: number;
  percentUsed: number | null;
};
