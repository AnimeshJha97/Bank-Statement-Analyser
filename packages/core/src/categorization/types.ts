import { defaultCategoryTaxonomy } from "../db/taxonomy.js";

export type CategoryName = (typeof defaultCategoryTaxonomy)[number]["name"];
export type CategorySource = "cache" | "llm" | "user";

export interface CategoryResult {
  normalizedMerchant: string;
  category: CategoryName;
  confidence: number;
  source: CategorySource;
}

export interface CachedCategory {
  normalizedMerchant: string;
  category: CategoryName;
  confidence: number;
  source: "default" | "llm" | "user" | "crowd";
  scope: "global" | "user";
}

export interface CategoryCache {
  find(userId: string, normalizedMerchants: readonly string[]): Promise<Map<string, CachedCategory>>;
  saveLlm(results: readonly LlmCategory[]): Promise<void>;
  saveUserCorrection(userId: string, result: LlmCategory): Promise<void>;
}

export interface LlmCategory {
  normalizedMerchant: string;
  category: CategoryName;
  confidence: number;
}

export interface MerchantCategorizer {
  categorize(normalizedMerchants: readonly string[]): Promise<LlmCategory[]>;
}
