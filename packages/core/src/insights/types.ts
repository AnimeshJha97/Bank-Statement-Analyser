export type InsightTransaction = {
  date: string;
  amount: bigint;
  categoryId: string | null;
  categoryName?: string | null;
  merchantNormalized: string;
};

export type CategorySpend = {
  categoryId: string | null;
  categoryName: string;
  amountCents: number;
  priorMonthAmountCents: number;
  trendVsPriorMonth: number | null;
};

export type MonthlyInsightPayload = {
  period: string;
  totalSpendCents: number;
  priorMonthTotalSpendCents: number;
  trendVsPriorMonth: number | null;
  byCategory: CategorySpend[];
  topMerchants: Array<{ merchant: string; amountCents: number }>;
};
