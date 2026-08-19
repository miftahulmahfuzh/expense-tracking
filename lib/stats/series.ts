/**
 * F08 — the maths behind `/stats`. Pure, framework-free, unit-tested.
 *
 * Everything that could lie to the reader lives in this file: the zero-fill guard that
 * stops the chart closing a gap, the divide-by-zero branch on the month-over-month
 * delta, the partial-month basis, and the apportionment that makes eight percentages add
 * up to 100. The components below it only render what this returns.
 */
import type { Category } from '@/lib/categories'
import { fillZeroMonths, type MonthlyTotal } from '@/lib/db/queries'
import type { MonthKey } from '@/lib/format'
import { monthTickLabel, monthsBetween } from './format'

/* ────────────────────────────────────────────────────────────────────────── *
 * Boundary types — everything here is JSON-serialisable and crosses the
 * server→client boundary as-is. No Date, no bigint, no functions.
 * ────────────────────────────────────────────────────────────────────────── */

export type MonthPoint = {
  month: MonthKey
  /** 'Agu' — pre-formatted on the SERVER so no Indonesian name table ships to the client. */
  label: string
  /** Whole rupiah. ALWAYS a number, 0 for months with no spend — never absent. */
  totalIdr: number
  /** True only for the in-progress current month. */
  isPartial: boolean
}

export type BreakdownRow = {
  category: Category
  /** 'Makan & Jajan' */
  label: string
  /**
   * The two-letter ledger mark — 'MJ'. This field was `emoji` in the F08 plan; design
   * R-34 replaced emoji with a code across the whole app because emoji rendering varies
   * by OS and vendor and cannot be tinted, while a code takes the category colour and
   * aligns in a 10px mono column. `CategoryCode` is what actually renders it.
   */
  code: string
  /** F03's CategoryMeta.color — the token NAME, '--color-cat-food'. Never a hex. */
  colorVar: string
  amountIdr: number
  /** Integer 0..100, largest-remainder rounded so the column sums to exactly 100. */
  pct: number
}

export type DeltaBasis =
  | { mode: 'full'; previousMonth: MonthKey }
  | { mode: 'mtd'; previousMonth: MonthKey; throughDay: number }

export type Delta =
  /** Nothing spent in either period — no comparison exists. */
  | { kind: 'none'; basis: DeltaBasis }
  /** The previous period was Rp 0 and this one is not. A percentage would be ÷0 = ∞. */
  | { kind: 'first'; currentIdr: number; basis: DeltaBasis }
  /** A real, finite comparison. */
  | {
      kind: 'pct'
      /** Signed, rounded. -100 when spend went to zero. */
      pct: number
      direction: 'up' | 'down' | 'flat'
      currentIdr: number
      previousIdr: number
      basis: DeltaBasis
    }

/* ────────────────────────────────────────────────────────────────────────── *
 * bigint safety
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Every rupiah total entering this module goes through here.
 *
 * `expense_items.amount_idr` is `bigint` in Postgres and `SUM(bigint)` returns `numeric`,
 * which a pg driver hands back as a STRING unless it is mapped. As shipped we are safe on
 * both counts — F03 declares the column `bigint('amount_idr', { mode: 'number' })` and
 * `.mapWith(Number)`s every aggregate — so this is a guard, not a fix. It stays because
 * the failure mode of losing either of those is silent: `"100" + "200" === "100200"`, a
 * hundred-thousand-rupiah month reported as a hundred million, and nothing errors.
 *
 * Safe by range: a single item caps at 1e9 (roadmap §4.3), so even a decade of maximal
 * spending stays ~6 orders of magnitude below Number.MAX_SAFE_INTEGER.
 */
