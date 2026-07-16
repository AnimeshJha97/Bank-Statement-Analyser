# Statement — Dashboard UI Spec

Source of truth: the Claude Design project **“Statement Dashboard UI/UX Spec”**
(`https://claude.ai/design/p/34e6b6b0-850d-4cbe-881c-1283b50dc608`, file `Statement Dashboard.dc.html`).
Implemented in `packages/web` (Next.js 14 App Router + Tailwind), wired to the real API — no mocked data.

## Design tokens

Declared in `packages/web/src/app/globals.css`; Tailwind maps semantic names onto the CSS variables (`bg`, `card`, `card2`, `ink/ink2/ink3`, `line`, `accent`, `accent-t`, `good`, `warn`, `warn-bg`, `shadow`).

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#f6f4f0` | `#141218` |
| `--card` / `--card2` | `#fffefc` / `#f8f6f1` | `#1d1a23` / `#25212d` |
| `--ink` / `--ink2` / `--ink3` | `#2b2733` / `#736d7e` / `#a8a2b2` | `#eeecf2` / `#a49cb0` / `#6f6879` |
| `--accent` | `#45518f` (design default; alternates `#5f4d80`, `#2c6e5e`, `#a25a3c`) | same |
| `--accent-t` (text-safe accent) | `= accent` | `color-mix(accent, white 45%)` |
| `--good` / `--warn` | `oklch(0.48 0.08 170)` / `oklch(0.6 0.11 70)` | lightened dark-mode steps |

Font: **Instrument Sans** (via `next/font`), numeric UI text uses `tabular-nums`.
Theme: `data-theme="dark"` on `<html>`; user toggle persisted in `localStorage`, defaulting to `prefers-color-scheme`.

## Category palette (validated)

Category colors live in the DB (`categories.color`, seeded from `defaultCategoryTaxonomy` in `packages/core`). The six heavy-rotation chart categories form an OKLCH lightness ladder validated with the dataviz palette checker on **both** surfaces (`#fffefc` light / `#1d1a23` dark): lightness band, chroma floor, normal-vision floor ≥ 15, worst-pair CVD ΔE 6.8 (legal in the 6–8 band because color never carries identity alone — see relief rules below).

| Category | Hex | OKLCH |
|---|---|---|
| Groceries | `#00734b` | 0.48 · 0.13 · 165 |
| Transport | `#1e6db3` | 0.524 · 0.132 · 250 |
| Shopping | `#ad4975` | 0.549 · 0.138 · 355 |
| Dining | `#b16900` | 0.584 · 0.15 · 72 |
| Utilities | `#00a690` | 0.643 · 0.129 · 180 |
| Subscriptions | `#9a86d6` | 0.67 · 0.117 · 294 |
| Other | `#827e8b` | deliberately neutral — the overflow bucket, never an identity |

Remaining taxonomy colors (Rent/Mortgage, Entertainment, Healthcare, Travel, Fees/Interest, Income, Transfers) sit on the same ladder; they mostly appear as labeled chips.

**Relief rules (non-negotiable):**
- Donut segments keep a ~3.5px surface gap and ship with an adjacent legend showing name + amount + percent; hovering shows a tooltip. The donut shows the top 6 categories; the remainder folds into a neutral “Other categories” bucket.
- Category chips always carry the category name as text. Chip tints derive from the DB color via `color-mix` (`.cat-chip` in globals.css) so custom user categories inherit the treatment.
- The trend chart is a single accent-colored series (no legend needed; title names it) with crosshair + tooltip and an sr-only data table. Top-merchant and budget bars are single-hue with all values directly labeled.
- Status colors (`--good`/`--warn`) are reserved for state (review flags, budget warnings, income) and always pair with text.

## Screens

| Route | Content (all real API data) |
|---|---|
| `/` Overview | “Needs your attention” banner (review count, lapsed subscriptions) · stat cards: spent this month w/ MoM trend, income this month (deposits), recurring $/mo (active subscriptions) · category donut + legend · 6-month spend trend · top merchants. First-run empty state (3-step explainer + upload CTA) when no transactions exist. |
| `/transactions` | Filter row (range: This month / Last 3 months / All time · category · account, clear-filters) · table: date, merchant (click reveals raw statement description), category chip w/ inline correction menu (PATCH → trains `merchant_category_cache` at user scope), signed amount, account, Confirm for flagged rows · warm row tint + warn dot on needs-review rows · keyset “Load more” · empty state. |
| `/subscriptions` | Header: active count + $/mo recurring (cadences normalized to monthly) · active cards (amount, cadence, next charge) · dashed lapsed section (last charge date) · detection explainer footnote. |
| `/budgets` | Month pager · per-category progress bars (accent → amber at ≥90%, “Over by $X” note) · inline target edit + add/remove (PUT/DELETE /api/budgets). |
| `/upload` | Account picker + inline new-account form · drag-drop/browse zone · progress card with real XHR upload progress + parsing stage and privacy note · success card (imported / auto-categorized / flagged counts, CTA to review queue) · failure card with parser error and CSV guidance. |
| `/review` | Queue cards: merchant, date, account, raw description, reason (validation failure / low-confidence % / uncategorized), signed amount, category picker + Confirm (POST confirm) · bulk “Confirm N suggestions” · all-clear state. |

Sidebar: logo, nav with active state, needs-review count badge, privacy footnote, dark-mode toggle, collapse toggle (both persisted). Settings screen ships with Sprint 9 (auth + BYO key) — its design lives in the Claude Design file.

## Data conventions

- All money is integer cents end-to-end; the UI formats with `Intl.NumberFormat` and renders signed amounts with U+2212 (`−$84.27` / `+$3,125.00`, income in `--good`).
- The web app calls same-origin `/api/*`; `next.config.mjs` rewrites to the Fastify API (`API_ORIGIN`, default `http://127.0.0.1:3001`).
- User identity bootstraps via `GET /api/me` and rides the `x-user-id` header until Sprint 9 auth.
