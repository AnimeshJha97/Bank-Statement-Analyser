# Statement — Architecture

Privacy-first personal finance insights from bank/credit-card statements.
Open-core: OSS self-hosted core (free, local-first) + Hosted tier (Plaid sync, PWA, multi-account, billing).

---

## 1. Design Goals

1. **Privacy is the product, not a feature.** Self-hosted mode never phones home. Parsing and categorization can run entirely with the user's own OpenAI key and their own database.
2. **Bank statements are messy.** The parsing layer has to survive wildly inconsistent PDF layouts and CSV exports without collapsing into brittle regex spaghetti.
3. **LLM calls cost money.** Categorization has to be batched, cached, and idempotent — never re-spend tokens on a merchant it has already learned.
4. **Open-core boundary is architectural, not cosmetic.** The line between free and paid is a code boundary decided on day one (see §2), not a licensing checkbox bolted on later.

---

## 2. Open-Core Boundary

Same pattern as Query Guardian: a single `capabilities.ts` module is the only place that knows which tier is active. Nothing else in the codebase branches on tier directly.

```
packages/
  core/          # shared types, parsing, categorization, insights engine (OSS)
  parsers/       # CSV + PDF + OCR parsing (OSS)
  api/           # Fastify/Next API routes (OSS core routes + hosted-only routes gated by capabilities.ts)
  web/           # Next.js/React dashboard + PWA shell
  hosted/        # Plaid client, Stripe billing, multi-account sync (paid only, dynamically imported)
```

`capabilities.ts` exposes a single object:

```ts
export const capabilities = {
  bankSync: env.DEPLOYMENT_MODE === "hosted",      // Plaid
  multiAccount: env.DEPLOYMENT_MODE === "hosted",
  cloudSync: env.DEPLOYMENT_MODE === "hosted",
  billing: env.DEPLOYMENT_MODE === "hosted",
};
```

- **OSS / self-hosted**: `DEPLOYMENT_MODE=self-hosted`. Manual PDF/CSV upload only. User's own OpenAI key stored encrypted in their own Postgres/SQLite. No outbound calls except to OpenAI.
- **Hosted**: `DEPLOYMENT_MODE=hosted`. Adds Plaid bank sync, multi-account, managed billing (Stripe), optional cloud sync (opt-in, explicit consent screen — this is the one place the privacy pitch has to be handled very carefully in copy and defaults: **default is off**).

The `hosted/` package is dynamically imported only when `capabilities.billing` etc. are true, so a self-hosted build never even bundles Plaid/Stripe SDKs.

---

## 3. Parsing Pipeline

Statements arrive as CSV or PDF. Both funnel into the same normalized `Transaction` shape before anything downstream (categorization, subscriptions, insights) touches them.

```
Upload → Format Detect → Extract → Bank Profile Match → Normalize → Dedupe → Validate → Persist
```

### 3.1 Format detection
File signature + extension. CSV vs PDF vs (future) OFX/QFX.

### 3.2 CSV extraction
- Delimiter/encoding sniffing (comma, semicolon, tab; UTF-8/UTF-16/Latin-1 — many bank exports are not UTF-8).
- Header row detection: banks don't agree on column names (`Description` vs `Memo` vs `Narrative`, `Amount` vs separate `Debit`/`Credit` columns). Use a scored heuristic matcher against a synonym dictionary per field (date, description, amount, debit, credit, balance), not a fixed column map.
- Date parsing with locale-aware fallback (`DD/MM/YYYY` vs `MM/DD/YYYY` — disambiguate using the *range* of days seen across the file, not the first row alone).

