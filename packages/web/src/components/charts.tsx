"use client";

import { useState } from "react";
import { money, moneyWhole, monthLabel } from "@/lib/format";

export type DonutSegment = { name: string; amountCents: number; color: string };

/**
 * Category donut. Segments keep a ~3.5px surface gap; identity always arrives
 * with the adjacent labeled legend, never color alone. Hovering a segment (or
 * its legend row) raises it and shows a tooltip.
 */
export function Donut({ segments, totalCents, centerLabel, hovered, onHover }: {
  segments: DonutSegment[];
  totalCents: number;
  centerLabel: string;
  hovered: string | null;
  onHover: (name: string | null) => void;
}) {
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const active = segments.find((segment) => segment.name === hovered);
  return (
    <div className="relative h-[170px] w-[170px] flex-none" role="img" aria-label={`Spending by category. Total ${money(totalCents)}.`}>
      <svg width="170" height="170" viewBox="0 0 170 170">
        {segments.map((segment) => {
          const share = totalCents === 0 ? 0 : segment.amountCents / totalCents;
          const length = Math.max(share * C - 3.5, 2);
          const element = (
            <circle
              key={segment.name}
              cx="85" cy="85" r={R} fill="none"
              stroke={segment.color}
              strokeWidth={hovered === segment.name ? 27 : 23}
              strokeDasharray={`${length} ${C - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 85 85)"
              opacity={hovered && hovered !== segment.name ? 0.35 : 1}
              style={{ transition: "opacity .15s, stroke-width .15s", cursor: "pointer" }}
              onMouseEnter={() => onHover(segment.name)}
              onMouseLeave={() => onHover(null)}
            />
          );
          offset += share * C;
          return element;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-px">
        {active ? (
          <>
            <span className="text-[15px] font-[650] tabular-nums">{money(active.amountCents)}</span>
            <span className="max-w-[110px] truncate text-[11px] text-ink2">{active.name}</span>
            <span className="text-[10px] tabular-nums text-ink3">{totalCents ? Math.round((active.amountCents / totalCents) * 100) : 0}%</span>
          </>
        ) : (
          <>
            <span className="text-[19px] font-[650] tabular-nums">{moneyWhole(totalCents)}</span>
            <span className="text-[11px] text-ink2">{centerLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}

export type TrendPoint = { period: string; totalSpendCents: number };

/** Six-month spend trend: single accent series, crosshair hover, labeled last point. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 218, L = 44, R = 66, T = 26, B = 32;
  const values = points.map((point) => point.totalSpendCents / 100);
  const rawMax = Math.max(...values, 1);
  const step = Math.max(Math.ceil(rawMax / 3 / 100) * 100, 100);
  const max = step * 3;
  const n = values.length - 1;
  const x = (index: number) => L + (index * (W - L - R)) / Math.max(n, 1);
  const y = (value: number) => T + (1 - value / max) * (H - T - B);
  const linePoints = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const gridLines = [step, step * 2, step * 3];
  const last = values[n] ?? 0;

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    for (let index = 1; index < values.length; index++) {
      if (Math.abs(x(index) - px) < Math.abs(x(nearest) - px)) nearest = index;
    }
    setHover(nearest);
  };

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: W, fontFamily: "var(--sans)" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Spend trend, last ${points.length} months.`}
      >
        {gridLines.map((grid) => (
          <g key={grid}>
            <line x1={L} x2={W - R} y1={y(grid)} y2={y(grid)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 8} y={y(grid) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink3)" className="tabular-nums">
              ${grid >= 1000 ? `${(grid / 1000).toFixed(1)}k` : grid}
            </text>
          </g>
        ))}
        {n >= 1 && (
          <path
            d={`M ${x(n - 1)} ${y(values[n - 1] ?? 0)} L ${x(n)} ${y(last)} L ${x(n)} ${H - B} L ${x(n - 1)} ${H - B} Z`}
            fill="color-mix(in oklab, var(--accent), transparent 84%)"
          />
        )}
        <polyline points={linePoints} fill="none" stroke="var(--accent-t)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={T - 6} y2={H - B} stroke="var(--ink3)" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {values.map((value, index) => {
          const isLast = index === n;
          const isHover = hover === index;
          return (
            <g key={points[index]?.period ?? index}>
              <circle
                cx={x(index)} cy={y(value)}
                r={isHover ? 5.5 : isLast ? 4.5 : 3}
                fill={isLast || isHover ? "var(--accent-t)" : "var(--card)"}
                stroke={isLast || isHover ? "var(--card)" : "var(--ink3)"}
                strokeWidth={isLast || isHover ? 2 : 1.25}
              />
              {/* generous invisible hit target */}
              <circle cx={x(index)} cy={y(value)} r="14" fill="transparent" />
              <text x={x(index)} y={H - 10} textAnchor="middle" fontSize="10.5" fill={isLast ? "var(--ink)" : "var(--ink3)"} fontWeight={isLast ? 650 : 400}>
                {shortMonth(points[index]?.period ?? "")}
              </text>
            </g>
          );
        })}
        {hover === null && (
          <>
            <text x={x(n) + 10} y={y(last) + 1} fontSize="12.5" fontWeight="650" fill="var(--ink)" className="tabular-nums">
              {moneyWhole((points[n]?.totalSpendCents ?? 0))}
            </text>
            <text x={x(n) + 10} y={y(last) + 14} fontSize="9.5" fill="var(--ink2)">this month</text>
          </>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[11.5px] shadow-card"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}
        >
          <div className="font-semibold text-ink">{monthLabel(points[hover].period)}</div>
          <div className="tabular-nums text-ink2">{money(points[hover].totalSpendCents)} spent</div>
        </div>
      )}
      <table className="sr-only">
        <caption>Spend by month</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.period}><th scope="row">{monthLabel(point.period)}</th><td>{money(point.totalSpendCents)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}
