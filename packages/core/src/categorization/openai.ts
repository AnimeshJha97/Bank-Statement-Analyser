import { defaultCategoryTaxonomy } from "../db/taxonomy.js";
import type { CategoryName, LlmCategory, MerchantCategorizer } from "./types.js";

const taxonomy = defaultCategoryTaxonomy.map(({ name }) => name);

export interface OpenAICategorizerOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class OpenAIMerchantCategorizer implements MerchantCategorizer {
  readonly #fetch: typeof globalThis.fetch;
  readonly #model: string;
  readonly #baseUrl: string;

  constructor(private readonly options: OpenAICategorizerOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#model = options.model ?? "gpt-4.1-mini";
    this.#baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async categorize(normalizedMerchants: readonly string[]): Promise<LlmCategory[]> {
    if (normalizedMerchants.length === 0) return [];
    const response = await this.#fetch(`${this.#baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.#model,
        instructions: `Categorize each normalized merchant using only this taxonomy: ${taxonomy.join(", ")}. Return exactly one result per input merchant, preserving each merchant string exactly. Prefer Other over a low-confidence guess. Confidence must be between 0 and 1.`,
        input: JSON.stringify(normalizedMerchants),
        text: { format: { type: "json_schema", name: "merchant_categories", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["results"], properties: {
            results: { type: "array", minItems: normalizedMerchants.length, maxItems: normalizedMerchants.length, items: {
              type: "object", additionalProperties: false, required: ["normalizedMerchant", "category", "confidence"], properties: {
                normalizedMerchant: { type: "string", enum: [...normalizedMerchants] },
                category: { type: "string", enum: taxonomy },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            } },
          },
        } } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI categorization failed (${response.status}): ${await response.text()}`);
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
    if (!text) throw new Error("OpenAI response did not contain structured output text");
    const parsed = JSON.parse(text) as { results?: Array<{ normalizedMerchant: string; category: string; confidence: number }> };
    if (!Array.isArray(parsed.results)) throw new Error("OpenAI structured output did not contain results");
    return parsed.results.map((result) => ({ ...result, category: result.category as CategoryName }));
  }
}
