# Statement — Sprint Plan (Codex Execution)

Each sprint is scoped as **one bounded Codex session**: self-contained, points at `docs/architecture.md` instead of restating context, and ends in a working, testable state. This is the same "sprint-as-session" model used for Query Guardian.

**Timeline note:** the sprints below are written as if run over 3–4 weeks because that's how they're *scoped* (each is independently correct and testable). You're compressing execution to ~2 days — that means running them back-to-back across two long Codex sessions per day rather than stretching them across calendar weeks. The scoping and acceptance criteria per sprint don't change; only the calendar does. A realistic 2-day split is suggested at the bottom — but budget for Sprint 3 (PDF parsing) and Sprint 5 (categorization) to overrun, since both involve external format/API variance that's hard to fully predict up front.

---

### Sprint 1 — Monorepo Scaffold + Data Model
**Status:** ✅ Done (2026-07-16)

**Scope:** npm workspaces (`core`, `parsers`, `api`, `web`), Postgres schema via Drizzle (all tables from architecture.md §6), migrations, `capabilities.ts` boundary stub, env config for `DEPLOYMENT_MODE`.
**Done when:** `npm run typecheck` clean across all packages, migrations run against a fresh DB, seed script inserts default category taxonomy.

**Kickoff prompt:**
> Scaffold the Statement monorepo per `docs/architecture.md` §2 and §6. Create npm workspaces `core`, `parsers`, `api`, `web`. Implement the full Postgres schema in `core` using Drizzle ORM exactly as specified in §6, with migrations. Implement `capabilities.ts` as specified in §2, driven by `DEPLOYMENT_MODE` env var. Seed the default category taxonomy from §4.4. All packages must typecheck clean. Do not implement parsing or API routes yet — this sprint is schema + scaffold only.

---

### Sprint 2 — CSV Parsing Pipeline
**Status:** ✅ Done (2026-07-16)

**Scope:** `parsers` package: delimiter/encoding sniffing, header heuristic matcher, date disambiguation, normalization to `RawTransaction`, dedupe hashing.
**Done when:** unit tests pass against a fixture set of at least 5 differently-shaped CSV exports (different column names, delimiters, date formats).

**Kickoff prompt:**
> Implement the CSV parsing pipeline in `packages/parsers` per `docs/architecture.md` §3.2, §3.4, §3.5. Build the header synonym matcher, date-format disambiguation by range-scanning the file, and dedupe hashing. Include a fixtures folder with at least 5 synthetic CSVs covering different bank export shapes (different column names, `Debit`/`Credit` split vs signed `Amount`, semicolon vs comma delimiter, `DD/MM/YYYY` vs `MM/DD/YYYY`). Write unit tests against all fixtures.

---

### Sprint 3 — PDF Parsing Pipeline
**Status:** ✅ Done (2026-07-16)

**Scope:** layout-aware text extraction, row reconstruction by y/x clustering, bank profile system + generic fallback, OCR fallback for scanned PDFs, confidence flagging.
**Done when:** correctly extracts transactions from at least 3 synthetic/sample digital-PDF statement layouts and 1 scanned/OCR sample, with `needs_review` flagging working on low-confidence rows.

**Kickoff prompt:**
> Implement PDF statement parsing in `packages/parsers` per `docs/architecture.md` §3.3. Use layout-aware text extraction (coordinates, not flat text) and reconstruct transaction rows via y-axis clustering + x-position column mapping. Build the bank-profile system: a profile registry keyed by a header fingerprint, with a generic heuristic fallback for unrecognized banks. Add OCR fallback (Tesseract) for image-based PDFs, flagging OCR-derived rows with lower confidence. Include at least 3 synthetic sample statement PDFs with different layouts plus 1 scanned sample, and tests proving correct extraction and confidence flagging.

---

### Sprint 4 — Ingest API: Upload, Validation, Persistence
**Status:** ✅ Done (2026-07-16)

