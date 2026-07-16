import { normalizeMerchant } from "./normalization.js";
import type { CategoryCache, CategoryResult, LlmCategory, MerchantCategorizer } from "./types.js";

export interface CategorizationEngineOptions {
  batchSize?: number;
}

export class CategorizationEngine {
  readonly #batchSize: number;

  constructor(
    private readonly cache: CategoryCache,
    private readonly llm: MerchantCategorizer,
    options: CategorizationEngineOptions = {},
  ) {
    this.#batchSize = options.batchSize ?? 75;
    if (this.#batchSize < 50 || this.#batchSize > 100) throw new RangeError("batchSize must be between 50 and 100");
  }

  async categorize(userId: string, descriptions: readonly string[]): Promise<CategoryResult[]> {
    const normalized = descriptions.map(normalizeMerchant);
    const unique = [...new Set(normalized.filter(Boolean))];
    const cached = await this.cache.find(userId, unique);
    const misses = unique.filter((merchant) => !cached.has(merchant));
    const learned = new Map<string, LlmCategory>();

    for (let offset = 0; offset < misses.length; offset += this.#batchSize) {
      const batch = misses.slice(offset, offset + this.#batchSize);
      const results = await this.llm.categorize(batch);
      this.#validateBatch(batch, results);
      await this.cache.saveLlm(results);
      for (const result of results) learned.set(result.normalizedMerchant, result);
    }

    return normalized.map((merchant) => {
      const hit = cached.get(merchant);
      if (hit) return {
        normalizedMerchant: merchant,
        category: hit.category,
        confidence: hit.confidence,
        source: hit.scope === "user" ? "user" : "cache",
      };
      const result = learned.get(merchant);
      if (!result) throw new Error(`No category returned for merchant: ${merchant}`);
      return { ...result, source: "llm" };
    });
  }

  async correct(userId: string, description: string, category: LlmCategory["category"], confidence = 1): Promise<void> {
    const normalizedMerchant = normalizeMerchant(description);
    if (!normalizedMerchant) throw new Error("Cannot correct an empty merchant");
    await this.cache.saveUserCorrection(userId, { normalizedMerchant, category, confidence });
  }

  #validateBatch(requested: readonly string[], results: readonly LlmCategory[]): void {
    if (results.length !== requested.length) throw new Error("Categorizer returned a different number of results than requested");
    const requestedSet = new Set(requested);
    const returned = new Set<string>();
    for (const result of results) {
      if (!requestedSet.has(result.normalizedMerchant) || returned.has(result.normalizedMerchant)) {
        throw new Error(`Categorizer returned an unexpected or duplicate merchant: ${result.normalizedMerchant}`);
      }
      if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
        throw new Error(`Invalid confidence for merchant: ${result.normalizedMerchant}`);
      }
      returned.add(result.normalizedMerchant);
    }
  }
}
