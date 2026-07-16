# Statement — API Reference

Base URL: `http://localhost:3001/api` (the Next.js dashboard on `:3000` proxies `/api/*` here, so the browser stays same-origin).

Start the server: `npm run dev --workspace=@statement/api` (requires `DATABASE_URL`; `OPENAI_API_KEY` is optional — without it, cache misses stay uncategorized and surface in the review queue instead of being sent to an LLM).

**Auth (OSS v1, pre-Sprint 9):** every endpoint except `GET /api/me` requires an `x-user-id` header. Session auth replaces this in Sprint 9.

---

## Bootstrap

### `GET /api/me`
Returns the self-hosted user, creating a default one on first call. Honors an optional `x-user-id` header if that user exists; otherwise falls back to the first (single) user.

```json
{ "userId": "aa01f4ba-…", "email": "owner@statement.local" }
```

---

## Accounts

### `GET /api/accounts`
```json
{ "accounts": [ { "id": "…", "name": "Chase Checking", "institutionName": "Chase", "accountType": "checking", "source": "manual", "currency": "USD" } ] }
```

### `POST /api/accounts`
```json
{ "name": "Chase Checking", "institutionName": "Chase", "accountType": "checking" }
```
Returns `201` with the created account. `accountType`: `checking | savings | credit | cash | other`.

---

## Statements

### `POST /api/statements`
Upload a bank/credit-card statement for parsing. Parsing is synchronous; the response carries the final result. After persistence, still-uncategorized transactions are categorized best-effort (merchant cache always; LLM only when `OPENAI_API_KEY` is set — a categorization failure never fails the ingest).

**Request:** `multipart/form-data`
| field | type | notes |
|---|---|---|
| `file` | file | PDF or CSV, ≤ 20 MB |
| `accountId` | string | target account |

**Response `202`**
```json
{
  "statementId": "…",
  "parseStatus": "completed",
  "needsReview": false,
  "reviewRowIndices": [],
  "transactionCount": 24,
  "categorizedCount": 18,
  "parserProfileUsed": "csv:utf-8:,"
}
```
Unparseable files return `422` with `parseStatus: "failed"` and an `error` message. `reviewRowIndices` are the source rows that broke balance-chain validation; each is also persisted on its transaction (`source_row_index`) so the review queue can target exact rows.

### `GET /api/statements/:id`
```json
{
  "statementId": "…",
  "sourceFilename": "june.csv",
  "fileType": "csv",
  "uploadedAt": "2026-07-17T00:00:00.000Z",
  "parseStatus": "completed",
  "parserProfileUsed": "csv:utf-8:,",
  "needsReview": true,
  "reviewRowIndices": [2],
  "transactionCount": 24
}
```

---

## Transactions

### `GET /api/transactions`
Query params: `accountId`, `categoryId` (a category id or the literal `uncategorized`), `from`, `to` (inclusive ISO dates), `needsReview` (bool), `limit` (default 200, max 500), `cursor` (from a prior response).

```json
{
  "transactions": [
    {
      "id": "…",
      "date": "2026-07-08",
      "description": "WHOLEFDS #10245 SEATTLE WA",
      "merchant": "Wholefds",
      "amountCents": -8427,
      "balanceAfterCents": 1332804,
      "accountId": "…",
      "accountName": "Chase Checking",
      "statementId": "…",
      "categoryId": "…",
      "categoryName": "Groceries",
      "categoryColor": "#00734b",
      "categoryConfidence": 1,
      "categorySource": "user",
      "isSubscriptionCandidate": false,
      "needsReview": false,
      "reviewReason": null
    }
  ],
  "nextCursor": null
}
```
A transaction `needsReview` when any of these hold, with `reviewReason` reporting the highest-priority one:
- `validation` — its statement failed balance-chain validation at this row
- `uncategorized` — no category assigned (e.g. cache miss with no LLM key)
- `low-confidence` — categorization confidence below 0.7 and not user-set

### `PATCH /api/transactions/:id`
Correct the category. Sets `categorySource: "user"`, `categoryConfidence: 1`, writes back to `merchant_category_cache` at `user` scope (system categories only), and clears the row's validation flag — future ingests of the same merchant categorize from the cache with zero LLM calls.

```json
{ "categoryId": "…" }
```
Returns the updated transaction.

### `POST /api/transactions/:id/confirm`
Accepts the current suggestion: pins the existing category at user scope (when one exists) and clears the row's validation flag. Returns the updated transaction; an uncategorized row stays in the queue until a category is picked.

---

## Categories

### `GET /api/categories`
System defaults plus user-created categories.
```json
{ "categories": [ { "id": "…", "name": "Groceries", "color": "#00734b", "icon": "shopping-basket", "isSystem": true } ] }
```

---

## Subscriptions

### `GET /api/subscriptions`
Recomputes recurring-charge detection from the user's transaction history on read (deterministic cadence/amount clustering; display names via one LLM call per group when a key is configured, deterministic title-casing otherwise) and syncs the `subscriptions` table.

```json
{
  "subscriptions": [
    {
      "id": "…",
      "displayName": "Netflix",
      "merchantNormalized": "NETFLIX.COM 866-579-7172",
      "amountEstimateCents": 1549,
      "cadence": "monthly",
      "status": "active",
      "firstSeenDate": "2026-05-03",
      "lastChargeDate": "2026-07-03",
      "nextExpectedDate": "2026-08-02"
    }
  ]
}
```
`status`: `active | lapsed | cancelled`.

---

## Insights

### `GET /api/insights/monthly?period=2026-07`
Returns the cached `insight_snapshot`, computing and caching it on a miss.

### `POST /api/insights/monthly/refresh?period=2026-07`
Forces a recompute (e.g. after an upload).

```json
{
  "period": "2026-07",
  "totalSpendCents": 37331,
  "priorMonthTotalSpendCents": 60324,
  "trendVsPriorMonth": -0.381,
  "byCategory": [
    { "categoryId": "…", "categoryName": "Groceries", "amountCents": 12637, "priorMonthAmountCents": 7103, "trendVsPriorMonth": 0.779 }
  ],
  "topMerchants": [ { "merchant": "wholefds 10245 seattle wa", "amountCents": 12637 } ]
}
```

---

## Budgets

### `GET /api/budgets?month=2026-07`
### `PUT /api/budgets`
```json
{ "categoryId": "…", "month": "2026-07", "targetAmountCents": 30000 }
```
Response includes `actualAmountCents` and `percentUsed` computed from the same month's transactions.
### `DELETE /api/budgets?categoryId=…&month=2026-07`
Returns `204`, or `404` if no such budget.

---

## Hosted-only endpoints
Gated behind `capabilities.bankSync` / `capabilities.billing` — return `404` on self-hosted deployments rather than `403`, so as not to leak which features exist on a build that doesn't have them compiled in.

- `POST /api/plaid/link-token`
- `POST /api/plaid/exchange`
- `POST /api/billing/checkout-session`
- `POST /api/billing/webhook`

Full request/response contracts for these will be documented alongside Sprint 10 implementation.
