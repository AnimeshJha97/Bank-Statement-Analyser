export type SubscriptionCadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type SubscriptionStatus = "active" | "lapsed";

export interface RecurringTransaction {
  date: string;
  description: string;
  /** Signed integer minor units. Charges are normally negative. */
  amount: number | bigint;
  merchantNormalized?: string;
}

export interface Subscription {
  merchantNormalized: string;
  displayName: string;
  amountEstimate: bigint;
  cadence: SubscriptionCadence;
  firstSeenDate: string;
  lastChargeDate: string;
  nextExpectedDate: string;
  status: SubscriptionStatus;
  transactionCount: number;
}

export interface SubscriptionDisplayNamer {
  /** Called once for each group after deterministic recurrence confirmation. */
  name(normalizedMerchant: string): Promise<string>;
}

