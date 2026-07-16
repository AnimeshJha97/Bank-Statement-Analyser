"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi, useApiClient } from "@/lib/api";
import { currentPeriod, money, moneySigned, monthLabel, monthlyEquivalentCents, periodBounds, shiftPeriod } from "@/lib/format";
import type { CategoryView, MonthlyInsightPayload, SubscriptionView, TransactionPage } from "@/lib/types";
import { Donut, TrendChart, type TrendPoint } from "@/components/charts";

const OTHER_COLOR = "#827e8b";

export default function OverviewPage() {
  const period = useMemo(currentPeriod, []);
  const bounds = useMemo(() => periodBounds(period), [period]);
  const client = useApiClient();

  const anyTransactions = useApi<TransactionPage>("/api/transactions?limit=1");
  const insights = useApi<MonthlyInsightPayload>(`/api/insights/monthly?period=${period}`);
  const monthTransactions = useApi<TransactionPage>(`/api/transactions?from=${bounds.from}&to=${bounds.to}&limit=500`);
  const review = useApi<TransactionPage>("/api/transactions?needsReview=true&limit=500");
  const subscriptions = useApi<{ subscriptions: SubscriptionView[] }>("/api/subscriptions");
  const categories = useApi<{ categories: CategoryView[] }>("/api/categories");

  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const periods = Array.from({ length: 6 }, (_, index) => shiftPeriod(period, index - 5));
    Promise.all(periods.map((p) => client.get<MonthlyInsightPayload>(`/api/insights/monthly?period=${p}`)))
      .then((payloads) => {
        if (!cancelled) setTrend(payloads.map((payload, index) => ({ period: periods[index]!, totalSpendCents: payload.totalSpendCents })));
      })
      .catch(() => { if (!cancelled) setTrend([]); });
    return () => { cancelled = true; };
  }, [client, period]);

  const [hoverCategory, setHoverCategory] = useState<string | null>(null);

  if (anyTransactions.loading) return <Loading />;
  if (anyTransactions.data && anyTransactions.data.transactions.length === 0) return <FirstRun />;

  const colorByCategoryId = new Map((categories.data?.categories ?? []).map((category) => [category.id, category.color]));
  const byCategory = insights.data?.byCategory ?? [];
  const totalSpend = insights.data?.totalSpendCents ?? 0;
  const top = byCategory.slice(0, 6).map((entry) => ({
    name: entry.categoryName,
    amountCents: entry.amountCents,
    color: (entry.categoryId && colorByCategoryId.get(entry.categoryId)) || OTHER_COLOR,
  }));
  const restCents = byCategory.slice(6).reduce((sum, entry) => sum + entry.amountCents, 0);
  const segments = restCents > 0 ? [...top, { name: "Other categories", amountCents: restCents, color: OTHER_COLOR }] : top;

  const incomeRows = (monthTransactions.data?.transactions ?? []).filter((transaction) => transaction.amountCents > 0);
  const incomeCents = incomeRows.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const topIncome = [...incomeRows].sort((a, b) => b.amountCents - a.amountCents)[0];

  const activeSubscriptions = (subscriptions.data?.subscriptions ?? []).filter((subscription) => subscription.status === "active");
  const lapsedCount = (subscriptions.data?.subscriptions ?? []).filter((subscription) => subscription.status === "lapsed").length;
  const recurringMonthlyCents = activeSubscriptions.reduce(
    (sum, subscription) => sum + monthlyEquivalentCents(subscription.amountEstimateCents, subscription.cadence), 0);

  const reviewCount = review.data?.transactions.length ?? 0;
  const trendPct = insights.data?.trendVsPriorMonth;

  const merchants = insights.data?.topMerchants ?? [];
  const maxMerchant = merchants[0]?.amountCents ?? 1;

  return (
    <section className="mx-auto max-w-[1060px] animate-fadeUp px-11 pb-16 pt-9">
      <header className="mb-6 flex items-baseline gap-3.5">
        <h1 className="m-0 text-[22px] font-[650] tracking-[-0.01em]">Overview</h1>
        <span className="text-[13.5px] text-ink2">{monthLabel(period)}</span>
      </header>

      {(reviewCount > 0 || lapsedCount > 0) && (
        <div className="mb-5 flex flex-wrap items-center gap-3.5 rounded-[14px] border px-[18px] py-3.5"
          style={{ background: "color-mix(in oklab, var(--accent), var(--card) 92%)", borderColor: "color-mix(in oklab, var(--accent), transparent 82%)" }}>
          <span className="h-2 w-2 flex-none rounded-full bg-accent-t" />
          <span className="text-[13.5px] font-semibold">Needs your attention</span>
          {reviewCount > 0 && (
            <Link href="/review" className="text-[13px] font-semibold text-accent-t hover:underline">
              {reviewCount} transaction{reviewCount === 1 ? "" : "s"} need review →
            </Link>
          )}
          {reviewCount > 0 && lapsedCount > 0 && <span className="text-line">|</span>}
          {lapsedCount > 0 && (
            <Link href="/subscriptions" className="text-[13px] font-semibold text-accent-t hover:underline">
              {lapsedCount} subscription{lapsedCount === 1 ? "" : "s"} lapsed →
            </Link>
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5 rounded-card bg-card p-5 px-[22px] shadow-card">
          <span className="text-[12.5px] font-semibold text-ink2">Spent this month</span>
          <span className="text-[30px] font-[650] tabular-nums tracking-[-0.01em]">{insights.loading ? "…" : money(totalSpend)}</span>
          {trendPct !== null && trendPct !== undefined && insights.data && (
            <span className="text-[12.5px] font-semibold" style={{ color: trendPct <= 0 ? "var(--good)" : "var(--warn)" }}>
              {trendPct <= 0 ? "▾" : "▴"} {Math.abs(trendPct * 100).toFixed(1)}%{" "}
              <span className="font-normal text-ink2">vs {monthLabel(shiftPeriod(period, -1)).split(" ")[0]} ({money(insights.data.priorMonthTotalSpendCents)})</span>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 rounded-card bg-card p-5 px-[22px] shadow-card">
          <span className="text-[12.5px] font-semibold text-ink2">Income this month</span>
          <span className="text-[30px] font-[650] tabular-nums tracking-[-0.01em]">{monthTransactions.loading ? "…" : money(incomeCents)}</span>
          <span className="text-[12.5px] text-ink2">
            {incomeRows.length === 0 ? "No deposits yet" : `${incomeRows.length} deposit${incomeRows.length === 1 ? "" : "s"}${topIncome ? ` · ${topIncome.merchant}` : ""}`}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-card bg-card p-5 px-[22px] shadow-card">
          <span className="text-[12.5px] font-semibold text-ink2">Recurring</span>
          <span className="text-[30px] font-[650] tabular-nums tracking-[-0.01em]">
            {subscriptions.loading ? "…" : money(recurringMonthlyCents)}<span className="text-[15px] font-medium text-ink2">/mo</span>
          </span>
          <Link href="/subscriptions" className="text-left text-[12.5px] font-semibold text-accent-t hover:underline">
            {activeSubscriptions.length} active subscription{activeSubscriptions.length === 1 ? "" : "s"} →
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[5fr_7fr]">
        <div className="rounded-card bg-card p-[22px] shadow-card">
          <h2 className="mb-4 mt-0 text-sm font-[650]">Spending by category</h2>
          {segments.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-ink3">No categorized spending yet this month.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-[22px]">
              <Donut segments={segments} totalCents={totalSpend} centerLabel={monthLabel(period).split(" ")[0] ?? ""} hovered={hoverCategory} onHover={setHoverCategory} />
              <div className="flex min-w-[170px] flex-1 flex-col gap-2">
                {segments.map((segment) => (
                  <div
                    key={segment.name}
                    className="flex cursor-default items-center gap-2 text-[12.5px]"
                    onMouseEnter={() => setHoverCategory(segment.name)}
                    onMouseLeave={() => setHoverCategory(null)}
                    style={{ opacity: hoverCategory && hoverCategory !== segment.name ? 0.5 : 1 }}
                  >
                    <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: segment.color }} />
                    <span className="flex-1 text-ink2">{segment.name}</span>
                    <span className="font-semibold tabular-nums">{money(segment.amountCents)}</span>
                    <span className="w-[34px] text-right tabular-nums text-ink3">
                      {totalSpend ? Math.round((segment.amountCents / totalSpend) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col rounded-card bg-card p-[22px] shadow-card">
          <h2 className="mb-1.5 mt-0 text-sm font-[650]">
            Spend trend <span className="font-normal text-ink2">· last 6 months</span>
          </h2>
          <div className="flex flex-1 items-center">
            {trend === null ? (
              <span className="animate-pulseSoft text-[12.5px] text-ink3">Loading trend…</span>
            ) : trend.length === 0 ? (
              <span className="text-[12.5px] text-ink3">Trend data is unavailable.</span>
            ) : (
              <TrendChart points={trend} />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-card bg-card p-[22px] shadow-card">
        <h2 className="mb-3.5 mt-0 text-sm font-[650]">Top merchants this month</h2>
        {merchants.length === 0 ? (
          <p className="text-[12.5px] text-ink3">No spending recorded this month.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {merchants.map((merchant) => (
              <div key={merchant.merchant} className="flex items-center gap-3" title={`${prettyMerchant(merchant.merchant)}: ${money(merchant.amountCents)}`}>
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-card2 text-xs font-[650] text-ink2">
                  {prettyMerchant(merchant.merchant)[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="w-[190px] truncate text-[13.5px] font-[550]">{prettyMerchant(merchant.merchant)}</span>
                <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-card2">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((merchant.amountCents / maxMerchant) * 100)}%`, background: "color-mix(in oklab, var(--accent), transparent 25%)" }} />
                </div>
                <span className="w-[82px] text-right text-[13.5px] font-semibold tabular-nums">{money(merchant.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function prettyMerchant(normalized: string): string {
  return normalized.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="animate-pulseSoft text-[13px] text-ink3">Loading…</span>
    </div>
  );
}

function FirstRun() {
  return (
    <section className="mx-auto max-w-[760px] animate-fadeUp px-11 py-16 text-center">
      <div className="mb-[18px] inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-[19px] font-bold text-white">S</div>
      <h1 className="mb-2 mt-0 text-[26px] font-[650] tracking-[-0.015em]">See where your money goes</h1>
      <p className="mx-auto mb-8 max-w-[400px] text-[14.5px] leading-relaxed text-ink2">
        Upload a bank or credit-card statement and Statement turns it into categorized spending, subscriptions, and monthly insights.
      </p>
      <div className="mb-8 grid grid-cols-1 gap-3.5 text-left sm:grid-cols-3">
        {[
          ["STEP 1", "Upload a statement", "PDF or CSV. Parsed on your device, then deleted."],
          ["STEP 2", "We categorize it", "Every transaction tagged. Anything uncertain is flagged for a quick check."],
          ["STEP 3", "You see insights", "Spending trends, subscriptions, and budgets — at a glance."],
        ].map(([step, title, body]) => (
          <div key={step} className="rounded-[14px] bg-card p-[18px] px-5 shadow-card">
            <div className="mb-2 text-[11px] font-bold text-accent-t">{step}</div>
            <div className="mb-1 text-[13.5px] font-[650]">{title}</div>
            <div className="text-[12.5px] leading-relaxed text-ink2">{body}</div>
          </div>
        ))}
      </div>
      <Link href="/upload" className="inline-block rounded-xl bg-accent px-7 py-[13px] text-[14.5px] font-[650] text-white shadow-card hover:opacity-95">
        Upload your first statement
      </Link>
      <p className="mb-11 mt-3.5 flex items-center justify-center gap-[7px] text-xs text-ink3">
        <LockIcon />
        Private by default — nothing leaves your device unless you opt in.
      </p>
      <div className="grid grid-cols-1 gap-4 text-left opacity-80 sm:grid-cols-2">
        <div className="rounded-card bg-card p-[22px] shadow-card">
          <h2 className="mb-4 mt-0 text-sm font-[650] text-ink2">Spending by category</h2>
          <div className="flex items-center gap-[18px]">
            <div className="h-[120px] w-[120px] flex-none rounded-full border-[16px] border-card2" />
            <p className="m-0 text-[12.5px] leading-relaxed text-ink3">Your category breakdown appears after your first upload.</p>
          </div>
        </div>
        <div className="rounded-card bg-card p-[22px] shadow-card">
          <h2 className="mb-4 mt-0 text-sm font-[650] text-ink2">Spend trend</h2>
          <div className="flex h-24 items-end gap-2.5 border-b border-line px-2">
            <span className="mb-[22px] h-2 w-2 rounded-full bg-ink3" />
            <p className="mb-2 text-[12.5px] leading-relaxed text-ink3">One month of data is a dot, not a trend — the line appears at month two.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="5.5" width="9" height="6" rx="1.5" />
      <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" />
    </svg>
  );
}