**Scope:** `api` package: statement upload endpoint, format detection routing to the right parser, balance-chain validation, persistence of normalized transactions, `needs_review` surfacing.
**Done when:** end-to-end upload of a CSV and a PDF through the API results in correctly persisted, deduped transactions; a deliberately broken statement gets flagged `needs_review` with the failing rows identified.

**Kickoff prompt:**
> Implement the statement upload API in `packages/api` per `docs/architecture.md` §3.1 and §3.6. `POST /api/statements` accepts a file, detects CSV vs PDF, routes to the correct parser from Sprint 2/3, runs balance-chain validation where a balance column exists, and persists deduped transactions. Statements that fail balance reconciliation are marked `needs_review` with the specific failing row indices recorded for later UI display. Write integration tests covering a clean CSV, a clean PDF, and a deliberately corrupted statement.

---

### Sprint 5 — Categorization Engine
**Status:** ✅ Done (2026-07-16)

**Scope:** merchant normalization rules, merchant→category cache lookup, batched LLM categorization for cache misses with structured JSON output, cache write-back.
**Done when:** a batch of uncategorized transactions gets correctly categorized end-to-end, cache hit rate is verified to skip repeat merchants on a second run, and low-confidence results are stored (not silently dropped or forced).

**Kickoff prompt:**
> Implement the categorization engine in `packages/core` per `docs/architecture.md` §4. Build merchant normalization (strip POS noise) as deterministic rules — no LLM. Implement the `merchant_category_cache` lookup with `user` scope overriding `global` scope. For cache misses, batch 50–100 normalized merchants per OpenAI call using structured/JSON-schema output against the fixed taxonomy from §4.3, including a confidence field, with an explicit instruction to prefer `Other` over a low-confidence guess. Write results back to the cache. Add tests proving: (a) repeat merchants on a second ingest hit the cache and make zero LLM calls, (b) user corrections override the cache going forward.

---

### Sprint 6 — Subscription Detection
**Scope:** merchant+amount grouping, cadence detection from date deltas, `next_expected_date` tracking, lapsed detection, single LLM call per group for display name.
**Done when:** a fixture transaction history correctly identifies weekly/monthly/annual subscriptions, correctly ignores one-off repeat purchases that aren't periodic, and correctly flags a lapsed subscription.

**Kickoff prompt:**
> Implement recurring-charge/subscription detection in `packages/core` per `docs/architecture.md` §5. Group by normalized merchant + amount tolerance band, detect cadence from date-delta clustering (require ≥2 confirmed intervals), track `next_expected_date`, and flag `lapsed` status when a next-expected charge doesn't occur. Add one LLM call per confirmed group to produce a clean display name. Provide a fixture transaction history covering: a genuine monthly subscription, a genuine annual subscription, a non-periodic repeat purchase (should NOT be flagged), and a lapsed subscription. Write tests against all four cases.

---

### Sprint 7 — Insights & Budgets Engine
**Scope:** monthly aggregate computation (spend by category, trend vs. prior month, top merchants), `insight_snapshots` caching, budget target tracking against actuals.
**Done when:** insight snapshots generate correctly from a seeded transaction history and budgets endpoint returns accurate target-vs-actual per category.

**Kickoff prompt:**
> Implement the insights and budgets engine in `packages/core`/`packages/api` per `docs/architecture.md` §6. Build monthly aggregation (spend by category, month-over-month trend, top merchants by spend) and persist to `insight_snapshots` as cached JSON rather than recomputing on every dashboard read. Implement budget CRUD and a target-vs-actual calculation per category per month. Write tests using a seeded multi-month transaction history.

---

### Sprint 8 — Dashboard Frontend
**Scope:** Next.js dashboard: upload flow, transaction table (with inline category correction), insights views (trend charts, top merchants), subscriptions view, needs-review queue.
**Done when:** a user can upload a statement, see parsed/categorized transactions, correct a category inline, view monthly insights, and see the subscriptions list — all against the real API from prior sprints.

