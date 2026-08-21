import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Money } from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { CATEGORY_META } from '@/lib/categories'
import {
  getBiggestExpense,
  getCategoryBreakdown,
  getMonthToDatePair,
  getMonthlyTotals,
} from '@/lib/db/queries'
import {
  addMonths,
  currentMonthKey,
  isValidMonthKey,
  todayJakartaISO,
  type MonthKey,
} from '@/lib/format'
import {
  buildMonthSeries,
  chartWindowLength,
  computeDelta,
  largestRemainderPct,
  toIdr,
  type BreakdownRow,
  type DeltaBasis,
} from '@/lib/stats/series'

import BiggestExpenseTile from './BiggestExpenseTile'
import CategoryBreakdown from './CategoryBreakdown'
import DeltaTile from './DeltaTile'
import { NoDataState, SingleMonthState } from './EmptyStates'
import InsightSections from './InsightSections'
import InsightSkeleton from './InsightSkeleton'
import MonthlyChart from './MonthlyChart'
import MonthSwitcher from './MonthSwitcher'
import './stats.css'

/**
 * `/stats` — the 12-month trend, the category split, and one actionable outlier.
 *
 * ALL AGGREGATION IS SQL. Four aggregates from F03, one `Promise.all`, one await boundary.
 * Not a single raw expense row is summed in JS, there is no waterfall, no N+1 and no client
 * fetching. Adding a fifth query, or moving any sum into a component, is a regression.
 *
 * NO `export const dynamic`. `requireUserId()` reads the session cookie, which makes the
 * route dynamic by construction — and R-75 recorded that Next 16 dropped `dynamic` from the
 * route-segment-config table, so the plan's `force-dynamic` would be a no-op that reads as a
 * guarantee. `next build` must list this route as `ƒ`; if it ever shows `○`, the auth call
 * has been lost and the page would be cached across users.
 */

/**
 * F12 §8, card item 4a: `Statistik` → `Simpulan`. THREE STRINGS — this, the <h1> below, and the
 * TabBar label. The PATH stays `/stats`.
 *
 * Renaming the route would mean a redirect and dead bookmarks for nothing anyone can see: the
 * app runs standalone with no URL bar, `app/actions/_revalidate.ts` hard-codes
 * `revalidatePath('/stats')`, `proxy.ts`'s matcher names it, and the test suite references it.
 * The word on the tab is the whole of what the user was asking to change.
 */
export const metadata: Metadata = { title: 'Simpulan' }

/** The chart window. One extra month is FETCHED — see the comment on `totals` below. */
const MONTHS = 12

