"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi, useApiClient } from "@/lib/api";
import { currentPeriod, moneySigned, periodBounds, shiftPeriod, shortDate } from "@/lib/format";
import type { AccountView, CategoryView, TransactionPage, TransactionView } from "@/lib/types";
import { CategoryMenu } from "@/components/category-chip";

const RANGES = ["This month", "Last 3 months", "All time"] as const;
type Range = (typeof RANGES)[number];

export default function TransactionsPage() {
  const client = useApiClient();
  const [range, setRange] = useState<Range>("This month");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [extraPages, setExtraPages] = useState<TransactionView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const categories = useApi<{ categories: CategoryView[] }>("/api/categories");
  const accounts = useApi<{ accounts: AccountView[] }>("/api/accounts");

  const path = useMemo(() => {
    const params = new URLSearchParams();
    const period = currentPeriod();
    if (range === "This month") {
      const bounds = periodBounds(period);
      params.set("from", bounds.from); params.set("to", bounds.to);
    } else if (range === "Last 3 months") {
      params.set("from", periodBounds(shiftPeriod(period, -2)).from);
    }
    if (categoryId) params.set("categoryId", categoryId);
    if (accountId) params.set("accountId", accountId);
    params.set("limit", "100");
    return `/api/transactions?${params.toString()}`;
  }, [range, categoryId, accountId]);

  const page = useApi<TransactionPage>(path);
  const baseRows = page.data?.transactions ?? [];
  const [patched, setPatched] = useState<Map<string, TransactionView>>(new Map());
  const rows = [...baseRows, ...extraPages].map((row) => patched.get(row.id) ?? row);
  const nextCursor = cursor ?? page.data?.nextCursor ?? null;
  const reviewCount = rows.filter((row) => row.needsReview).length;
  const filtersActive = range !== "This month" || categoryId !== "" || accountId !== "";

  const resetPaging = () => { setExtraPages([]); setCursor(null); setPatched(new Map()); };

  const applyUpdate = (updated: TransactionView) => {
    setPatched((previous) => new Map(previous).set(updated.id, updated));
  };

  const correct = async (transaction: TransactionView, category: CategoryView) => {
    setBusyId(transaction.id); setRowError(null);
    try {
      applyUpdate(await client.send<TransactionView>("PATCH", `/api/transactions/${transaction.id}`, { categoryId: category.id }));
    } catch (cause) {
      setRowError(cause instanceof Error ? cause.message : "Correction failed");
    } finally { setBusyId(null); }
  };

  const confirm = async (transaction: TransactionView) => {
    setBusyId(transaction.id); setRowError(null);
    try {
      applyUpdate(await client.send<TransactionView>("POST", `/api/transactions/${transaction.id}/confirm`));
    } catch (cause) {
      setRowError(cause instanceof Error ? cause.message : "Confirm failed");
    } finally { setBusyId(null); }
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    const more = await client.get<TransactionPage>(`${path}&cursor=${encodeURIComponent(nextCursor)}`);
    setExtraPages((previous) => [...previous, ...more.transactions]);
    setCursor(more.nextCursor);
  };

  const gridCols = "grid grid-cols-[86px_minmax(150px,1fr)_154px_104px_126px_92px] max-[1060px]:grid-cols-[70px_minmax(140px,1fr)_140px_96px_78px] max-[760px]:grid-cols-[58px_minmax(110px,1fr)_118px_88px_70px]";

  return (
    <section className="mx-auto max-w-[1060px] animate-fadeUp px-11 pb-16 pt-9">
      <header className="mb-5 flex flex-wrap items-center gap-3.5">
        <h1 className="m-0 text-[22px] font-[650] tracking-[-0.01em]">Transactions</h1>
        <span className="text-[13.5px] text-ink2">{page.loading ? "loading…" : `${rows.length} shown`}</span>
        <div className="flex-1" />
        {reviewCount > 0 && (
          <Link href="/review" className="flex items-center gap-[7px] rounded-full border border-line bg-card px-[13px] py-[7px] text-[12.5px] font-semibold text-ink hover:border-ink3">
            <span className="h-[7px] w-[7px] rounded-full bg-warn" />
            {reviewCount} need review
          </Link>
        )}
      </header>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <select className="select-pill" value={range} onChange={(event) => { setRange(event.target.value as Range); resetPaging(); }} aria-label="Date range">
          {RANGES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select className="select-pill" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); resetPaging(); }} aria-label="Category filter">
          <option value="">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {(categories.data?.categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select className="select-pill" value={accountId} onChange={(event) => { setAccountId(event.target.value); resetPaging(); }} aria-label="Account filter">
          <option value="">All accounts</option>
          {(accounts.data?.accounts ?? []).map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
        {filtersActive && (
          <button
            onClick={() => { setRange("This month"); setCategoryId(""); setAccountId(""); resetPaging(); }}
            className="text-[12.5px] font-semibold text-accent-t hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {rowError && <p className="mb-3 text-[12.5px] font-semibold text-warn">{rowError}</p>}
      {page.error && <p className="mb-3 text-[12.5px] font-semibold text-warn">{page.error}</p>}

      <div className="rounded-card bg-card shadow-card">
        <div className={`${gridCols} items-center gap-2 border-b border-line px-5 py-3 text-[11px] font-[650] tracking-[0.06em] text-ink3`}>
          <span>DATE</span><span>MERCHANT</span><span>CATEGORY</span><span className="text-right">AMOUNT</span>
          <span className="max-[1060px]:hidden">ACCOUNT</span><span />
        </div>
        {rows.map((transaction) => (
          <div
            key={transaction.id}
            className={`${gridCols} items-center gap-2 border-b border-line px-5 py-3 text-[13px] hover:bg-[color-mix(in_oklab,var(--ink),transparent_97%)]`}
            style={{ background: transaction.needsReview ? "color-mix(in oklab, var(--warn), transparent 95%)" : undefined }}
          >
            <span className="text-[12.5px] tabular-nums text-ink2">{shortDate(transaction.date)}</span>
            <div className="min-w-0">
              <button
                onClick={() => setExpanded(expanded === transaction.id ? null : transaction.id)}
                title={transaction.description}
                className="flex items-center gap-1.5 text-left text-[13px] font-[550] text-ink hover:text-accent-t"
              >
                <span className="truncate">{transaction.merchant}</span>
                {transaction.needsReview && <span title={`Needs review: ${transaction.reviewReason}`} className="h-1.5 w-1.5 flex-none rounded-full bg-warn" />}
              </button>
              {expanded === transaction.id && (
                <div className="mt-0.5 font-mono text-[10.5px] text-ink3">{transaction.description}</div>
              )}
            </div>
            <div>
              <CategoryMenu
                name={transaction.categoryName}
                color={transaction.categoryColor}
                categories={categories.data?.categories ?? []}
                onPick={(category) => void correct(transaction, category)}
                busy={busyId === transaction.id}
              />
            </div>
            <span className="text-right tabular-nums" style={{ color: transaction.amountCents > 0 ? "var(--good)" : "var(--ink)", fontWeight: transaction.amountCents > 0 ? 650 : 600 }}>
              {moneySigned(transaction.amountCents)}
            </span>
            <span className="text-xs text-ink3 max-[1060px]:hidden">{transaction.accountName}</span>
            <div className="text-right">
              {transaction.needsReview && transaction.categoryId !== null && (
                <button
                  onClick={() => void confirm(transaction)}
                  disabled={busyId === transaction.id}
                  className="rounded-full border border-line bg-card px-[11px] py-1 text-[11.5px] font-semibold text-ink hover:border-accent-t hover:text-accent-t disabled:opacity-60"
                >
                  Confirm
                </button>
              )}
            </div>
          </div>
        ))}
        {!page.loading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 px-5 py-14 text-center">
            <span className="text-sm font-semibold">No transactions match these filters</span>
            <span className="text-[12.5px] text-ink2">Try widening the date range or clearing a filter.</span>
            <button
              onClick={() => { setRange("All time"); setCategoryId(""); setAccountId(""); resetPaging(); }}
              className="mt-1 rounded-full border border-line bg-card px-4 py-[7px] text-[12.5px] font-semibold text-accent-t hover:border-accent-t"
            >
              Clear filters
            </button>
          </div>
        )}
        {nextCursor && (
          <div className="px-5 py-3 text-center">
            <button onClick={() => void loadMore()} className="text-[12.5px] font-semibold text-accent-t hover:underline">Load more</button>
          </div>
        )}
      </div>
      <p className="mx-1 mt-3.5 text-[11.5px] text-ink3">
        Click a merchant to see the raw statement description. Click a category tag to correct it — corrections train future categorization.
      </p>
    </section>
  );
}
