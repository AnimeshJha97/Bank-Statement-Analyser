# Statement

**Privacy-first personal finance insights, from your own bank statements.**

Upload a PDF or CSV statement, get AI-categorized spending, automatic recurring-subscription detection, and monthly budget insights — without handing your financial data to a black-box SaaS.

Statement is **open-core**: the self-hosted version is free, runs on your own machine, uses your own database, and your own OpenAI API key. Nothing leaves your infrastructure except the anonymized merchant strings sent for categorization. The hosted version adds automatic bank sync (Plaid), a mobile-friendly PWA, and multi-account support for people who'd rather not run a server.

<!-- badges: build status, license, npm/docker pulls -->
<!-- screenshot: dashboard overview -->
<!-- screenshot: transaction table with categorization -->
<!-- screenshot: subscriptions view -->

---

## Why Statement

Most budgeting apps want your bank credentials on day one. Statement doesn't ask for that — upload a statement PDF or CSV, and it does the rest locally:

- **AI categorization** of every transaction, with a merchant-level cache so repeat categorization costs near-zero after the first month.
- **Recurring subscription detection** — see exactly what you're being billed for on a schedule, and get flagged when a subscription silently stops.
- **Monthly insights** — spend by category, trend vs. last month, top merchants — without recomputing on every page load.
- **Self-hostable, BYO API key.** Your statements, your database, your OpenAI key.

## Self-Hosted vs. Hosted

| | Self-Hosted (free, OSS) | Hosted (paid) |
|---|---|---|
| Statement upload (PDF/CSV) | ✅ | ✅ |
| AI categorization | ✅ (your OpenAI key) | ✅ |
| Subscription detection | ✅ | ✅ |
| Monthly insights & budgets | ✅ | ✅ |
| Automatic bank sync (Plaid) | — | ✅ |
| Multi-account | — | ✅ |
| Mobile PWA | — | ✅ |
| Cloud sync across devices | — | ✅ (opt-in) |
| Data location | Your database | Managed, encrypted |

## Quickstart (Self-Hosted)

```bash
git clone https://github.com/AnimeshJha97/Bank-Statement-Analyser.git
cd statement
cp .env.example .env       # add your OPENAI_API_KEY and a DB connection string
docker compose up
```

Then open `http://localhost:3000`, sign up, add your OpenAI key in Settings, and upload your first statement.

See [docs/installation.md](docs/installation.md) for manual (non-Docker) setup, environment variable reference, and troubleshooting.

## How It Works

1. **Upload** a PDF or CSV statement.
2. **Parse** — Statement extracts transactions using layout-aware PDF parsing or CSV header detection, with a per-bank profile system that improves over time (contributions welcome — see below).
3. **Categorize** — merchants are normalized, checked against a category cache, and only cache misses are sent to the LLM in batches.
4. **Detect subscriptions** — recurring charges are grouped and flagged automatically, including lapsed subscriptions.
5. **See insights** — spend trends, budgets, and top merchants, updated as you upload more statements.

Full pipeline design: [docs/architecture.md](docs/architecture.md).

## Contributing

The bank-profile parser library is the easiest way to contribute: if Statement falls back to the generic parser for your bank, adding a profile is usually a small, self-contained PR. See [docs/architecture.md §3.3](docs/architecture.md#33-pdf-extraction).

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## License

<!-- e.g. AGPL-3.0 for the OSS core, keeps hosted-only code (packages/hosted) proprietary -->

## Security & Privacy

Self-hosted mode makes zero outbound calls other than to your configured OpenAI endpoint. Uploaded statement files are deleted after parsing by default — only normalized transaction data is retained, unless you explicitly opt in to keeping originals. See [docs/architecture.md §7](docs/architecture.md#7-security--privacy-posture).