export default async function StatsPage({ searchParams }: PageProps<'/stats'>) {
  const userId = await requireUserId()

  const todayISO = todayJakartaISO() // Asia/Jakarta (D9) — the app's only wall clock
  const currentMonth: MonthKey = currentMonthKey()
  const throughDay = Number(todayISO.slice(8, 10))

  const sp = await searchParams // Next 16: searchParams is a Promise
  const requested = Array.isArray(sp?.m) ? sp.m[0] : sp?.m
  const windowStart = addMonths(currentMonth, -(MONTHS - 1))

  /*
   * Clamp `?m=`. Never the future (nothing to show), never outside the chart window (the
   * selected month would have no bar to emphasise). `isValidMonthKey` rejects shape errors
   * — 'banana', '2020-13', '' — and the string comparisons are safe because zero-padded
   * 'YYYY-MM' sorts lexicographically exactly as it sorts chronologically. Anything else
   * falls back silently to the current month: a garbage deep link is a mis-paste, not an
   * error worth a screen.
   */
  const selectedMonth: MonthKey =
    isValidMonthKey(requested) && requested <= currentMonth && requested >= windowStart
      ? requested
      : currentMonth

  const previousMonth = addMonths(selectedMonth, -1)
  const isPartialMonth = selectedMonth === currentMonth

  /* ──────────────────────────────────────────────────────────────────────────
     ONE await boundary, four SQL aggregates.

     MONTHS + 1: the fetch window is thirteen months, the CHART window is twelve. When the
     user pages to the earliest visible month, its previous month sits one step outside the
     chart — and without that extra row `previousTotal` would read 0 and the delta tile
     would announce "Bulan pertama dengan pengeluaran" for a month that has a perfectly good
     predecessor. The extra row never reaches the chart: `buildMonthSeries` re-runs
     `fillZeroMonths` from the anchor, which regenerates the window and drops anything
     outside it.
     ────────────────────────────────────────────────────────────────────────── */
  const [totalsRaw, breakdownRaw, biggest, mtdPair] = await Promise.all([
    getMonthlyTotals(userId, MONTHS + 1, currentMonth),
    getCategoryBreakdown(userId, selectedMonth),
    getBiggestExpense(userId, selectedMonth),
    isPartialMonth ? getMonthToDatePair(userId, selectedMonth, throughDay) : Promise.resolve(null),
  ])

  /* ── monthly series ─────────────────────────────────────────────────────── */

  const totals = totalsRaw.map((r) => ({ month: r.month, totalIdr: toIdr(r.totalIdr) }))

  // Activity is judged over the VISIBLE twelve, not the fetched thirteen: the 0-month and
  // 1-month short-circuits below are about what the chart would look like.
  const visible = totals.filter((r) => r.month >= windowStart)
  const active = visible.filter((r) => r.totalIdr > 0)
  const firstActive = active[0]?.month ?? null
  const activeCount = active.length

  const series = buildMonthSeries(
    totals,
    currentMonth,
    chartWindowLength(firstActive, currentMonth),
    currentMonth,
  )

  const selectedTotal = totals.find((t) => t.month === selectedMonth)?.totalIdr ?? 0
  const previousTotal = totals.find((t) => t.month === previousMonth)?.totalIdr ?? 0

  /* ── month-over-month delta, honest about the partial month ───────────────
     If the selected month is still running, comparing its 19 days against a complete
     31-day July reports a fake collapse every day before the month ends — which is exactly
     when someone opens this page. So for the in-progress month we compare 1..today against
     1..today of last month, and the tile SAYS SO.                                        */

  const basis: DeltaBasis = isPartialMonth
    ? { mode: 'mtd', previousMonth, throughDay }
    : { mode: 'full', previousMonth }

  const delta =
    isPartialMonth && mtdPair
      ? computeDelta(toIdr(mtdPair.currentIdr), toIdr(mtdPair.previousIdr), basis)
      : computeDelta(selectedTotal, previousTotal, { mode: 'full', previousMonth })

  /* ── category breakdown ─────────────────────────────────────────────────── */

  // F03 already orders these by total desc and omits zero-spend categories; the filter and
  // sort are cheap idempotent guards over at most eight rows.
  const catTotals = breakdownRaw
    .map((r) => ({ category: r.category, amountIdr: toIdr(r.totalIdr) }))
    .filter((r) => r.amountIdr > 0)
    .sort((a, b) => b.amountIdr - a.amountIdr)

  const pcts = largestRemainderPct(catTotals.map((r) => r.amountIdr))
  const breakdownTotal = catTotals.reduce((a, r) => a + r.amountIdr, 0)

  const rows: BreakdownRow[] = catTotals.map((r, i) => {
    const meta = CATEGORY_META[r.category]
    return {
      category: r.category,
      label: meta.label,
      code: meta.code,
      colorVar: meta.color, // '--color-cat-food' — a TOKEN NAME, never a hex
      amountIdr: r.amountIdr,
      pct: pcts[i] ?? 0,
    }
  })

  /* ── render ─────────────────────────────────────────────────────────────── */

  return (
    <main className="pb-2">
      {/* The screen title band, matching /new's. A tab destination gets a title; a pushed
          view gets a chrome label. */}
      <header className="glass border-b border-rule pt-safe-header px-safe pb-3.5">
        <h1 className="text-title">Simpulan</h1>
      </header>

      <div className="flex flex-col gap-2.5 pt-3.5 px-safe">
        {/* Exactly ONE hero figure per view. This is it. */}
        <section className="glass rounded-card p-4">
          <MonthSwitcher
            selectedMonth={selectedMonth}
            currentMonth={currentMonth}
            earliestMonth={windowStart}
          />
          <p className="mt-3">
            <Money value={selectedTotal} size="hero" />
          </p>
          <DeltaTile delta={delta} />
        </section>

        {activeCount === 0 ? (
          <NoDataState />
        ) : activeCount === 1 && active[0] ? (
          <SingleMonthState month={active[0].month} totalIdr={active[0].totalIdr} />
        ) : (
          <MonthlyChart series={series} selectedMonth={selectedMonth} />
        )}

        <CategoryBreakdown rows={rows} totalIdr={breakdownTotal} />
        <BiggestExpenseTile item={biggest} />

        {/*
          F12 §7.5, card item 4b: the three LLM summaries, BELOW Pengeluaran Terbesar exactly as
          the card asks.

          THE ONLY SUSPENDING THING ON THIS PAGE. Everything above is the four SQL aggregates
          from one `Promise.all` and is already painted; this boundary is what keeps an ~8s model
          call from holding the hero figure hostage. Each `<Suspense>` is an independent streaming
          point (Next 16 streaming guide), so nothing above waits on it.

          `activeCount === 0` short-circuits it: a user with no expenses anywhere has nothing to
          summarise, and `getInsightSections` would return null after two queries. Skipping the
          boundary means the empty-state page makes no extra round trip at all.
        */}
        {activeCount > 0 && (
          <Suspense fallback={<InsightSkeleton />}>
            <InsightSections />
          </Suspense>
        )}
      </div>
    </main>
  )
}
