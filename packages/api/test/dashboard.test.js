import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp, DashboardError, displayMerchant } from "../dist/index.js";

class NoopStatementRepository {
  async createStatement() { return "00000000-0000-4000-8000-000000000001"; }
  async completeStatement() { return 0; }
  async failStatement() {}
}

const userId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const categoryId = "30000000-0000-4000-8000-000000000001";
const transactionId = "40000000-0000-4000-8000-000000000001";

function memoryDashboard() {
  const transaction = {
    id: transactionId, date: "2026-07-01", description: "SQ *COFFEE SHOP 4421 SEATTLE WA",
    merchant: "Coffee Shop", amountCents: -450, balanceAfterCents: null,
    accountId, accountName: "Checking", statementId: "50000000-0000-4000-8000-000000000001",
    categoryId: null, categoryName: null, categoryColor: null,
    categoryConfidence: null, categorySource: null,
    isSubscriptionCandidate: false, needsReview: true, reviewReason: "uncategorized",
  };
  return {
    calls: [],
    async ensureUser(preferred) { this.calls.push(["ensureUser", preferred]); return { userId: preferred ?? userId, email: "owner@statement.local" }; },
    async listAccounts(owner) { this.calls.push(["listAccounts", owner]); return [{ id: accountId, name: "Checking", institutionName: "Chase", accountType: "checking", source: "manual", currency: "USD" }]; },
    async createAccount(owner, input) {
      if (!input.name.trim()) throw new DashboardError("name and institutionName are required", 400);
      return { id: accountId, ...input, source: "manual", currency: "USD" };
    },
    async listCategories() { return [{ id: categoryId, name: "Dining", color: "#F97316", icon: "utensils", isSystem: true }]; },
    async listTransactions(owner, query) { this.calls.push(["listTransactions", owner, query]); return { transactions: [transaction], nextCursor: null }; },
    async correctTransaction(owner, id, category) {
      if (id !== transactionId) throw new DashboardError("transaction not found", 404);
      return { ...transaction, categoryId: category, categoryName: "Dining", categorySource: "user", categoryConfidence: 1, needsReview: false, reviewReason: null };
    },
    async confirmTransaction(owner, id) {
      if (id !== transactionId) throw new DashboardError("transaction not found", 404);
      return { ...transaction, needsReview: false, reviewReason: null };
    },
    async listSubscriptions() {
      return [{ id: "60000000-0000-4000-8000-000000000001", displayName: "Netflix", merchantNormalized: "NETFLIX.COM", amountEstimateCents: 1549, cadence: "monthly", status: "active", firstSeenDate: "2026-01-03", lastChargeDate: "2026-07-03", nextExpectedDate: "2026-08-02" }];
    },
    async getStatement(owner, id) { return id === "50000000-0000-4000-8000-000000000001" ? { statementId: id, sourceFilename: "june.csv", fileType: "csv", uploadedAt: "2026-07-01T00:00:00.000Z", parseStatus: "completed", parserProfileUsed: "csv:utf-8:,", needsReview: false, reviewRowIndices: [], transactionCount: 3 } : null; },
  };
}

function appWith(dashboard) {
  return buildApp(new NoopStatementRepository(), undefined, dashboard);
}

test("GET /api/me bootstraps a user and honors a preferred id", async () => {
  const dashboard = memoryDashboard();
  const app = appWith(dashboard);
  const anonymous = await app.inject({ method: "GET", url: "/api/me" });
  assert.equal(anonymous.statusCode, 200);
  assert.equal(anonymous.json().userId, userId);
  const preferred = await app.inject({ method: "GET", url: "/api/me", headers: { "x-user-id": accountId } });
  assert.equal(preferred.json().userId, accountId);
  await app.close();
});

test("dashboard routes require x-user-id", async () => {
  const app = appWith(memoryDashboard());
  for (const url of ["/api/accounts", "/api/categories", "/api/transactions", "/api/subscriptions"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 401, url);
  }
  await app.close();
});

test("GET /api/transactions forwards filters and returns rows", async () => {
  const dashboard = memoryDashboard();
  const app = appWith(dashboard);
  const response = await app.inject({
    method: "GET",
    url: `/api/transactions?accountId=${accountId}&needsReview=true&from=2026-07-01&to=2026-07-31&limit=50`,
    headers: { "x-user-id": userId },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().transactions.length, 1);
  const [, owner, query] = dashboard.calls.find(([name]) => name === "listTransactions");
  assert.equal(owner, userId);
  assert.deepEqual(query, { accountId, categoryId: undefined, from: "2026-07-01", to: "2026-07-31", needsReview: true, limit: 50, cursor: undefined });
  await app.close();
});

test("PATCH /api/transactions/:id corrects the category and maps DashboardError statuses", async () => {
  const app = appWith(memoryDashboard());
  const missingBody = await app.inject({ method: "PATCH", url: `/api/transactions/${transactionId}`, headers: { "x-user-id": userId }, payload: {} });
  assert.equal(missingBody.statusCode, 400);
  const corrected = await app.inject({ method: "PATCH", url: `/api/transactions/${transactionId}`, headers: { "x-user-id": userId }, payload: { categoryId } });
  assert.equal(corrected.statusCode, 200);
  assert.equal(corrected.json().categorySource, "user");
  assert.equal(corrected.json().needsReview, false);
  const missing = await app.inject({ method: "PATCH", url: "/api/transactions/40000000-0000-4000-8000-00000000dead", headers: { "x-user-id": userId }, payload: { categoryId } });
  assert.equal(missing.statusCode, 404);
  await app.close();
});

test("POST /api/transactions/:id/confirm clears the review flag", async () => {
  const app = appWith(memoryDashboard());
  const response = await app.inject({ method: "POST", url: `/api/transactions/${transactionId}/confirm`, headers: { "x-user-id": userId } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().reviewReason, null);
  await app.close();
});

test("accounts, categories, subscriptions, and statement lookup round-trip", async () => {
  const app = appWith(memoryDashboard());
  const headers = { "x-user-id": userId };
  const created = await app.inject({ method: "POST", url: "/api/accounts", headers, payload: { name: "Checking", institutionName: "Chase", accountType: "checking" } });
  assert.equal(created.statusCode, 201);
  const invalid = await app.inject({ method: "POST", url: "/api/accounts", headers, payload: { name: " " } });
  assert.equal(invalid.statusCode, 400);
  const categories = await app.inject({ method: "GET", url: "/api/categories", headers });
  assert.equal(categories.json().categories[0].name, "Dining");
  const subscriptions = await app.inject({ method: "GET", url: "/api/subscriptions", headers });
  assert.equal(subscriptions.json().subscriptions[0].displayName, "Netflix");
  const statement = await app.inject({ method: "GET", url: "/api/statements/50000000-0000-4000-8000-000000000001", headers });
  assert.equal(statement.json().transactionCount, 3);
  const missing = await app.inject({ method: "GET", url: "/api/statements/50000000-0000-4000-8000-00000000dead", headers });
  assert.equal(missing.statusCode, 404);
  await app.close();
});

test("displayMerchant strips POS noise and title-cases", () => {
  assert.equal(displayMerchant("SQ *CORNER BAKERY 042 GOSQ.COM"), "Corner Bakery 042 Gosq.Com");
  assert.equal(displayMerchant("NETFLIX.COM 866-579-7172"), "Netflix.Com 866-579-7172");
  assert.equal(displayMerchant("WHOLEFDS #10245 SEATTLE WA"), "Wholefds");
});
