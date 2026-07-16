"use client";

import { useMemo, useState } from "react";
import { useApi, useApiClient } from "@/lib/api";
import { currentPeriod, money, monthLabel, shiftPeriod } from "@/lib/format";
import type { BudgetResult, CategoryView } from "@/lib/types";

export default function BudgetsPage() {
  const client = useApiClient();
  const [period, setPeriod] = useState(currentPeriod());
  const budgets = useApi<{ month: string; budgets: BudgetResult[] }>(`/api/budgets?month=${period}`);
  const categories = useApi<{ categories: CategoryView[] }>("/api/categories");

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = budgets.data?.budgets ?? [];
  const totalTarget = rows.reduce((sum, budget) => sum + budget.targetAmountCents, 0);
  const totalActual = rows.reduce((sum, budget) => sum + budget.actualAmountCents, 0);
  const colorByCategoryId = useMemo(
    () => new Map((categories.data?.categories ?? []).map((category) => [category.id, category.color])),
    [categories.data],
  );
  const unbudgeted = (categories.data?.categories ?? []).filter(
    (category) => category.name !== "Income" && !rows.some((budget) => budget.categoryId === category.id),
  );

  const save = async (categoryId: string, dollars: string) => {
    const value = Number(dollars);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter a target above zero."); return; }
    setError(null);
    try {
      await client.send("PUT", "/api/budgets", { categoryId, month: period, targetAmountCents: Math.round(value * 100) });
      setEditing(null); setAdding(false); setNewCategoryId(""); setDraft("");
      budgets.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed"); }
  };

  const remove = async (categoryId: string) => {
    setError(null);
    try {
      await client.send("DELETE", `/api/budgets?categoryId=${categoryId}&month=${period}`);
      budgets.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Delete failed"); }
  };

  return (
    <section className="mx-auto max-w-[820px] animate-fadeUp px-11 pb-16 pt-9">
      <header className="mb-[22px] flex flex-wrap items-baseline gap-3.5">
        <h1 className="m-0 text-[22px] font-[650] tracking-[-0.01em]">Budgets</h1>
        <span className="text-[13.5px] text-ink2">
          {monthLabel(period)}
          {rows.length > 0 && (
            <> · <span className="font-semibold tabular-nums text-ink">{money(totalActual)}</span> of <span className="tabular-nums">{money(totalTarget)}</span> budgeted spend</>
          )}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[13px]">
          <button onClick={() => setPeriod(shiftPeriod(period, -1))} className="rounded px-2 py-0.5 text-ink2 hover:text-ink" title="Previous month">‹</button>
          <button onClick={() => setPeriod(shiftPeriod(period, 1))} disabled={period >= currentPeriod()} className="rounded px-2 py-0.5 text-ink2 hover:text-ink disabled:opacity-40" title="Next month">›</button>
        </div>
      </header>

      {(error ?? budgets.error) && <p className="mb-3 text-[12.5px] font-semibold text-warn">{error ?? budgets.error}</p>}

      <div className="rounded-card bg-card px-6 py-2.5 shadow-card">
        {rows.map((budget) => {
          const pct = budget.targetAmountCents > 0 ? (budget.actualAmountCents / budget.targetAmountCents) * 100 : 0;
          const warn = pct >= 90;
          const over = pct > 100;
          return (
            <div key={budget.id} className="flex flex-col gap-2 border-b border-line py-4 last:border-b-0">
              <div className="flex items-center gap-[9px]">
                <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: colorByCategoryId.get(budget.categoryId) ?? "#827e8b" }} />
                <span className="flex-1 text-[13.5px] font-semibold">{budget.categoryName}</span>
                {(warn || over) && (
                  <span className="text-[12.5px] font-semibold text-warn">
                    {over ? `Over by ${money(budget.actualAmountCents - budget.targetAmountCents)}` : `${Math.round(pct)}% used`}
                  </span>
                )}
                {editing === budget.categoryId ? (
                  <span className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void save(budget.categoryId, draft); if (event.key === "Escape") setEditing(null); }}
                      className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-right text-[13px] tabular-nums outline-none focus:border-accent-t"
                      inputMode="decimal"
                      aria-label={`Monthly target for ${budget.categoryName} in dollars`}
                    />
                    <button onClick={() => void save(budget.categoryId, draft)} className="text-[12px] font-semibold text-accent-t hover:underline">Save</button>
                    <button onClick={() => void remove(budget.categoryId)} className="text-[12px] text-ink3 hover:text-warn">Remove</button>
                  </span>
                ) : (
                  <button
                    onClick={() => { setEditing(budget.categoryId); setDraft((budget.targetAmountCents / 100).toFixed(0)); }}
                    className="text-[13px] tabular-nums hover:text-accent-t"
                    title="Edit target"
                  >
                    <span className="font-[650]">{money(budget.actualAmountCents)}</span>
                    <span className="text-ink3"> / {money(budget.targetAmountCents)}</span>
                  </button>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-card2">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.min(pct, 100)}%`, background: warn ? "var(--warn)" : "color-mix(in oklab, var(--accent), transparent 20%)" }}
                />
              </div>
            </div>
          );
        })}
        {!budgets.loading && rows.length === 0 && (
          <p className="py-8 text-center text-[12.5px] text-ink2">No budgets set for {monthLabel(period)} yet — add a category target below.</p>
        )}
        <div className="py-3">
          {adding ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className="select-pill" value={newCategoryId} onChange={(event) => setNewCategoryId(event.target.value)} aria-label="Budget category">
                <option value="">Choose category…</option>
                {unbudgeted.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Target $"
                className="w-24 rounded-lg border border-line bg-card px-2.5 py-[7px] text-[13px] tabular-nums outline-none focus:border-accent-t"
                inputMode="decimal"
                aria-label="Monthly target in dollars"
              />
              <button
                onClick={() => { if (newCategoryId) void save(newCategoryId, draft); }}
                disabled={!newCategoryId}
                className="rounded-[10px] bg-accent px-4 py-[7px] text-[12.5px] font-semibold text-white hover:opacity-95 disabled:opacity-50"
              >
                Set target
              </button>
              <button onClick={() => { setAdding(false); setDraft(""); }} className="text-[12.5px] text-ink3 hover:text-ink2">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setAdding(true); setDraft(""); }} className="text-[12.5px] font-semibold text-accent-t hover:underline">
              + Add category target
            </button>
          )}
        </div>
      </div>
      <p className="mx-1 mt-3.5 text-[11.5px] text-ink3">Bars shift to amber at 90% of target — a nudge, not an alarm. Targets reset on the 1st of each month.</p>
    </section>
  );
}