**Kickoff prompt:**
> Build the Next.js dashboard in `packages/web` per `docs/architecture.md` §8 and the UI/UX spec (see `docs/ui-spec.md` if produced via Claude Design). Screens: statement upload (drag-drop, progress, needs-review results), transaction table with inline category correction (writes to `merchant_category_cache` at user scope), insights view (spend by category, trend chart, top merchants), subscriptions view (active/lapsed list), and a needs-review queue for low-confidence or validation-failed items. Wire against the real API — no mocked data.

---

### Sprint 9 — Auth, BYO Key Storage, Settings (OSS-complete)
**Scope:** user auth, encrypted BYO OpenAI key storage/rotation, settings UI, `DEPLOYMENT_MODE=self-hosted` fully functional end-to-end.
**Done when:** a fresh self-hosted deploy, from `docker compose up`, lets a new user sign up, add their OpenAI key, upload a statement, and see categorized insights — with zero external calls other than to OpenAI.

**Kickoff prompt:**
> Implement auth (email/password is sufficient for OSS v1 — no need for OAuth providers yet), encrypted BYO OpenAI key storage (AES-256-GCM per `docs/architecture.md` §6/§7) with a settings page to add/rotate the key, and confirm `DEPLOYMENT_MODE=self-hosted` is fully functional end-to-end with zero telemetry/egress beyond OpenAI. This sprint marks OSS v1 feature-complete — audit the whole flow from signup to insights and close any gaps found.

---

### Sprint 10 — Hosted Tier: Plaid + Billing + Multi-Account
**Parallel track — does not block OSS v1 or Sprint 11.**
**Scope:** `packages/hosted`: Plaid Link integration, encrypted access token storage, multi-account support, Stripe subscription billing, cloud-sync opt-in consent flow.
**Done when:** a hosted-mode deploy can link a real (sandbox) Plaid account, sync transactions into the same pipeline as manual uploads, and gate features behind an active Stripe subscription.

**Kickoff prompt:**
> Implement the hosted-tier package per `docs/architecture.md` §2 and §7. Add Plaid Link for bank account connection (use Plaid sandbox for testing), storing access tokens encrypted per §6. Synced transactions must flow through the same normalization/categorization pipeline as manually uploaded statements — no parallel code path. Add multi-account support in the dashboard. Add Stripe subscription billing gating hosted-only routes via `capabilities.ts`. Build the cloud-sync opt-in consent screen per §7 — default OFF, explicit per-account toggle, plain-language copy.

---

### Sprint 11 — Production Deployment
**Scope:** Dockerfiles for self-hosted (single `docker compose up`) and hosted deploy configs, CI (typecheck/test/build on PR), PWA manifest + service worker, basic security hardening pass (rate limiting on upload/categorization endpoints, input size limits, CORS).
**Done when:** `docker compose up` from a clean clone gets a self-hosted user to a working app with no manual steps beyond setting env vars; CI is green on a fresh PR; Lighthouse PWA audit passes for installability.

**Kickoff prompt:**
> Finalize production deployment per `docs/architecture.md`. Write a self-hosted `docker-compose.yml` that brings up Postgres + the app with a single command and only requires env var configuration (no manual DB setup). Add GitHub Actions CI running typecheck, unit tests, and build on every PR. Add PWA manifest + service worker to `packages/web` for installability. Add rate limiting to upload and categorization endpoints, request size limits on file upload, and CORS configuration. Confirm the self-hosted flow works end-to-end from a completely clean clone.

---

## Suggested 2-Day Grouping

**Day 1:** Sprints 1 → 5 (scaffold through categorization — the core data pipeline). This is the highest-uncertainty stretch (parsing formats, LLM output reliability); don't compress it further than this.

**Day 2:** Sprints 6 → 9, then 11 (subscriptions, insights, dashboard, auth/BYO-key, deploy). Sprint 10 (hosted/Plaid/Stripe) is explicitly parallel — run it whenever, it doesn't block shipping OSS v1.

If Day 1 overruns into PDF parsing edge cases, that's expected — ship Sprint 3 with the generic fallback parser working well and treat additional bank-specific profiles as post-v1 contributions (this is also good GitHub bait per the growth playbook: "add your bank" is an easy first PR for contributors).
