"use client";

import { useEffect, useRef, useState } from "react";
import type { CategoryView } from "@/lib/types";

const FALLBACK_COLOR = "#827e8b";

export function CategoryChip({ name, color }: { name: string | null; color: string | null }) {
  return (
    <span
      className="cat-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold"
      style={{ "--cat": color ?? FALLBACK_COLOR } as React.CSSProperties}
    >
      {name ?? "Uncategorized"}
    </span>
  );
}

/**
 * Category chip that opens a correction menu. Picking a category calls onPick —
 * the caller PATCHes the transaction, which trains merchant_category_cache at
 * user scope.
 */
export function CategoryMenu({
  name,
  color,
  categories,
  onPick,
  busy,
}: {
  name: string | null;
  color: string | null;
  categories: CategoryView[];
  onPick: (category: CategoryView) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className="cat-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold hover:shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent),transparent_75%)] disabled:opacity-60"
        style={{ "--cat": color ?? FALLBACK_COLOR } as React.CSSProperties}
        title="Correct category"
      >
        {busy ? "Saving…" : name ?? "Pick category"}
        <span className="text-[8px] opacity-70">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+5px)] z-50 max-h-72 min-w-[172px] overflow-y-auto rounded-xl border border-line bg-card p-[5px] shadow-card animate-fadeUp">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => { setOpen(false); if (category.name !== name) onPick(category); }}
              className="flex w-full items-center gap-[9px] rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-card2"
              style={{ background: category.name === name ? "var(--card2)" : undefined }}
            >
              <span className="cat-dot h-2 w-2 flex-none rounded-[3px]" style={{ "--cat": category.color } as React.CSSProperties} />
              <span className="flex-1">{category.name}</span>
              {category.name === name && <span className="font-bold text-accent-t">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
