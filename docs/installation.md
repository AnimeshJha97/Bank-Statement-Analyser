# Installation (Self-Hosted)

## Requirements
- Docker + Docker Compose (recommended path), **or**
- Node.js 20+, Postgres 15+ for manual setup
- An OpenAI API key ([platform.openai.com](https://platform.openai.com))

## Option A: Docker Compose (recommended)

```bash
git clone https://github.com/<org>/statement.git
cd statement
cp .env.example .env
```

Edit `.env`:
```env
DEPLOYMENT_MODE=self-hosted
DATABASE_URL=postgres://statement:statement@db:5432/statement
OPENAI_API_KEY=            # can also be set per-user in Settings instead
ENCRYPTION_KEY=            # generate with: openssl rand -hex 32
```

```bash
docker compose up
```

Open `http://localhost:3000`, sign up, and (if you didn't set `OPENAI_API_KEY` globally) add your key under **Settings → API Key**.

## Option B: Manual Setup

```bash
npm install
createdb statement
cp .env.example .env       # edit DATABASE_URL to point at your local Postgres
npm run db:migrate
npm run db:seed            # seeds default category taxonomy
npm run dev
```

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DEPLOYMENT_MODE` | yes | `self-hosted` or `hosted` |
| `DATABASE_URL` | yes | Postgres connection string |
| `OPENAI_API_KEY` | no | global fallback; users can set their own in Settings instead |
| `ENCRYPTION_KEY` | yes | AES-256-GCM key for encrypting stored API keys; 32-byte hex |
| `NEXT_TELEMETRY_DISABLED` | recommended | Keep set to `1` for the self-hosted zero-telemetry guarantee |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | hosted only | ignored on self-hosted builds |
| `STRIPE_SECRET_KEY` | hosted only | ignored on self-hosted builds |

## Upgrading
```bash
git pull
docker compose down
docker compose up --build
```
Migrations run automatically on container start.

## Troubleshooting

**"needs_review" on every statement**: usually means a bank profile mismatch on a supported bank format, or a statement with no running-balance column (expected — validation is best-effort, not required).

**Categorization not running**: confirm an OpenAI key is set either globally or in per-user Settings. Self-hosted mode makes no LLM calls without one — categorization will simply mark everything `Other` until a key is present.

**Docker container can't reach Postgres**: confirm `DATABASE_URL` host matches the Compose service name (`db`), not `localhost`.
