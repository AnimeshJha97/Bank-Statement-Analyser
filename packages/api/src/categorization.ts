import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  CategorizationEngine,
  DrizzleCategoryCache,
  OpenAIMerchantCategorizer,
  accounts,
  categories,
  normalizeMerchant,
  transactions,
  type CategoryResult,
  type createDatabase,
} from "@statement/core";

export interface StatementCategorizer {
  /** Categorizes a statement's still-uncategorized transactions. Returns the number updated. */
  categorizeStatement(accountId: string, statementId: string): Promise<number>;
}

type Database = ReturnType<typeof createDatabase>["db"];

export interface StatementCategorizerOptions {
  openaiApiKey?: string | undefined;
}

/**
 * Cache hits (user scope over global) always apply. Misses go to the LLM only when an
 * OpenAI key is configured; without one they stay uncategorized and surface in the
 * needs-review queue instead of being cached as a permanent low-confidence guess.
 */
export function createDrizzleStatementCategorizer(db: Database, options: StatementCategorizerOptions = {}): StatementCategorizer {
  const cache = new DrizzleCategoryCache(db);
  return {
    async categorizeStatement(accountId, statementId) {
      const [account] = await db.select({ userId: accounts.userId }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
      if (!account) return 0;
      const rows = await db.select({ id: transactions.id, rawDescription: transactions.rawDescription })
        .from(transactions)
        .where(and(eq(transactions.statementId, statementId), isNull(transactions.categoryId)));
      if (rows.length === 0) return 0;

      let resultForRow: (index: number) => CategoryResult | undefined;
      if (options.openaiApiKey) {
        const engine = new CategorizationEngine(cache, new OpenAIMerchantCategorizer({ apiKey: options.openaiApiKey }));
        const results = await engine.categorize(account.userId, rows.map((row) => row.rawDescription));
        resultForRow = (index) => results[index];
      } else {
        const keys = rows.map((row) => normalizeMerchant(row.rawDescription));
        const found = await cache.find(account.userId, [...new Set(keys.filter(Boolean))]);
        resultForRow = (index) => {
          const hit = found.get(keys[index]!);
          if (!hit) return undefined;
          return {
            normalizedMerchant: hit.normalizedMerchant,
            category: hit.category,
            confidence: hit.confidence,
            source: hit.scope === "user" ? "user" : "cache",
          };
        };
      }

      const systemCategories = await db.select({ id: categories.id, name: categories.name })
        .from(categories).where(isNull(categories.userId));
      const categoryIdByName = new Map(systemCategories.map((category) => [category.name, category.id]));

      const groups = new Map<string, { categoryId: string; confidence: number; source: CategoryResult["source"]; ids: string[] }>();
      rows.forEach((row, index) => {
        const result = resultForRow(index);
        if (!result) return;
        const categoryId = categoryIdByName.get(result.category);
        if (!categoryId) return;
        const key = `${categoryId}|${result.confidence}|${result.source}`;
        const group = groups.get(key) ?? { categoryId, confidence: result.confidence, source: result.source, ids: [] };
        group.ids.push(row.id);
        groups.set(key, group);
      });

      let updated = 0;
      for (const group of groups.values()) {
        await db.update(transactions)
          .set({ categoryId: group.categoryId, categoryConfidence: String(group.confidence), categorySource: group.source })
          .where(inArray(transactions.id, group.ids));
        updated += group.ids.length;
      }
      return updated;
    },
  };
}
