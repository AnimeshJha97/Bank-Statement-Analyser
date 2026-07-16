import { normalizeMerchant } from "../categorization/normalization.js";
import type {
  RecurringTransaction,
  Subscription,
  SubscriptionCadence,
  SubscriptionDisplayNamer,
} from "./types.js";

const DAY_MS = 86_400_000;
const CADENCES: ReadonlyArray<{ cadence: SubscriptionCadence; days: number; tolerance: number }> = [
  { cadence: "weekly", days: 7, tolerance: 2 },
  { cadence: "biweekly", days: 14, tolerance: 3 },
  { cadence: "monthly", days: 30, tolerance: 4 },
  { cadence: "quarterly", days: 90, tolerance: 7 },
  { cadence: "yearly", days: 365, tolerance: 10 },
];

interface Candidate {
  date: string;
  day: number;
  amount: bigint;
}

export interface SubscriptionDetectorOptions {
  amountTolerance?: number;
  asOf?: string;
}

/** Detects recurring charges without sending transaction dates or amounts to the LLM. */
export class SubscriptionDetector {
  readonly #amountTolerance: number;

  constructor(
    private readonly namer: SubscriptionDisplayNamer,
    options: Omit<SubscriptionDetectorOptions, "asOf"> = {},
  ) {
    this.#amountTolerance = options.amountTolerance ?? 0.03;
    if (this.#amountTolerance < 0 || this.#amountTolerance >= 1) {
      throw new RangeError("amountTolerance must be between 0 (inclusive) and 1 (exclusive)");
    }
  }

  async detect(
    transactions: readonly RecurringTransaction[],
    options: Pick<SubscriptionDetectorOptions, "asOf"> = {},
  ): Promise<Subscription[]> {
    const asOfDay = parseDay(options.asOf ?? new Date().toISOString().slice(0, 10));
    const merchants = new Map<string, Candidate[]>();

    for (const transaction of transactions) {
      const merchant = transaction.merchantNormalized?.trim().toUpperCase() || normalizeMerchant(transaction.description);
      if (!merchant) continue;
      const amount = typeof transaction.amount === "bigint" ? transaction.amount : toMinorUnits(transaction.amount);
      // Credits/refunds cannot establish a recurring charge.
      if (amount >= 0n) continue;
      const candidate = { date: transaction.date, day: parseDay(transaction.date), amount };
      const list = merchants.get(merchant) ?? [];
      list.push(candidate);
      merchants.set(merchant, list);
    }

    const confirmed: Array<{ merchant: string; charges: Candidate[]; cadence: typeof CADENCES[number] }> = [];
    for (const [merchant, charges] of merchants) {
      for (const amountGroup of groupByAmount(charges, this.#amountTolerance)) {
        const uniqueByDay = [...new Map(amountGroup.map((charge) => [charge.day, charge])).values()]
          .sort((a, b) => a.day - b.day);
        if (uniqueByDay.length < 3) continue;
        const cadence = classifyCadence(uniqueByDay);
        if (cadence) confirmed.push({ merchant, charges: uniqueByDay, cadence });
      }
    }

    return Promise.all(confirmed.map(async ({ merchant, charges, cadence }) => {
      const last = charges.at(-1)!;
      const nextDay = last.day + cadence.days;
      return {
        merchantNormalized: merchant,
        displayName: await this.namer.name(merchant),
        amountEstimate: median(charges.map(({ amount }) => amount)),
        cadence: cadence.cadence,
        firstSeenDate: charges[0]!.date,
        lastChargeDate: last.date,
        nextExpectedDate: formatDay(nextDay),
        status: asOfDay > nextDay + cadence.tolerance ? "lapsed" : "active",
        transactionCount: charges.length,
      };
    }));
  }
}

function classifyCadence(charges: readonly Candidate[]): typeof CADENCES[number] | undefined {
  const deltas = charges.slice(1).map((charge, index) => charge.day - charges[index]!.day);
  return CADENCES
    .map((cadence) => ({ cadence, matches: deltas.filter((delta) => Math.abs(delta - cadence.days) <= cadence.tolerance).length }))
    .filter(({ matches }) => matches >= 2 && matches / deltas.length >= 0.75)
    .sort((a, b) => b.matches - a.matches || a.cadence.tolerance - b.cadence.tolerance)[0]?.cadence;
}

function groupByAmount(charges: readonly Candidate[], tolerance: number): Candidate[][] {
  const groups: Candidate[][] = [];
  for (const charge of [...charges].sort((a, b) => Number(abs(a.amount) - abs(b.amount)))) {
    const group = groups.find((candidate) => withinTolerance(charge.amount, median(candidate.map(({ amount }) => amount)), tolerance));
    if (group) group.push(charge);
    else groups.push([charge]);
  }
  return groups;
}

function withinTolerance(left: bigint, right: bigint, tolerance: number): boolean {
  const larger = Number(abs(left) > abs(right) ? abs(left) : abs(right));
  return larger === 0 ? left === right : Number(abs(abs(left) - abs(right))) / larger <= tolerance;
}

function median(values: readonly bigint[]): bigint {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2n;
}

function abs(value: bigint): bigint { return value < 0n ? -value : value; }

function toMinorUnits(value: number): bigint {
  if (!Number.isSafeInteger(value)) throw new TypeError("Transaction amounts must be safe integer minor units");
  return BigInt(value);
}

function parseDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError(`Invalid ISO date: ${value}`);
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new TypeError(`Invalid ISO date: ${value}`);
  return Math.floor(timestamp / DAY_MS);
}

function formatDay(day: number): string { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

