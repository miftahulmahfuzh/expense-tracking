/**
 * F08 — the short list of formatters `lib/format.ts` does not already provide.
 *
 * DO NOT add anything here that lib/format.ts already exports. Already provided and
 * deliberately NOT duplicated (R-8 made F03's module canonical and complete):
 *   formatIdr · formatIdrDigits · formatIdrCompact · parseIdrLoose
 *   isValidMonthKey · isValidDateISO · addMonths · monthRange · monthKey
 *   currentMonthKey · todayJakartaISO · isAfterCurrentMonth
 *   monthLabel · monthLabelShort · dateLabel · dayLabel · formatJakartaLong
 *   MONTH_NAMES_ID · MONTH_NAMES_ID_SHORT · DAY_NAMES_ID
 *
 * Each export below carries a comment naming the existing helper it is *not* a duplicate
 * of, and why that helper does not fit the 414px column this page has to live in.
 */
import { formatIdrCompact, MONTH_NAMES_ID_SHORT, type DateISO, type MonthKey } from '@/lib/format'

function monthIndexOf(month: MonthKey): number {
  return Number(month.slice(5, 7)) - 1
}

function yearOf(month: MonthKey): number {
  return Number(month.slice(0, 4))
}

/**
 * Bare three-letter month for the x-axis: '2026-08' -> 'Agu'.
 *
 * NOT `monthLabelShort` ('Agu 26') and NOT `monthLabel` ('Agustus 2026'). Twelve ticks
 * share a ~314px plot, i.e. 26px per band; 'Agu 26' is ~34px at 10px mono and the ticks
 * collide. The year is carried by the readout above the chart, the caption below it and
 * the table view, so it is never actually missing — only absent from the tick.
 */
export function monthTickLabel(month: MonthKey): string {
  return MONTH_NAMES_ID_SHORT[monthIndexOf(month)] ?? month
}

/**
 * '2026-08' -> 'Agu 2026' — the readout and the table view.
 *
 * NOT `monthLabelShort`, whose two-digit year ('Agu 26') is fine on an axis but reads as
 * a typo in running text, and NOT `monthLabel` ('Agustus 2026'), which wraps the readout
 * line once the amount and the "Lihat bulan" link are on it too.
 */
export function monthMedium(month: MonthKey): string {
  return `${monthTickLabel(month)} ${yearOf(month)}`
}

/** Signed month distance. monthsBetween('2026-06', '2026-08') === 2. */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  return yearOf(b) * 12 + monthIndexOf(b) - (yearOf(a) * 12 + monthIndexOf(a))
}

/**
 * Compact rupiah for the y-axis, WITHOUT the 'Rp ' prefix.
 *   0 -> '0' · 45_000 -> '45rb' · 1_240_000 -> '1,2jt' · 2_000_000_000 -> '2M'
 *
 * A 40px axis gutter has no room for the prefix and the card title already establishes
 * the unit. This delegates to `formatIdrCompact` and strips the prefix rather than
 * re-deriving the thresholds: the plan's own sketch hand-rolled them and drifted on the
 * billions suffix ('m' vs F03's 'M'). One implementation, one set of suffixes.
 */
export function formatIdrAxis(n: number): string {
  return formatIdrCompact(n).replace('Rp ', '')
}

/**
 * '2026-08-18' -> '18 Agu 2026'.
 *
 * NOT `dateLabel` ('18 Agustus 2026') and NOT `dayLabel` ('Selasa, 18 Agustus 2026'). The
 * biggest-expense tile's meta line already carries the group title, and that line has one
 * ellipsis budget to spend — spend it on the title the user wrote, not on the month name.
 */
export function formatDayShort(isoDate: DateISO): string {
  const day = Number(isoDate.slice(8, 10))
  return `${day} ${monthTickLabel(isoDate.slice(0, 7))} ${isoDate.slice(0, 4)}`
}

/**
 * '1–19 Jul 2026' — the honest month-to-date comparison window, spelled out.
 *
 * There is no existing helper for a partial-month range because F08 is the only screen
 * that compares one. En dash, not a hyphen: this is a range, and the design sets it in
 * mono where both glyphs have the same advance anyway.
 */
export function formatMtdRange(month: MonthKey, throughDay: number): string {
  return `1–${throughDay} ${monthTickLabel(month)} ${yearOf(month)}`
}
