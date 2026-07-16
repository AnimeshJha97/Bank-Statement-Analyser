import type { SubscriptionDisplayNamer } from "./types.js";

export interface OpenAISubscriptionNamerOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class OpenAISubscriptionNamer implements SubscriptionDisplayNamer {
  readonly #fetch: typeof globalThis.fetch;
  readonly #model: string;
  readonly #baseUrl: string;

  constructor(private readonly options: OpenAISubscriptionNamerOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#model = options.model ?? "gpt-4.1-mini";
    this.#baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async name(normalizedMerchant: string): Promise<string> {
    const response = await this.#fetch(`${this.#baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.#model,
        instructions: "Return a concise, consumer-friendly subscription display name for this normalized statement merchant. Do not add commentary or infer a different company.",
        input: normalizedMerchant,
        text: { format: { type: "json_schema", name: "subscription_name", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["displayName"], properties: {
            displayName: { type: "string", minLength: 1, maxLength: 80 },
          },
        } } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI subscription naming failed (${response.status}): ${await response.text()}`);
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
    if (!text) throw new Error("OpenAI response did not contain structured output text");
    const displayName = (JSON.parse(text) as { displayName?: unknown }).displayName;
    if (typeof displayName !== "string" || !displayName.trim()) throw new Error("OpenAI structured output did not contain a display name");
    return displayName.trim();
  }
}

