# Statement — API Reference

Base URL: `http://localhost:3000/api` (self-hosted) or your hosted deployment's domain.

Auth: session cookie (email/password auth) for OSS v1. All endpoints below require an authenticated session unless noted.

---

## Statements

### `POST /api/statements`
Upload a bank/credit-card statement for parsing.

**Request:** `multipart/form-data`
| field | type | notes |
|---|---|---|
| `file` | file | PDF or CSV |
| `accountId` | string | target account |

**Response `202 Accepted`**
```json
{
  "statementId": "stmt_01H...",
  "parseStatus": "processing"
}
```

### `GET /api/statements/:id`
```json
{
  "statementId": "stmt_01H...",
  "parseStatus": "complete",
  "needsReview": false,
  "transactionCount": 47,
  "parserProfileUsed": "chase-checking-v1"
}
```
`parseStatus`: `processing | complete | failed`. `needsReview: true` indicates balance-chain validation failed or OCR-derived rows exist — check `/api/statements/:id/review`.

### `GET /api/statements/:id/review`
Returns flagged rows needing manual confirmation (validation failures, low-confidence OCR).

---

## Transactions

### `GET /api/transactions`
Query params: `accountId`, `from`, `to`, `categoryId`, `needsReview` (bool).

```json
{
  "transactions": [
    {
      "id": "txn_01H...",
      "date": "2026-06-14",
      "description": "SQ *COFFEE SHOP 4421 SF CA",
      "merchantNormalized": "Coffee Shop",
      "amountCents": -450,
      "categoryId": "cat_dining",
      "categoryConfidence": 0.92,
      "categorySource": "cache",
      "isSubscriptionCandidate": false
    }
  ],
  "nextCursor": null
}
```

### `PATCH /api/transactions/:id`
Correct a category. Writes back to `merchant_category_cache` at `user` scope immediately.

**Request**
```json
{ "categoryId": "cat_groceries" }
```

---

## Categories

### `GET /api/categories`
Returns system defaults + any user-created custom categories.

### `POST /api/categories`
```json
{ "name": "Pet Care", "parentCategoryId": null, "color": "#..." }
```

---

## Subscriptions

### `GET /api/subscriptions`
```json
{
  "subscriptions": [
    {
      "id": "sub_01H...",
      "displayName": "Netflix",
      "amountEstimateCents": 1549,
      "cadence": "monthly",
      "status": "active",
      "nextExpectedDate": "2026-08-01",
      "lastChargeDate": "2026-07-01"
    }
  ]
}
```
`status`: `active | lapsed | cancelled`.

---

## Insights

### `GET /api/insights/monthly?period=2026-06`
Returns a cached `insight_snapshot`. If none exists for the requested period, triggers recompute and returns `202` with a polling location.

```json
{
  "period": "2026-06",
  "totalSpendCents": 284300,
  "byCategory": [
    { "categoryId": "cat_dining", "amountCents": 45200, "trendVsPriorMonth": 0.08 }
  ],
  "topMerchants": [
    { "merchant": "Whole Foods", "amountCents": 61200 }
  ]
}
```

---

## Budgets

### `GET /api/budgets?month=2026-06`
### `PUT /api/budgets`
```json
{ "categoryId": "cat_dining", "month": "2026-06", "targetAmountCents": 40000 }
```
Response includes `actualAmountCents` computed from the same month's transactions.

---

## Settings (self-hosted)

### `PUT /api/settings/api-key`
Stores the user's OpenAI key, encrypted at rest. Never returned in any subsequent `GET`.
```json
{ "provider": "openai", "apiKey": "sk-..." }
```

---

## Hosted-only endpoints
Gated behind `capabilities.bankSync` / `capabilities.billing` — return `404` on self-hosted deployments rather than `403`, so as not to leak which features exist on a build that doesn't have them compiled in.

- `POST /api/plaid/link-token`
- `POST /api/plaid/exchange`
- `POST /api/billing/checkout-session`
- `POST /api/billing/webhook`

Full request/response contracts for these will be documented alongside Sprint 10 implementation.
