const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function money(cents: number): string {
  return usd.format(Math.abs(cents) / 100);
}

export function moneyWhole(cents: number): string {
  return usdWhole.format(Math.abs(cents) / 100);
}

/** Signed amount for transaction rows: −$12.34 / +$1,000.00 (U+2212 minus). */
export function moneySigned(cents: number): string {
  return (cents < 0 ? "−" : "+") + money(cents);
}

export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftPeriod(period: string, deltaMonths: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1 + deltaMonths, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodBounds(period: string): { from: string; to: string } {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(Date.UTC(year ?? 2026, month ?? 1, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

/** Approximate monthly cost of a subscription cadence. */
export function monthlyEquivalentCents(amountCents: number, cadence: string): number {
  switch (cadence) {
    case "weekly": return Math.round(amountCents * 52 / 12);
    case "biweekly": return Math.round(amountCents * 26 / 12);
    case "quarterly": return Math.round(amountCents / 3);
    case "yearly": return Math.round(amountCents / 12);
    default: return amountCents;
  }
}

export const cadenceLabel: Record<string, string> = {
  weekly: "week",
  biweekly: "2 weeks",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};
