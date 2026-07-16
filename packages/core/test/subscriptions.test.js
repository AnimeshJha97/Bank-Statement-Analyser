import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenAISubscriptionNamer, SubscriptionDetector } from "../dist/index.js";
import { recurringTransactionHistory } from "./fixtures/recurring-transactions.js";

class FakeNamer {
  calls = [];
  async name(merchant) {
    this.calls.push(merchant);
    return new Map([
      ["STREAMFLIX.COM", "Streamflix"],
      ["ACME CLOUD ANNUAL", "Acme Cloud"],
      ["OLD FITNESS CLUB", "Old Fitness Club"],
    ]).get(merchant) ?? merchant;
  }
}

async function detectFixture() {
  const namer = new FakeNamer();
  const subscriptions = await new SubscriptionDetector(namer).detect(recurringTransactionHistory, { asOf: "2025-07-01" });
  return { namer, subscriptions, byMerchant: new Map(subscriptions.map((item) => [item.merchantNormalized, item])) };
}

test("detects a genuine monthly subscription within the amount tolerance band", async () => {
  const { byMerchant } = await detectFixture();
  const subscription = byMerchant.get("STREAMFLIX.COM");
  assert.ok(subscription);
  assert.equal(subscription.cadence, "monthly");
  assert.equal(subscription.amountEstimate, -1612n);
  assert.equal(subscription.nextExpectedDate, "2025-07-15");
  assert.equal(subscription.status, "active");
  assert.equal(subscription.displayName, "Streamflix");
});

test("detects a genuine annual subscription across a leap year", async () => {
  const { byMerchant } = await detectFixture();
  const subscription = byMerchant.get("ACME CLOUD ANNUAL");
  assert.ok(subscription);
  assert.equal(subscription.cadence, "yearly");
  assert.equal(subscription.nextExpectedDate, "2026-06-01");
  assert.equal(subscription.status, "active");
});

test("does not flag non-periodic repeat purchases", async () => {
  const { byMerchant } = await detectFixture();
  assert.equal(byMerchant.has("CORNER BOOK SHOP"), false);
});

test("marks a subscription lapsed after its expected charge tolerance passes", async () => {
  const { byMerchant } = await detectFixture();
  const subscription = byMerchant.get("OLD FITNESS CLUB");
  assert.ok(subscription);
  assert.equal(subscription.cadence, "monthly");
  assert.equal(subscription.nextExpectedDate, "2025-03-10");
  assert.equal(subscription.status, "lapsed");
});

test("makes exactly one naming call per confirmed group and none for repeat noise", async () => {
  const { namer, subscriptions } = await detectFixture();
  assert.equal(subscriptions.length, 3);
  assert.deepEqual(namer.calls.sort(), ["ACME CLOUD ANNUAL", "OLD FITNESS CLUB", "STREAMFLIX.COM"]);
});

test("requires at least two confirmed intervals", async () => {
  const namer = new FakeNamer();
  const result = await new SubscriptionDetector(namer).detect([
    { date: "2025-01-01", description: "TWO CHARGES", amount: -1000 },
    { date: "2025-01-31", description: "TWO CHARGES", amount: -1000 },
  ], { asOf: "2025-02-01" });
  assert.deepEqual(result, []);
  assert.deepEqual(namer.calls, []);
});

test("OpenAI namer uses one strict structured-output request", async () => {
  const requests = [];
  const namer = new OpenAISubscriptionNamer({ apiKey: "test-key", fetch: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ output_text: JSON.stringify({ displayName: "Streamflix" }) }));
  } });
  assert.equal(await namer.name("STREAMFLIX.COM"), "Streamflix");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input, "STREAMFLIX.COM");
  assert.equal(requests[0].text.format.strict, true);
});

