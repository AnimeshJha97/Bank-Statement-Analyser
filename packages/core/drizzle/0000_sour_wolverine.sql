CREATE TYPE "public"."account_source" AS ENUM('manual', 'plaid');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'credit', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."cache_scope" AS ENUM('global', 'user');--> statement-breakpoint
CREATE TYPE "public"."cache_source" AS ENUM('default', 'llm', 'user', 'crowd');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('cache', 'llm', 'user');--> statement-breakpoint
CREATE TYPE "public"."file_type" AS ENUM('csv', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_cadence" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'lapsed', 'cancelled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"institution_name" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"source" "account_source" DEFAULT 'manual' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"target_amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"parent_category_id" uuid,
	"color" text NOT NULL,
	"icon" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_category_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_merchant" text NOT NULL,
	"category_id" uuid NOT NULL,
	"scope" "cache_scope" NOT NULL,
	"user_id" uuid,
	"confidence" numeric(5, 4) NOT NULL,
	"source" "cache_source" NOT NULL,
	CONSTRAINT "merchant_cache_confidence_check" CHECK ("merchant_category_cache"."confidence" >= 0 and "merchant_category_cache"."confidence" <= 1),
	CONSTRAINT "merchant_cache_scope_user_check" CHECK (("merchant_category_cache"."scope" = 'global' and "merchant_category_cache"."user_id" is null) or ("merchant_category_cache"."scope" = 'user' and "merchant_category_cache"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"institution_id" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_filename" text NOT NULL,
	"file_type" "file_type" NOT NULL,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"parser_profile_used" text,
	"needs_review" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_normalized" text NOT NULL,
	"display_name" text NOT NULL,
	"amount_estimate" bigint NOT NULL,
	"cadence" "subscription_cadence" NOT NULL,
	"first_seen_date" date NOT NULL,
	"last_charge_date" date NOT NULL,
	"next_expected_date" date NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"date" date NOT NULL,
	"raw_description" text NOT NULL,
	"merchant_normalized" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint,
	"category_id" uuid,
	"category_confidence" numeric(5, 4),
	"category_source" "category_source",
	"is_subscription_candidate" boolean DEFAULT false NOT NULL,
	"dedupe_hash" text NOT NULL,
	CONSTRAINT "transactions_category_confidence_check" CHECK ("transactions"."category_confidence" is null or ("transactions"."category_confidence" >= 0 and "transactions"."category_confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_snapshots" ADD CONSTRAINT "insight_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_category_cache" ADD CONSTRAINT "merchant_category_cache_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_category_cache" ADD CONSTRAINT "merchant_category_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_user_provider_unique" ON "api_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_category_month_unique" ON "budgets" USING btree ("user_id","category_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_system_name_unique" ON "categories" USING btree ("name") WHERE "categories"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_unique" ON "categories" USING btree ("user_id","name") WHERE "categories"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_snapshots_user_period_unique" ON "insight_snapshots" USING btree ("user_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cache_global_unique" ON "merchant_category_cache" USING btree ("normalized_merchant") WHERE "merchant_category_cache"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cache_user_unique" ON "merchant_category_cache" USING btree ("user_id","normalized_merchant") WHERE "merchant_category_cache"."scope" = 'user';--> statement-breakpoint
CREATE INDEX "merchant_cache_category_id_idx" ON "merchant_category_cache" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "plaid_items_user_id_idx" ON "plaid_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "statements_account_id_idx" ON "statements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_dedupe_unique" ON "transactions" USING btree ("account_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "transactions_statement_id_idx" ON "transactions" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "transactions_category_id_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));