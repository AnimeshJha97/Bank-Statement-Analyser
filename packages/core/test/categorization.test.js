import assert from "node:assert/strict";
import { test } from "node:test";
import { CategorizationEngine, normalizeMerchant, OpenAIMerchantCategorizer } from "../dist/index.js";

class MemoryCache {
  global = new Map();
  users = new Map();
  async find(userId, merchants) {
    const result = new Map();
    const user = this.users.get(userId) ?? new Map();
    for (const merchant of merchants) {
      const hit = user.get(merchant) ?? this.global.get(merchant);
      if (hit) result.set(merchant, hit);
    }
    return result;
  }
  async saveLlm(results) {
    for (const result of results) this.global.set(result.normalizedMerchant, { ...result, scope: "global", source: "llm" });
  }
  async saveUserCorrection(userId, result) {
    const user = this.users.get(userId) ?? new Map();
    user.set(result.normalizedMerchant, { ...result, scope: "user", source: "user" });
    this.users.set(userId, user);
  }
}

class FakeLlm {
  calls = [];
  async categorize(merchants) {
    this.calls.push([...merchants]);
    return merchants.map((normalizedMerchant) => ({ normalizedMerchant, category: "Dining", confidence: 0.91 }));
  }
}

test("normalizes common POS, network, store, and location noise deterministically", () => {
  assert.equal(normalizeMerchant("POS DEBIT SQ *Coffee House #4421 SF CA"), "COFFEE HOUSE");
  assert.equal(normalizeMerchant("TST* Noodle Bar STORE #88"), "NOODLE BAR");
  assert.equal(normalizeMerchant("VISA ACME MARKET 0042 SEATTLE WA"), "ACME MARKET");
});

test("repeat merchants on a second ingest use cache and make zero new LLM calls", async () => {
  const cache = new MemoryCache(); const llm = new FakeLlm(); const engine = new CategorizationEngine(cache, llm);
  const first = await engine.categorize("user-1", ["POS DEBIT SQ *Coffee House #4421 SF CA", "TST* Noodle Bar STORE #88"]);
  assert.equal(llm.calls.length, 1); assert.deepEqual(first.map((x) => x.source), ["llm", "llm"]);
  llm.calls.length = 0;
  const second = await engine.categorize("user-1", ["SQ *Coffee House #9999 SF CA", "TST* Noodle Bar STORE #22"]);
  assert.equal(llm.calls.length, 0); assert.deepEqual(second.map((x) => x.source), ["cache", "cache"]);
});

test("a user correction overrides the global cache going forward", async () => {
  const cache = new MemoryCache(); const llm = new FakeLlm(); const engine = new CategorizationEngine(cache, llm);
  await engine.categorize("user-1", ["POS DEBIT SQ *Corner Shop #1234 NY NY"]);
  await engine.correct("user-1", "SQ *Corner Shop #9999 NY NY", "Groceries");
  llm.calls.length = 0;
  const [corrected] = await engine.categorize("user-1", ["CORNER SHOP"]);
  assert.equal(llm.calls.length, 0); assert.equal(corrected.category, "Groceries"); assert.equal(corrected.source, "user");
  const [otherUser] = await engine.categorize("user-2", ["CORNER SHOP"]);
  assert.equal(otherUser.category, "Dining"); assert.equal(otherUser.source, "cache");
});

test("batches cache misses within the required 50-100 range", async () => {
  const cache = new MemoryCache(); const llm = new FakeLlm(); const engine = new CategorizationEngine(cache, llm, { batchSize: 50 });
  await engine.categorize("user-1", Array.from({ length: 101 }, (_, i) => `Merchant ${i}`));
  assert.deepEqual(llm.calls.map((call) => call.length), [50, 50, 1]);
});

test("OpenAI adapter sends a strict fixed-taxonomy schema and low-confidence instruction", async () => {
  let request;
  const categorizer = new OpenAIMerchantCategorizer({ apiKey: "test-key", fetch: async (_url, init) => {
    request = JSON.parse(init.body);
    return new Response(JSON.stringify({ output_text: JSON.stringify({ results: [
      { normalizedMerchant: "UNKNOWN MERCHANT", category: "Other", confidence: 0.2 },
    ] }) }));
  } });
  const results = await categorizer.categorize(["UNKNOWN MERCHANT"]);
  assert.equal(results[0].category, "Other");
  assert.match(request.instructions, /Prefer Other over a low-confidence guess/);
  assert.equal(request.text.format.strict, true);
  assert.ok(request.text.format.schema.properties.results.items.properties.category.enum.includes("Rent/Mortgage"));
});
