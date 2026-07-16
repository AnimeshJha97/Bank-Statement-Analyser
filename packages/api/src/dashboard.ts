import { and, asc, desc, eq, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  DrizzleCategoryCache,
  SubscriptionDetector,
  OpenAISubscriptionNamer,
  accounts,
  categories,
  normalizeMerchant,
  statements,
  subscriptions,
  transactions,
  users,
  type CategoryName,
  type SubscriptionDisplayNamer,
  type createDatabase,
} from "@statement/core";

/** Below this categorization confidence a transaction is surfaced for review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_USER_EMAIL = "owner@statement.local";

export class DashboardError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export type DashboardUser = { userId: string; email: string };
export type AccountType = "checking" | "savings" | "credit" | "cash" | "other";
export type AccountView = { id: string; name: string; institutionName: string; accountType: AccountType; source: string; currency: string };
export type NewAccount = { name: string; institutionName: string; accountType: AccountType };
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

export type TransactionQuery = {
  accountId?: string | undefined;
  categoryId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  needsReview?: boolean | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
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

export type StatementView = {
  statementId: string;
  sourceFilename: string;
  fileType: "csv" | "pdf";
  uploadedAt: string;
  parseStatus: "pending" | "processing" | "completed" | "failed";
  parserProfileUsed: string | null;
  needsReview: boolean;
  reviewRowIndices: number[];
  transactionCount: number;
};

export interface DashboardRepository {
  ensureUser(preferredUserId?: string): Promise<DashboardUser>;
  listAccounts(userId: string): Promise<AccountView[]>;
  createAccount(userId: string, input: NewAccount): Promise<AccountView>;
  listCategories(userId: string): Promise<CategoryView[]>;
  listTransactions(userId: string, query: TransactionQuery): Promise<TransactionPage>;
  correctTransaction(userId: string, transactionId: string, categoryId: string): Promise<TransactionView>;
  confirmTransaction(userId: string, transactionId: string): Promise<TransactionView>;
  listSubscriptions(userId: string): Promise<SubscriptionView[]>;
  getStatement(userId: string, statementId: string): Promise<StatementView | null>;
}

export function displayMerchant(rawDescription: string): string {
  const normalized = normalizeMerchant(rawDescription) || rawDescription.trim().toUpperCase();
  return normalized.toLowerCase().replace(/(^|[\s/&('.-])\p{L}/gu, (match) => match.toUpperCase());
}

function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${date}~${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { date: string; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const separator = decoded.indexOf("~");
  const date = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (separator === -1 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !UUID.test(id)) {
    throw new DashboardError("invalid cursor", 400);
  }
  return { date, id };
}

type Database = ReturnType<typeof createDatabase>["db"];

export interface DashboardRepositoryOptions {
  openaiApiKey?: string | undefined;
  defaultUserEmail?: string | undefined;
}

export function createDrizzleDashboardRepository(db: Database, options: DashboardRepositoryOptions = {}): DashboardRepository {
  const cache = new DrizzleCategoryCache(db);
  const namer = safeNamer(options.openaiApiKey);

  const transactionSelection = {
    id: transactions.id,
    date: transactions.date,
    rawDescription: transactions.rawDescription,
    amount: transactions.amount,
    balanceAfter: transactions.balanceAfter,
    accountId: transactions.accountId,
    accountName: accounts.name,
    accountUserId: accounts.userId,
    statementId: transactions.statementId,
    categoryId: transactions.categoryId,
    categoryName: categories.name,
    categoryColor: categories.color,
    categoryConfidence: transactions.categoryConfidence,
    categorySource: transactions.categorySource,
    isSubscriptionCandidate: transactions.isSubscriptionCandidate,
    sourceRowIndex: transactions.sourceRowIndex,
    statementNeedsReview: statements.needsReview,
    reviewRowIndices: statements.reviewRowIndices,
  };

  type TransactionRow = {
    id: string; date: string; rawDescription: string; amount: bigint; balanceAfter: bigint | null;
    accountId: string; accountName: string; accountUserId: string; statementId: string;
    categoryId: string | null; categoryName: string | null; categoryColor: string | null;
    categoryConfidence: string | null; categorySource: "cache" | "llm" | "user" | null;
    isSubscriptionCandidate: boolean; sourceRowIndex: number | null;
    statementNeedsReview: boolean; reviewRowIndices: number[];
  };

  const reviewReason = (row: TransactionRow): ReviewReason | null => {
    const validationFlagged = row.statementNeedsReview
      && row.sourceRowIndex !== null
      && row.reviewRowIndices.includes(row.sourceRowIndex);
    if (validationFlagged) return "validation";
    if (row.categoryId === null) return "uncategorized";
    const confidence = row.categoryConfidence === null ? null : Number(row.categoryConfidence);
    if (confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD && row.categorySource !== "user") return "low-confidence";
    return null;
  };

  const toView = (row: TransactionRow): TransactionView => {
    const reason = reviewReason(row);
    return {
      id: row.id,
      date: row.date,
      description: row.rawDescription,
      merchant: displayMerchant(row.rawDescription),
      amountCents: Number(row.amount),
      balanceAfterCents: row.balanceAfter === null ? null : Number(row.balanceAfter),
      accountId: row.accountId,
      accountName: row.accountName,
      statementId: row.statementId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor,
      categoryConfidence: row.categoryConfidence === null ? null : Number(row.categoryConfidence),
      categorySource: row.categorySource,
      isSubscriptionCandidate: row.isSubscriptionCandidate,
      needsReview: reason !== null,
      reviewReason: reason,
    };
  };

  const selectTransactions = (where: SQL | undefined, limit?: number) => {
    const query = db.select(transactionSelection)
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(statements, eq(transactions.statementId, statements.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.id));
    return limit === undefined ? query : query.limit(limit);
  };

  const loadOwnedTransaction = async (userId: string, transactionId: string): Promise<TransactionRow> => {
    if (!UUID.test(transactionId)) throw new DashboardError("transaction not found", 404);
    const [row] = await selectTransactions(and(eq(transactions.id, transactionId), eq(accounts.userId, userId)), 1);
    if (!row) throw new DashboardError("transaction not found", 404);
    return row as TransactionRow;
  };

  /** An explicit user action on a row resolves its validation flag on the parent statement. */
  const resolveValidationFlag = async (row: TransactionRow): Promise<TransactionRow> => {
    if (!row.statementNeedsReview || row.sourceRowIndex === null || !row.reviewRowIndices.includes(row.sourceRowIndex)) return row;
    const remaining = row.reviewRowIndices.filter((index) => index !== row.sourceRowIndex);
    await db.update(statements)
      .set({ reviewRowIndices: remaining, needsReview: remaining.length > 0 })
      .where(eq(statements.id, row.statementId));
    return { ...row, statementNeedsReview: remaining.length > 0, reviewRowIndices: remaining };
  };

  const trainCache = async (userId: string, row: TransactionRow, categoryName: string, isSystemCategory: boolean) => {
    if (!isSystemCategory) return;
    const merchantKey = normalizeMerchant(row.rawDescription);
    if (!merchantKey) return;
    await cache.saveUserCorrection(userId, { normalizedMerchant: merchantKey, category: categoryName as CategoryName, confidence: 1 });
  };

  return {
    async ensureUser(preferredUserId) {
      if (preferredUserId && UUID.test(preferredUserId)) {
        const [existing] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, preferredUserId)).limit(1);
        if (existing) return { userId: existing.id, email: existing.email };
      }
      const [first] = await db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.createdAt)).limit(1);
      if (first) return { userId: first.id, email: first.email };
      const [created] = await db.insert(users)
        .values({ email: options.defaultUserEmail ?? DEFAULT_USER_EMAIL })
        .returning({ id: users.id, email: users.email });
      if (!created) throw new DashboardError("failed to create the default user", 500);
      return { userId: created.id, email: created.email };
    },

    async listAccounts(userId) {
      const rows = await db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(asc(accounts.name));
      return rows.map((row) => ({
        id: row.id, name: row.name, institutionName: row.institutionName,
        accountType: row.accountType, source: row.source, currency: row.currency,
      }));
    },

    async createAccount(userId, input) {
      const name = input.name?.trim();
      const institutionName = input.institutionName?.trim();
      if (!name || !institutionName) throw new DashboardError("name and institutionName are required", 400);
      const validTypes: AccountType[] = ["checking", "savings", "credit", "cash", "other"];
      if (!validTypes.includes(input.accountType)) throw new DashboardError(`accountType must be one of: ${validTypes.join(", ")}`, 400);
      const [created] = await db.insert(accounts)
        .values({ userId, name, institutionName, accountType: input.accountType })
        .returning();
      if (!created) throw new DashboardError("failed to create account", 500);
      return {
        id: created.id, name: created.name, institutionName: created.institutionName,
        accountType: created.accountType, source: created.source, currency: created.currency,
      };
    },

    async listCategories(userId) {
      const rows = await db.select().from(categories)
        .where(or(isNull(categories.userId), eq(categories.userId, userId)))
        .orderBy(asc(categories.name));
      return rows.map((row) => ({ id: row.id, name: row.name, color: row.color, icon: row.icon, isSystem: row.userId === null }));
    },

    async listTransactions(userId, query) {
      const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
      const conditions: (SQL | undefined)[] = [eq(accounts.userId, userId)];
      if (query.accountId) {
        if (!UUID.test(query.accountId)) throw new DashboardError("invalid accountId", 400);
        conditions.push(eq(transactions.accountId, query.accountId));
      }
      if (query.categoryId === "uncategorized") conditions.push(isNull(transactions.categoryId));
      else if (query.categoryId) {
        if (!UUID.test(query.categoryId)) throw new DashboardError("invalid categoryId", 400);
        conditions.push(eq(transactions.categoryId, query.categoryId));
      }
      if (query.from) conditions.push(gte(transactions.date, query.from));
      if (query.to) conditions.push(lte(transactions.date, query.to));
      if (query.needsReview !== undefined) {
        const flagged = sql`((${statements.needsReview} and ${transactions.sourceRowIndex} is not null and ${statements.reviewRowIndices} @> to_jsonb(${transactions.sourceRowIndex}))
          or ${transactions.categoryId} is null
          or (${transactions.categoryConfidence} < ${LOW_CONFIDENCE_THRESHOLD} and ${transactions.categorySource} is distinct from 'user'))`;
        conditions.push(query.needsReview ? flagged : sql`not ${flagged}`);
      }
      if (query.cursor) {
        const { date, id } = decodeCursor(query.cursor);
        conditions.push(sql`(${transactions.date}, ${transactions.id}) < (${date}::date, ${id}::uuid)`);
      }
      const rows = (await selectTransactions(and(...conditions), limit + 1)) as TransactionRow[];
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        transactions: page.map(toView),
        nextCursor: rows.length > limit && last ? encodeCursor(last.date, last.id) : null,
      };
    },

    async correctTransaction(userId, transactionId, categoryId) {
      if (!UUID.test(categoryId)) throw new DashboardError("invalid categoryId", 400);
      let row = await loadOwnedTransaction(userId, transactionId);
      const [category] = await db.select().from(categories)
        .where(and(eq(categories.id, categoryId), or(isNull(categories.userId), eq(categories.userId, userId))))
        .limit(1);
      if (!category) throw new DashboardError("category not found", 404);
      await db.update(transactions)
        .set({ categoryId, categoryConfidence: "1", categorySource: "user" })
        .where(eq(transactions.id, transactionId));
      await trainCache(userId, row, category.name, category.userId === null);
      row = await resolveValidationFlag(row);
      return toView({
        ...row,
        categoryId,
        categoryName: category.name,
        categoryColor: category.color,
        categoryConfidence: "1",
        categorySource: "user",
      });
    },

    async confirmTransaction(userId, transactionId) {
      let row = await loadOwnedTransaction(userId, transactionId);
      if (row.categoryId !== null) {
        await db.update(transactions)
          .set({ categoryConfidence: "1", categorySource: "user" })
          .where(eq(transactions.id, transactionId));
        if (row.categoryName) await trainCache(userId, row, row.categoryName, true);
        row = { ...row, categoryConfidence: "1", categorySource: "user" };
      }
      row = await resolveValidationFlag(row);
      return toView(row);
    },

    async listSubscriptions(userId) {
      const rows = await db.select({
        date: transactions.date,
        rawDescription: transactions.rawDescription,
        amount: transactions.amount,
      }).from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(eq(accounts.userId, userId))
        .orderBy(asc(transactions.date));
      const detector = new SubscriptionDetector(namer);
      const detected = await detector.detect(rows.map((row) => ({
        date: row.date,
        description: row.rawDescription,
        amount: row.amount,
      })));
      return db.transaction(async (tx) => {
        await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));
        if (detected.length === 0) return [];
        const inserted = await tx.insert(subscriptions).values(detected.map((subscription) => ({
          userId,
          merchantNormalized: subscription.merchantNormalized,
          displayName: subscription.displayName,
          amountEstimate: subscription.amountEstimate < 0n ? -subscription.amountEstimate : subscription.amountEstimate,
          cadence: subscription.cadence,
          firstSeenDate: subscription.firstSeenDate,
          lastChargeDate: subscription.lastChargeDate,
          nextExpectedDate: subscription.nextExpectedDate,
          status: subscription.status,
        }))).returning();
        return inserted
          .map((row) => ({
            id: row.id,
            displayName: row.displayName,
            merchantNormalized: row.merchantNormalized,
            amountEstimateCents: Number(row.amountEstimate),
            cadence: row.cadence,
            status: row.status,
            firstSeenDate: row.firstSeenDate,
            lastChargeDate: row.lastChargeDate,
            nextExpectedDate: row.nextExpectedDate,
          }))
          .sort((a, b) => a.status.localeCompare(b.status) || b.amountEstimateCents - a.amountEstimateCents);
      });
    },

    async getStatement(userId, statementId) {
      if (!UUID.test(statementId)) return null;
      const [row] = await db.select({
        statementId: statements.id,
        sourceFilename: statements.sourceFilename,
        fileType: statements.fileType,
        uploadedAt: statements.uploadedAt,
        parseStatus: statements.parseStatus,
        parserProfileUsed: statements.parserProfileUsed,
        needsReview: statements.needsReview,
        reviewRowIndices: statements.reviewRowIndices,
        transactionCount: sql<number>`(select count(*)::int from ${transactions} where ${transactions.statementId} = ${statements.id})`,
      }).from(statements)
        .innerJoin(accounts, eq(statements.accountId, accounts.id))
        .where(and(eq(statements.id, statementId), eq(accounts.userId, userId)))
        .limit(1);
      if (!row) return null;
      return { ...row, uploadedAt: row.uploadedAt.toISOString(), reviewRowIndices: row.reviewRowIndices as number[] };
    },
  };
}

function titleCase(merchant: string): string {
  return merchant.toLowerCase().replace(/(^|[\s/&('.-])\p{L}/gu, (match) => match.toUpperCase());
}

function safeNamer(openaiApiKey: string | undefined): SubscriptionDisplayNamer {
  if (!openaiApiKey) return { name: async (merchant) => titleCase(merchant) };
  const inner = new OpenAISubscriptionNamer({ apiKey: openaiApiKey });
  return {
    async name(merchant) {
      try {
        return await inner.name(merchant);
      } catch {
        return titleCase(merchant);
      }
    },
  };
}