export function toIdr(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 1. Densify — the "gaps must be explicit zeros" rule
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Decorate F03's dense monthly totals into chart points.
 *
 * WHY THE ZERO-FILL MATTERS: a SQL `GROUP BY month` only emits months that have rows. If
 * April had zero spend, April is simply absent, and a chart plotted from the raw rows
 * silently closes the gap — March sits next to May and the trend reads as smooth when the
 * truth is "you spent nothing for a month". That is the chart lying.
 *
 * `getMonthlyTotals` already applies `fillZeroMonths`, so `rows` should arrive dense. We
 * re-run it anyway: it is pure, O(n) over at most thirteen items, idempotent, and it means
 * a future change on either side cannot quietly reintroduce a closed gap. It also lets the
 * page over-fetch by one month for the delta (see page.tsx) and slice the window here
 * rather than pre-trimming — `fillZeroMonths` regenerates from the anchor, so rows outside
 * the window are dropped by construction.
 *
 * The two added fields are presentation-only and computed on the SERVER.
 */
export function buildMonthSeries(
  rows: ReadonlyArray<{ month: string; totalIdr: unknown }>,
  endMonth: MonthKey,
  length: number,
  currentMonth: MonthKey,
): MonthPoint[] {
  const dense: MonthlyTotal[] = fillZeroMonths(
    rows.map((r) => ({ month: r.month, totalIdr: toIdr(r.totalIdr) })),
    endMonth,
    length,
  )

  return dense.map((r) => ({
    month: r.month,
    label: monthTickLabel(r.month),
    totalIdr: toIdr(r.totalIdr),
    isPartial: r.month === currentMonth,
  }))
}

/**
 * How many columns the chart should show.
 *  - Never fewer than 3 — a 1- or 2-column "chart" reads as a rendering bug.
 *  - Never more than 12 — the roadmap's window, and the width budget.
 *  - Otherwise exactly the span from the user's first-ever active month to now, so a
 *    four-month-old account gets four columns rather than eight empty ones plus four.
 */
export function chartWindowLength(
  firstActiveMonth: MonthKey | null,
  currentMonth: MonthKey,
): number {
  if (!firstActiveMonth) return 3
  const span = monthsBetween(firstActiveMonth, currentMonth) + 1
  return Math.min(12, Math.max(3, span))
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 2. Month-over-month delta — divide-by-zero and the partial month
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * `currentIdr` and `previousIdr` MUST already be measured over comparable windows. The
 * caller does that:
 *   - selected month is in the past -> both are FULL month totals (basis 'full')
 *   - selected month is in progress -> both are days 1..today  (basis 'mtd')
 *
 * Comparing a half-finished month against a complete one is the single most common way a
 * spending app misleads its user, so the basis is a required argument and is always
 * rendered next to the number.
 */
export function computeDelta(currentIdr: number, previousIdr: number, basis: DeltaBasis): Delta {
  if (previousIdr <= 0 && currentIdr <= 0) return { kind: 'none', basis }

  // Divide-by-zero: last period was Rp 0. The percentage is +∞, which is not a number a
  // human can act on. Say what actually happened instead.
  if (previousIdr <= 0) return { kind: 'first', currentIdr, basis }

  const raw = ((currentIdr - previousIdr) / previousIdr) * 100
  // 1dp under 10%, 0dp above — 0.4% precision on a Rp 2jt number is noise.
  const pct = Math.abs(raw) < 10 ? Math.round(raw * 10) / 10 : Math.round(raw)
  const direction: 'up' | 'down' | 'flat' = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down'

  return { kind: 'pct', pct, direction, currentIdr, previousIdr, basis }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 3. Percentages that sum to 100
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Largest-remainder (Hamilton) apportionment. Naive per-row rounding makes a column of
 * eight percentages add up to 99 or 101, which readers notice and distrust. This sums to
 * exactly 100 whenever there is any spend at all.
 */
export function largestRemainderPct(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => 0)

  const exact = values.map((v) => (v / total) * 100)
  const out = exact.map((v) => Math.floor(v))
  let remaining = 100 - out.reduce((a, b) => a + b, 0)

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  for (let k = 0; k < order.length && remaining > 0; k++, remaining--) {
    const i = order[k]!.i
    out[i] = out[i]! + 1
  }
  return out
}
