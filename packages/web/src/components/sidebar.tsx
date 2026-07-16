"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import type { TransactionPage } from "@/lib/types";

const icons = {
  overview: (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" /><rect x="10" y="1.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="1.5" y="10" width="5.5" height="5.5" rx="1.5" /><rect x="10" y="10" width="5.5" height="5.5" rx="1.5" />
    </svg>
  ),
  transactions: (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="15" y2="4" /><line x1="2" y1="8.5" x2="15" y2="8.5" /><line x1="2" y1="13" x2="10" y2="13" />
    </svg>
  ),
  subscriptions: (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8.5" cy="8.5" r="6.5" /><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  budgets: (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="14" x2="3" y2="9" /><line x1="8.5" y1="14" x2="8.5" y2="3" /><line x1="14" y1="14" x2="14" y2="6.5" />
    </svg>
  ),
  upload: (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 11V2.5" /><path d="M5 5.5l3.5-3.5L12 5.5" /><path d="M2.5 13.5h12" />
    </svg>
  ),
  review: (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 2l6 10.5H2.5L8.5 2z" /><line x1="8.5" y1="7" x2="8.5" y2="9.5" /><circle cx="8.5" cy="11.2" r="0.4" fill="currentColor" />
    </svg>
  ),
} as const;

const items: Array<{ href: string; label: string; icon: keyof typeof icons }> = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/transactions", label: "Transactions", icon: "transactions" },
  { href: "/subscriptions", label: "Subscriptions", icon: "subscriptions" },
  { href: "/budgets", label: "Budgets", icon: "budgets" },
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/review", label: "Needs review", icon: "review" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const review = useApi<TransactionPage>("/api/transactions?needsReview=true&limit=500");
  const reviewCount = review.data?.transactions.length ?? 0;

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("statement.sidebar") === "collapsed");
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  // Refresh the review badge when navigating (corrections happen on other screens).
  useEffect(() => { review.reload(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("statement.theme", next ? "dark" : "light");
  };
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem("statement.sidebar", next ? "collapsed" : "open");
  };

  return (
    <aside
      className="sticky top-0 flex h-screen flex-none flex-col gap-1 border-r border-line bg-card px-3.5 pb-4 pt-5 transition-[width] duration-200"
      style={{ width: collapsed ? 64 : 218 }}
    >
      <div className="flex items-center gap-2.5 px-3 pb-4">
        <div className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] bg-accent text-xs font-bold text-white">S</div>
        {!collapsed && <span className="text-base font-[650] tracking-[-0.02em]">Statement</span>}
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className="flex w-full items-center gap-[11px] rounded-[9px] px-3 py-[9px] text-[13.5px] font-medium hover:bg-[color-mix(in_oklab,var(--ink),transparent_95%)]"
            style={{
              background: active ? "color-mix(in oklab, var(--accent), transparent 89%)" : undefined,
              color: active ? "var(--accent-t)" : "var(--ink2)",
            }}
          >
            {icons[item.icon]}
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {!collapsed && item.href === "/review" && reviewCount > 0 && (
              <span className="rounded-full bg-warn-bg px-[7px] py-px text-[11px] font-semibold tabular-nums text-warn">{reviewCount}</span>
            )}
          </Link>
        );
      })}
      <div className="flex-1" />
      {!collapsed && (
        <p className="border-t border-line px-3 pt-3 text-[11px] leading-relaxed text-ink3">
          Private by default — statements are parsed locally and deleted after import.
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 border-t border-line px-3 pt-2.5">
        <button onClick={toggleDark} title="Toggle dark mode" className="flex items-center gap-2 text-[12.5px] text-ink2">
          <span
            className="relative h-[18px] w-[30px] flex-none rounded-full transition-colors"
            style={{ background: dark ? "var(--accent)" : "color-mix(in oklab, var(--ink), transparent 75%)" }}
          >
            <span
              className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-[left]"
              style={{ left: dark ? 14 : 2 }}
            />
          </span>
          {!collapsed && <span>Dark mode</span>}
        </button>
        <div className="flex-1" />
        <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="p-0.5 text-[13px] text-ink3 hover:text-ink">
          {collapsed ? "»" : "«"}
        </button>
      </div>
    </aside>
  );
}