### 3.3 PDF extraction
- **Digital (text-layer) PDFs**: extract text with layout coordinates (not just a flat text dump), then reconstruct rows by clustering text fragments on the y-axis and mapping columns by x-position. This is the only reliable way to recover tabular data from bank PDFs, since naive text extraction interleaves columns.
- **Scanned/image PDFs**: OCR fallback (Tesseract, or a hosted OCR API on the paid tier for higher accuracy). Flag OCR-derived transactions with a lower confidence score and surface them in the UI for user review before they're categorized.
- **Bank profile system**: maintain a small library of per-bank layout profiles (header/footer patterns, column x-ranges, date format) keyed by a fingerprint extracted from the statement header (bank name/logo text, account number format). Unknown banks fall back to the generic heuristic extractor above. This profile library is itself an OSS contribution surface — exactly the kind of "fork-friendly" pattern from the GitHub growth playbook (users add their bank's profile via PR).

### 3.4 Normalization
All paths converge on:

```ts
type RawTransaction = {
  date: string;          // ISO 8601
  description: string;   // raw, unmodified
  amount: number;        // negative = debit, positive = credit
  balanceAfter?: number;
  sourceStatementId: string;
  sourceRowIndex: number; // for traceability/debugging
};
```

### 3.5 Deduplication
Hash `(accountId, date, amount, normalizedDescription)`. Overlapping statement periods (user re-uploads a month that includes a few days from the prior upload) are extremely common — dedupe on ingest, not at read time. Ties (genuine same-day identical transactions) are preserved as separate rows keyed with an ordinal suffix rather than collapsed.

### 3.6 Validation
Where a running balance column exists, reconcile: `balance[n] == balance[n-1] + amount[n]`. Mismatches don't block ingest but flag the statement as `needs_review` and surface which rows broke the chain — this catches parser bugs before they corrupt a user's dashboard.

---

## 4. Categorization Strategy

### 4.1 Merchant normalization (pre-LLM)
Strip POS noise before anything touches the model: transaction codes, store numbers, city/state suffixes, card network prefixes (`SQ *`, `TST*`, `POS DEBIT`, trailing `#4421 SF CA`). This is regex/rule-based, not LLM — it's cheap, deterministic, and dramatically improves cache hit rate in §4.2.

### 4.2 Merchant → category cache
```
merchant_category_cache (normalized_merchant, category_id, scope, confidence, source)
```
- `scope` is either `global` (shipped defaults + crowd-corrected on hosted tier) or `user` (per-user override, always wins).
- Before calling the LLM, every transaction is checked against this cache. Only cache misses get sent to the model. For a typical user, >90% of transactions after the first month are repeat merchants — this is the single biggest cost lever.

### 4.3 LLM categorization pass (cache misses only)
- Batch 50–100 uncategorized, normalized merchant strings per call (not full transaction rows — no need to send amounts/dates for pure categorization, which also reduces what leaves the machine on self-hosted mode with a cloud LLM key).
- Force structured output (JSON schema / tool-call mode), not free text — a fixed enum against the category taxonomy below, plus a confidence field.
- System prompt pins the taxonomy explicitly and instructs the model to prefer `Other` over guessing when confidence is low, rather than inventing a plausible-sounding category — this keeps the human-review queue meaningful instead of drowning in overconfident misclassifications.

**Default taxonomy** (extensible per-user): Groceries, Dining, Transport, Subscriptions, Utilities, Rent/Mortgage, Entertainment, Healthcare, Shopping, Travel, Fees/Interest, Income, Transfers, Other.

### 4.4 User corrections feed the cache
Any manual re-categorization writes back to `merchant_category_cache` at `user` scope immediately, and (hosted tier only, opt-in) can optionally contribute to the `global` scope anonymized by merchant name only — never transaction amounts or user identity.

---

## 5. Subscription / Recurring-Charge Detection

Separate deterministic pass, not LLM-first (LLM only used to produce a friendly display name at the end):

1. Group transactions by normalized merchant + amount bucket (amounts within ~3% tolerance, to catch subscriptions with minor price changes/tax).
2. Within each group, compute the deltas between consecutive dates.
3. Classify cadence if deltas cluster tightly around 7, 14, 30, 90, or 365 days (± a few days of tolerance). Require at least 2 confirmed intervals before flagging — never flag off a single repeat.
4. Track `next_expected_date` and mark a subscription `lapsed` if that date passes without a matching transaction — this is the "you're still being charged for X" / "you stopped paying for Y" insight users actually want.
5. Single LLM call per detected group (not per transaction) to produce a clean display name from the raw merchant string.

---

## 6. Data Model

```
users
  id, email, auth fields, deployment-mode-aware settings

accounts
  id, user_id, name, institution_name, account_type, source (manual | plaid), currency

statements
  id, account_id, uploaded_at, source_filename, file_type, parse_status,
  parser_profile_used, needs_review (bool)

transactions
  id, account_id, statement_id, date, raw_description, merchant_normalized,
  amount, balance_after, category_id, category_confidence, category_source (cache|llm|user),
  is_subscription_candidate, dedupe_hash

categories
  id, user_id (null = system default), name, parent_category_id, color, icon

merchant_category_cache
  id, normalized_merchant, category_id, scope (global|user), user_id (nullable), confidence, source

subscriptions
  id, user_id, merchant_normalized, display_name, amount_estimate, cadence,
  first_seen_date, last_charge_date, next_expected_date, status (active|lapsed|cancelled)

budgets
  id, user_id, category_id, month, target_amount

insight_snapshots
  id, user_id, period (month), generated_at, payload (jsonb — cached aggregates so the
  dashboard isn't recomputing trend math on every page load)

api_keys                    # OSS self-hosted: user's own OpenAI key, encrypted at rest (AES-256-GCM)
  id, user_id, provider, encrypted_key, created_at

plaid_items                 # hosted only
  id, user_id, access_token_encrypted, institution_id, status
```

Key decisions locked in:
- All monetary values stored as integer minor units (cents), never floats.
- `category_confidence` and `category_source` are always stored, even for cache hits — needed for the "review low-confidence transactions" UI view.
- `insight_snapshots` are precomputed, not derived live on every request — dashboards read cache, a background job (or on-demand recompute trigger) refreshes it.
- BYO key (`api_keys`) is encrypted with the same AES-256-GCM-at-rest pattern used for Query Guardian's DSNs. Never logged, never returned in any API response after initial save.

---

## 7. Security & Privacy Posture

- **Self-hosted default = zero egress except the user's chosen LLM provider.** No telemetry, no analytics pings, no update-check phone-home by default (opt-in only, clearly labeled).
- Uploaded statement files are parsed and then **not retained** by default — only the normalized transaction rows persist; raw file bytes are deleted post-parse unless the user explicitly opts into keeping originals (useful for re-parsing if a bug is found, but off by default).
- Cloud sync (hosted tier) is opt-in per account, not a global toggle, with a plain-language consent screen — this is the trust-critical UI moment and should never be dark-patterned into an assumed "on."
- Plaid access tokens encrypted at rest; never exposed to the frontend.

---

## 8. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React + Tailwind | PWA support out of the box for hosted tier, same skillset as dashboard work in Query Guardian |
| API | Node/TypeScript (Fastify or Next API routes) | Shared types with frontend, one language across the stack |
| Parsing | Node/TS for CSV, `pdf-parse`/layout-aware extraction for PDF, Tesseract for OCR fallback | Keeps parsing in-process for self-hosted mode, no external service dependency |
| DB | Postgres (self-hosted: local Postgres or SQLite-compatible mode; hosted: managed Postgres) | Matches the open-core "own your DB" pitch |
| LLM | OpenAI API (BYO key for OSS, managed key pool for hosted) | Structured output / JSON mode support is mature |
| Bank sync (hosted only) | Plaid | Industry standard, matches YNAB/Copilot Money category expectations |
| Billing (hosted only) | Stripe | Standard subscription billing |
