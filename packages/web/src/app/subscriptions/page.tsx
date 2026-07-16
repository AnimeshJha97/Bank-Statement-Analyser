"use client";

import { useApi } from "@/lib/api";
import { cadenceLabel, money, monthlyEquivalentCents, shortDate } from "@/lib/format";
import type { SubscriptionView } from "@/lib/types";

export default function SubscriptionsPage() {
  const result = useApi<{ subscriptions: SubscriptionView[] }>("/api/subscriptions");
  const subscriptions = result.data?.subscriptions ?? [];
  const active = subscriptions.filter((subscription) => subscription.status === "active");
  const lapsed = subscriptions.filter((subscription) => subscription.status === "lapsed");
  const monthlyTotal = active.reduce((sum, subscription) => sum + monthlyEquivalentCents(subscription.amountEstimateCents, subscription.cadence), 0);

  return (
    <section className="mx-auto max-w-[1060px] animate-fadeUp px-11 pb-16 pt-9">
      <header className="mb-[22px] flex flex-wrap items-baseline gap-3.5">
        <h1 className="m-0 text-[22px] font-[650] tracking-[-0.01em]">Subscriptions</h1>
        <span className="text-[13.5px] text-ink2">
          {result.loading ? "detecting recurring charges…" : (
            <>{active.length} active · <span className="font-semibold tabular-nums text-ink">{money(monthlyTotal)}/mo</span> recurring</>
          )}
        </span>
      </header>

      {result.error && <p className="mb-4 text-[12.5px] font-semibold text-warn">{result.error}</p>}

      {!result.loading && subscriptions.length === 0 && !result.error && (
        <div className="rounded-card bg-card p-14 text-center shadow-card">
          <div className="mb-2 text-sm font-semibold">No recurring charges detected yet</div>
          <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-ink2">
            Subscriptions are detected from cadence and amount patterns and need at least three charges of the same amount. Upload more months of statements to see them here.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((subscription) => (
            <div key={subscription.id} className="flex flex-col gap-2.5 rounded-[14px] bg-card p-[18px] px-5 shadow-card">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-card2 text-[13px] font-[650] text-ink2">
                  {subscription.displayName[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" title={subscription.merchantNormalized}>{subscription.displayName}</span>
                <span className="rounded-full px-2 py-0.5 text-[10.5px] font-[650] tracking-[0.04em] text-good" style={{ background: "color-mix(in oklab, var(--good), transparent 88%)" }}>
                  ACTIVE
                </span>
              </div>
              <div className="flex items-baseline gap-[5px]">
                <span className="text-xl font-[650] tabular-nums">{money(subscription.amountEstimateCents)}</span>
                <span className="text-xs text-ink2">/ {cadenceLabel[subscription.cadence] ?? subscription.cadence}</span>
              </div>
              <div className="text-xs text-ink2">
                Next charge <span className="font-semibold tabular-nums text-ink">{shortDate(subscription.nextExpectedDate)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lapsed.length > 0 && (
        <>
          <div className="mb-3.5 flex items-center gap-3">
            <h2 className="m-0 text-[13px] font-[650] text-ink2">Lapsed</h2>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {lapsed.map((subscription) => (
              <div key={subscription.id} className="flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-line p-[18px] px-5 opacity-85">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-card2 text-[13px] font-[650] text-ink3">
                    {subscription.displayName[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink2" title={subscription.merchantNormalized}>{subscription.displayName}</span>
                  <span className="rounded-full bg-card2 px-2 py-0.5 text-[10.5px] font-[650] tracking-[0.04em] text-ink3">LAPSED</span>
                </div>
                <div className="flex items-baseline gap-[5px]">
                  <span className="text-xl font-[650] tabular-nums text-ink2">{money(subscription.amountEstimateCents)}</span>
                  <span className="text-xs text-ink3">/ {cadenceLabel[subscription.cadence] ?? subscription.cadence}</span>
                </div>
                <div className="text-xs text-ink3">Last charged {shortDate(subscription.lastChargeDate)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mx-1 mt-[22px] text-[11.5px] text-ink3">
        Recurring charges are detected automatically from cadence and amount patterns. A subscription is marked lapsed when its next expected charge doesn&apos;t arrive.
      </p>
    </section>
  );
}
