import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accountTypeEnum = pgEnum("account_type", ["checking", "savings", "credit", "cash", "other"]);
export const accountSourceEnum = pgEnum("account_source", ["manual", "plaid"]);
export const fileTypeEnum = pgEnum("file_type", ["csv", "pdf"]);
export const parseStatusEnum = pgEnum("parse_status", ["pending", "processing", "completed", "failed"]);
export const categorySourceEnum = pgEnum("category_source", ["cache", "llm", "user"]);
export const cacheScopeEnum = pgEnum("cache_scope", ["global", "user"]);
export const cacheSourceEnum = pgEnum("cache_source", ["default", "llm", "user", "crowd"]);
export const subscriptionCadenceEnum = pgEnum("subscription_cadence", ["weekly", "biweekly", "monthly", "quarterly", "yearly"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "lapsed", "cancelled"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`)]);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  institutionName: text("institution_name").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  source: accountSourceEnum("source").notNull().default("manual"),
  currency: text("currency").notNull().default("USD"),
}, (table) => [index("accounts_user_id_idx").on(table.userId)]);

export const statements = pgTable("statements", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  sourceFilename: text("source_filename").notNull(),
  fileType: fileTypeEnum("file_type").notNull(),
  parseStatus: parseStatusEnum("parse_status").notNull().default("pending"),
  parserProfileUsed: text("parser_profile_used"),
  needsReview: boolean("needs_review").notNull().default(false),
}, (table) => [index("statements_account_id_idx").on(table.accountId)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentCategoryId: uuid("parent_category_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
}, (table) => [
  uniqueIndex("categories_system_name_unique").on(table.name).where(sql`${table.userId} is null`),
  uniqueIndex("categories_user_name_unique").on(table.userId, table.name).where(sql`${table.userId} is not null`),
  index("categories_user_id_idx").on(table.userId),
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  statementId: uuid("statement_id").notNull().references(() => statements.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  rawDescription: text("raw_description").notNull(),
  merchantNormalized: text("merchant_normalized").notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  balanceAfter: bigint("balance_after", { mode: "bigint" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  categoryConfidence: numeric("category_confidence", { precision: 5, scale: 4 }),
  categorySource: categorySourceEnum("category_source"),
  isSubscriptionCandidate: boolean("is_subscription_candidate").notNull().default(false),
  dedupeHash: text("dedupe_hash").notNull(),
}, (table) => [
  uniqueIndex("transactions_account_dedupe_unique").on(table.accountId, table.dedupeHash),
  index("transactions_statement_id_idx").on(table.statementId),
  index("transactions_category_id_idx").on(table.categoryId),
  index("transactions_account_date_idx").on(table.accountId, table.date),
  check("transactions_category_confidence_check", sql`${table.categoryConfidence} is null or (${table.categoryConfidence} >= 0 and ${table.categoryConfidence} <= 1)`),
]);

export const merchantCategoryCache = pgTable("merchant_category_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  normalizedMerchant: text("normalized_merchant").notNull(),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  scope: cacheScopeEnum("scope").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  source: cacheSourceEnum("source").notNull(),
}, (table) => [
  uniqueIndex("merchant_cache_global_unique").on(table.normalizedMerchant).where(sql`${table.scope} = 'global'`),
  uniqueIndex("merchant_cache_user_unique").on(table.userId, table.normalizedMerchant).where(sql`${table.scope} = 'user'`),
  index("merchant_cache_category_id_idx").on(table.categoryId),
  check("merchant_cache_confidence_check", sql`${table.confidence} >= 0 and ${table.confidence} <= 1`),
  check("merchant_cache_scope_user_check", sql`(${table.scope} = 'global' and ${table.userId} is null) or (${table.scope} = 'user' and ${table.userId} is not null)`),
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantNormalized: text("merchant_normalized").notNull(),
  displayName: text("display_name").notNull(),
  amountEstimate: bigint("amount_estimate", { mode: "bigint" }).notNull(),
  cadence: subscriptionCadenceEnum("cadence").notNull(),
  firstSeenDate: date("first_seen_date", { mode: "string" }).notNull(),
  lastChargeDate: date("last_charge_date", { mode: "string" }).notNull(),
  nextExpectedDate: date("next_expected_date", { mode: "string" }).notNull(),
  status: subscriptionStatusEnum("status").notNull().default("active"),
}, (table) => [index("subscriptions_user_id_idx").on(table.userId)]);

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  month: date("month", { mode: "string" }).notNull(),
  targetAmount: bigint("target_amount", { mode: "bigint" }).notNull(),
}, (table) => [uniqueIndex("budgets_user_category_month_unique").on(table.userId, table.categoryId, table.month)]);

export const insightSnapshots = pgTable("insight_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period: date("period", { mode: "string" }).notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload").notNull(),
}, (table) => [uniqueIndex("insight_snapshots_user_period_unique").on(table.userId, table.period)]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("api_keys_user_provider_unique").on(table.userId, table.provider)]);

export const plaidItems = pgTable("plaid_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  institutionId: text("institution_id").notNull(),
  status: text("status").notNull(),
}, (table) => [index("plaid_items_user_id_idx").on(table.userId)]);
