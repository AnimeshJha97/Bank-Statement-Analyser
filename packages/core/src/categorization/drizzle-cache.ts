import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { createDatabase } from "../db/client.js";
import { categories, merchantCategoryCache } from "../db/schema.js";
import type { CachedCategory, CategoryCache, CategoryName, LlmCategory } from "./types.js";

type Database = ReturnType<typeof createDatabase>["db"];

export class DrizzleCategoryCache implements CategoryCache {
  constructor(private readonly db: Database) {}

  async find(userId: string, normalizedMerchants: readonly string[]): Promise<Map<string, CachedCategory>> {
    if (normalizedMerchants.length === 0) return new Map();
    const rows = await this.db.select({
      normalizedMerchant: merchantCategoryCache.normalizedMerchant,
      category: categories.name,
      confidence: merchantCategoryCache.confidence,
      source: merchantCategoryCache.source,
      scope: merchantCategoryCache.scope,
    }).from(merchantCategoryCache)
      .innerJoin(categories, eq(categories.id, merchantCategoryCache.categoryId))
      .where(and(
        inArray(merchantCategoryCache.normalizedMerchant, [...normalizedMerchants]),
        or(
          eq(merchantCategoryCache.scope, "global"),
          and(eq(merchantCategoryCache.scope, "user"), eq(merchantCategoryCache.userId, userId)),
        ),
      ));

    const found = new Map<string, CachedCategory>();
    // Global rows are deliberately installed first; a user row always replaces them.
    for (const row of rows.sort((a, b) => a.scope === b.scope ? 0 : a.scope === "global" ? -1 : 1)) {
      found.set(row.normalizedMerchant, {
        ...row,
        category: row.category as CategoryName,
        confidence: Number(row.confidence),
      });
    }
    return found;
  }

  async saveLlm(results: readonly LlmCategory[]): Promise<void> {
    if (results.length === 0) return;
    const categoryRows = await this.categoryIds(results.map(({ category }) => category));
    await this.db.insert(merchantCategoryCache).values(results.map((result) => ({
      normalizedMerchant: result.normalizedMerchant,
      categoryId: this.requireCategoryId(categoryRows, result.category),
      scope: "global" as const,
      userId: null,
      confidence: String(result.confidence),
      source: "llm" as const,
    }))).onConflictDoNothing({
      target: merchantCategoryCache.normalizedMerchant,
      where: eq(merchantCategoryCache.scope, "global"),
    });
  }

  async saveUserCorrection(userId: string, result: LlmCategory): Promise<void> {
    const categoryRows = await this.categoryIds([result.category]);
    await this.db.insert(merchantCategoryCache).values({
      normalizedMerchant: result.normalizedMerchant,
      categoryId: this.requireCategoryId(categoryRows, result.category),
      scope: "user",
      userId,
      confidence: String(result.confidence),
      source: "user",
    }).onConflictDoUpdate({
      target: [merchantCategoryCache.userId, merchantCategoryCache.normalizedMerchant],
      targetWhere: eq(merchantCategoryCache.scope, "user"),
      set: { categoryId: this.requireCategoryId(categoryRows, result.category), confidence: String(result.confidence), source: "user" },
    });
  }

  private async categoryIds(names: readonly CategoryName[]): Promise<Map<string, string>> {
    const rows = await this.db.select({ id: categories.id, name: categories.name }).from(categories)
      .where(and(inArray(categories.name, [...new Set(names)]), isNull(categories.userId)));
    return new Map(rows.map((row) => [row.name, row.id]));
  }

  private requireCategoryId(ids: Map<string, string>, name: CategoryName): string {
    const id = ids.get(name);
    if (!id) throw new Error(`System category is not seeded: ${name}`);
    return id;
  }
}
