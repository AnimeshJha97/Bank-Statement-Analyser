"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi, useApiClient } from "@/lib/api";
import { moneySigned, shortDate } from "@/lib/format";
import type { CategoryView, TransactionPage, TransactionView } from "@/lib/types";
import { CategoryMenu } from "@/components/category-chip";

function reasonText(transaction: TransactionView): string {
  switch (transaction.reviewReason) {
    case "validation":
      return "Balance validation failed at this row — check the amount and date against your statement.";
    case "low-confidence":
      return `Low-confidence category (${Math.round((transaction.categoryConfidence ?? 0) * 100)}%) — confirm or correct it.`;
    case "uncategorized":
      return "Not categorized yet — pick a category to file it.";
    default:
      return "";
  }
}

export default function ReviewPage() {
  const client = useApiClient();
  const queue = useApi<TransactionPage>("/api/transactions?needsReview=true&limit=500");
  const categories = useApi<{ categories: CategoryView[] }>("/api/categories");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = (queue.data?.transactions ?? []).filter((transaction) => !resolved.has(transaction.id));
  const confirmable = items.filter((transaction) => transaction.categoryId !== null);

  const markResolved = (id: string) => setResolved((previous) => new Set(previous).add(id));

  const confirm = async (transaction: TransactionView) => {
    setBusyId(transaction.id); setError(null);
    try {
      const updated = await client.send<TransactionView>("POST", `/api/transactions/${transaction.id}/confirm`);
      if (!updated.needsReview) markResolved(transaction.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confirm failed"); }
    finally { setBusyId(null); }
  };

  const correct = async (transaction: TransactionView, category: CategoryView) => {
    setBusyId(transaction.id); setError(null);
    try {
      const updated = await client.send<TransactionView>("PATCH", `/api/transactions/${transaction.id}`, { categoryId: category.id });
      if (!updated.needsReview) markResolved(transaction.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Correction failed"); }
    finally { setBusyId(null); }
  };

  const confirmAll = async () => {
    setBulkBusy(true); setError(null);
    try {
      for (const transaction of confirmable) {
        const updated = await client.send<TransactionView>("POST", `/api/transactions/${transaction.id}/confirm`);
        if (!updated.needsReview) markResolved(transaction.id);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bulk confirm failed"); }
    finally { setBulkBusy(false); }
  };

  const allClear = !queue.loading && items.length === 0;

  return (
    <section className="mx-auto max-w-[720px] animate-fadeUp px-11 pb-16 pt-9">
      <header className="mb-5 flex items-center gap-3.5">
        <h1 className="m-0 text-[22px] font-[650] tracking-[-0.01em]">Needs review</h1>
        <span className="text-[13.5px] text-ink2">
          {queue.loading ? "loading…" : items.length > 0 ? `${items.length} to resolve` : ""}
        </span>
        <div className="flex-1" />
        {confirmable.length > 1 && (
          <button
            onClick={() => void confirmAll()}
            disabled={bulkBusy}
            className="rounded-full border border-line bg-card px-[15px] py-[7px] text-[12.5px] font-semibold text-ink hover:border-accent-t hover:text-accent-t disabled:opacity-60"
          >
            {bulkBusy ? "Confirming…" : `Confirm ${confirmable.length} suggestions`}
          </button>
        )}
      </header>

      {(error ?? queue.error) && <p className="mb-3 text-[12.5px] font-semibold text-warn">{error ?? queue.error}</p>}

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((transaction) => (
            <div key={transaction.id} className="flex flex-wrap items-center gap-4 rounded-[14px] bg-card p-[18px] px-[22px] shadow-card">
              <div className="min-w-[200px] flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-sm font-semibold">{transaction.merchant}</span>
                  <span className="text-xs tabular-nums text-ink2">{shortDate(transaction.date)}</span>
                  <span className="text-xs text-ink3">{transaction.accountName}</span>
                </div>
                <div className="mt-[3px] font-mono text-[10.5px] text-ink3">{transaction.description}</div>
                <div className="mt-[5px] text-xs text-ink2">{reasonText(transaction)}</div>
              </div>
              <span className="text-sm font-[650] tabular-nums" style={{ color: transaction.amountCents > 0 ? "var(--good)" : undefined }}>
                {moneySigned(transaction.amountCents)}
              </span>
              <div className="flex items-center gap-2">
                <CategoryMenu
                  name={transaction.categoryName}
                  color={transaction.categoryColor}
                  categories={categories.data?.categories ?? []}
                  onPick={(category) => void correct(transaction, category)}
                  busy={busyId === transaction.id}
                />
                {transaction.categoryId !== null && (
                  <button
                    onClick={() => void confirm(transaction)}
                    disabled={busyId === transaction.id}
                    className="rounded-[9px] bg-accent px-3.5 py-[7px] text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    Confirm
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {allClear && (
        <div className="flex animate-fadeUp flex-col items-center gap-2.5 rounded-[18px] bg-card px-6 py-14 text-center shadow-card">
          <span className="flex h-11 w-11 items-center justify-center rounded-full text-[19px] font-bold text-good" style={{ background: "color-mix(in oklab, var(--good), transparent 86%)" }}>✓</span>
          <span className="text-base font-[650]">All clear</span>
          <span className="max-w-sm text-[13px] text-ink2">Nothing needs your attention. Corrections you confirmed will sharpen future categorization.</span>
          <Link href="/" className="mt-2 rounded-full border border-line bg-card px-4 py-2 text-[12.5px] font-semibold text-ink hover:border-ink3">
            Back to overview
          </Link>
        </div>
      )}
    </section>
  );
}
