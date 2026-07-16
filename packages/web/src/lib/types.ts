export type AccountView = {
  id: string;
  name: string;
  institutionName: string;
  accountType: "checking" | "savings" | "credit" | "cash" | "other";
  source: string;
  currency: string;
};

export type CategoryView = { id: string; name: string; color: string; icon: string; isSystem: boolean };

export type ReviewReason = "validation" | "low-confidence" | "uncategorized";

export type TransactionView = {
  id: string;
  date: string;
  description: string;
  merchant: string;
  amountCents: number;
  balanceAfterCents: number | null;
  accountId: string;
  accountName: string;
  statementId: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryConfidence: number | null;
  categorySource: "cache" | "llm" | "user" | null;
  isSubscriptionCandidate: boolean;
  needsReview: boolean;
  reviewReason: ReviewReason | null;
};

export type TransactionPage = { transactions: TransactionView[]; nextCursor: string | null };

export type SubscriptionView = {
  id: string;
  displayName: string;
  merchantNormalized: string;
  amountEstimateCents: number;
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  status: "active" | "lapsed" | "cancelled";
  firstSeenDate: string;
  lastChargeDate: string;
  nextExpectedDate: string;
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

export type UploadResult = {
  statementId: string;
  parseStatus: "completed" | "failed";
  needsReview?: boolean;
  reviewRowIndices?: number[];
  transactionCount?: number;
  categorizedCount?: number;
  parserProfileUsed?: string;
  error?: string;
};
