# Statement — Roadmap

## v1.0 (OSS) — Sprints 1–9, 11
- Manual PDF/CSV statement upload
- CSV + PDF parsing with bank-profile system, OCR fallback
- Cached, batched LLM categorization
- Recurring subscription detection (active/lapsed)
- Monthly insights and budgets
- Self-hosted, BYO OpenAI key, single-command Docker deploy

## v1.x — Near-term (OSS)
- **Expanded bank-profile library** — community-contributed profiles; this is a deliberate low-friction contribution surface.
- **Multi-currency support** in transactions and insights (single-currency assumed in v1).
- **Custom category rules** — user-defined regex/merchant rules that skip the LLM entirely for power users.
- **CSV export** of categorized transactions and insights (data portability, reinforces the privacy pitch).
- **OFX/QFX import** alongside PDF/CSV.
- **Shared/household budgets** — multiple users, one set of accounts, without requiring the hosted tier (local multi-user mode).

## Hosted Tier — Sprint 10 and beyond
- Plaid bank sync (Sprint 10)
- Multi-account dashboard (Sprint 10)
- Stripe subscription billing (Sprint 10)
- PWA install + push notifications for lapsed-subscription alerts
- Opt-in cross-device cloud sync
- Managed OpenAI usage (no BYO key required) with usage-based or flat-tier pricing

## Longer-term ideas (unscheduled)
- **Natural-language finance chat** — "how much did I spend on dining last quarter" against a user's own transaction history, scoped to their data only.
- **Anomaly detection** — flag unusual transactions (amount spikes, new merchant + large amount) as a lightweight fraud-awareness signal, not a guarantee.
- **Goal tracking** — savings goals layered on top of the existing budget model.
- **Household/shared accounts on hosted tier** — permissions model for couples/roommates sharing visibility into shared expenses only.
- **Self-hosted local LLM option** — swap OpenAI for a local model (Ollama etc.) for users who want zero external API calls at all, at the cost of categorization quality. Strong fit for the privacy-first audience and a good Hacker News talking point.
- **Marketplace/registry for bank profiles** — separate from core, so the profile library can grow without bloating the main repo.

## Explicitly out of scope for v1
- Automated bill pay / money movement of any kind — Statement is read-only by design, which also meaningfully reduces its security surface and regulatory burden.
- Investment/brokerage account tracking — different data shape, different problem, would dilute the core pitch.
