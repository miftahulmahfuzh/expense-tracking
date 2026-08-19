/**
 * Money and date formatting. AUTHORITATIVE — roadmap §4.7.
 *
 * Reconciliation R-8: this is the only `lib/format.ts`. F10 imports the money helpers
 * rather than authoring a second set. R-10: `lib/month.ts` does not exist; F07's month
 * arithmetic and Indonesian labels live here too.
 *
 * Two hard rules encoded here:
 *  - In Indonesian notation `.` is the THOUSANDS separator and `,` is the decimal separator.
 *    "38.500" is thirty-eight thousand five hundred, NOT thirty-eight point five.
 *  - The app's calendar is Asia/Jakarta (UTC+7, no DST ever). All date values are 'YYYY-MM-DD'
 *    strings, so month/day arithmetic is exact string math with no Date involved.
 */

export const TZ = 'Asia/Jakarta' as const

/* ------------------------------------------------------------------ money */

/**
 * formatIdrDigits(38500) === '38.500' — grouped digits, no prefix (reconciliation R-8,
 * accepting F10's D-3). F10's `Money` needs the digits alone so it can typeset the "Rp"
 * at a smaller optical size in a muted colour.
 *
 * Deliberately does NOT use Intl (see plan D-F): id-ID currency formatting emits a
 * non-breaking space whose codepoint has changed across ICU versions, and §4.7 specifies
 * a literal string. Rounds to whole rupiah — there are no cents (roadmap D5).
 *
 * A negative amount keeps its sign inline. `formatIdr` lifts it outside the "Rp".
 */
export function formatIdrDigits(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n)
  const sign = rounded < 0 ? '-' : ''
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  )
}

/** formatIdr(38500) === 'Rp 38.500' · formatIdr(-45000) === '-Rp 45.000', never 'Rp -45.000'. */
export function formatIdr(n: number): string {
  const digits = formatIdrDigits(n)
  return digits.startsWith('-') ? `-Rp ${digits.slice(1)}` : `Rp ${digits}`
}

/**
 * Compact form for chart axes and tight badges (F08).
 * 950 → 'Rp 950' · 45_000 → 'Rp 45rb' · 266_350 → 'Rp 266rb' · 1_500_000 → 'Rp 1,5jt' · 12_000_000 → 'Rp 12jt'
 */
export function formatIdrCompact(n: number): string {
  if (!Number.isFinite(n)) return 'Rp 0'
  const v = Math.round(n)
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000_000) return `${sign}Rp ${trimDecimal(a / 1_000_000_000)}M`
  if (a >= 1_000_000) return `${sign}Rp ${trimDecimal(a / 1_000_000)}jt`
  if (a >= 1_000) return `${sign}Rp ${trimDecimal(a / 1_000)}rb`
  return formatIdr(v)
}

function trimDecimal(x: number): string {
  // one decimal place, Indonesian comma, no trailing ",0"
  const s = x >= 10 ? Math.round(x).toString() : (Math.round(x * 10) / 10).toString()
  return s.replace('.', ',')
}

const SUFFIXES: ReadonlyArray<readonly [RegExp, number]> = [
  [/(?:jt|juta)$/, 1_000_000],
  [/(?:rb|ribu|k)$/, 1_000],
]

/**
 * Best-effort parse of hand-typed Indonesian money. Returns null when there is nothing
 * defensible to return — callers show a validation error rather than guessing.
 *
 * Does NOT enforce the §4.3 upper bound of 1e9; that is Zod's job at the boundary.
 * Never returns a negative (expenses are ≥ 0).
 *
 * The disambiguation rule, stated once: split on `[.,]`. If there is more than one part
 * and the LAST part has exactly 3 digits, every separator is a thousands separator.
 * Otherwise the last separator is a decimal point. A `k`/`rb`/`jt` suffix is stripped
 * first and does not change the rule — it only multiplies the result.
 *
 * See the full input/expectation table in docs/plans/F03-data-layer.md §8.2 and §8.3.
 */
export function parseIdrLoose(input: string): number | null {
  if (typeof input !== 'string') return null

  let s = input.toLowerCase().trim()
  if (!s) return null

  s = s.replace(/\s+/g, '') // "Rp 38.500" → "rp38.500", "45 ribu" → "45ribu"
  s = s.replace(/^(?:rp|idr)\.?/, '') // leading currency marker, with or without a dot
  s = s.replace(/(?:rupiah|idr)$/, '') // trailing currency word
  s = s.replace(/[,.]-+$/, '') // Indonesian invoice tail: "1.250.000,-"
  if (!s) return null
  if (s.startsWith('-')) return null // negative amounts are not a thing here

  let multiplier = 1
  for (const [re, m] of SUFFIXES) {
    if (re.test(s)) {
      s = s.replace(re, '')
      multiplier = m
      break
    }
  }
  if (!s) return null

  // Only digits and separators may remain. "45k5", "12,,3", "abc" all fail here.
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return null

  const parts = s.split(/[.,]/)
  let value: number

  if (parts.length === 1) {
    value = Number(parts[0])
  } else {
    const last = parts[parts.length - 1]!
    if (last.length === 3) {
      // Every separator is a thousands separator: "38.500", "1.250.000", "1,500".
      value = Number(parts.join(''))
    } else {
      // The last separator is a decimal point: "1,5jt", "1.5jt", "38.500,00".
      const intPart = parts.slice(0, -1).join('')
      value = Number(`${intPart}.${last}`)
    }
  }

  if (!Number.isFinite(value)) return null
  return Math.round(value * multiplier)
}

/* ------------------------------------------------------------------- dates */

/** 'YYYY-MM-DD' */
export type DateISO = string
/** 'YYYY-MM' */
export type MonthKey = string

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/

export function isValidDateISO(v: unknown): v is DateISO {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number) as [number, number, number]
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

export function isValidMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && MONTH_RE.test(v)
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/**
 * Today in Asia/Jakarta as 'YYYY-MM-DD'. This is the ONLY place the wall clock enters the app.
 * Uses formatToParts rather than a locale string so the output shape cannot drift with ICU.
 * Pass `now` in tests to make it deterministic.
 */
export function todayJakartaISO(now: Date = new Date()): DateISO {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** monthKey('2026-08-18') === '2026-08' · monthKey(new Date()) uses Asia/Jakarta. */
export function monthKey(value: DateISO | Date = new Date()): MonthKey {
  const iso = typeof value === 'string' ? value : todayJakartaISO(value)
  return iso.slice(0, 7)
}

/** The current Asia/Jakarta month — the redirect target for `/`. */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return monthKey(todayJakartaISO(now))
}

/**
 * Half-open range for a month, for `occurred_on >= start AND occurred_on < endExclusive`.
 * Half-open avoids ever having to know how long February is.
 * monthRange('2026-08') → { startISO: '2026-08-01', endExclusiveISO: '2026-09-01' }
 */
export function monthRange(month: MonthKey): { startISO: DateISO; endExclusiveISO: DateISO } {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  return { startISO: `${month}-01`, endExclusiveISO: `${addMonths(month, 1)}-01` }
}

/** addMonths('2026-01', -1) === '2025-12'. Pure integer math, no Date, no timezone. */
export function addMonths(month: MonthKey, delta: number): MonthKey {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 + 1
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`
}

/**
 * Is this month in the future? Drives the disabled "next month" arrow on /m/[month] (F07).
 *
 * Zero-padded YYYY-MM sorts lexicographically in calendar order, so plain string
 * comparison is correct and allocation-free.
 */
export function isAfterCurrentMonth(month: MonthKey, now: Date = new Date()): boolean {
  return month > currentMonthKey(now)
}

export const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const

export const MONTH_NAMES_ID_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const

export const DAY_NAMES_ID = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const

/** monthLabel('2026-08') === 'Agustus 2026' — the /m/[month] sticky header. */
export function monthLabel(month: MonthKey): string {
  if (!isValidMonthKey(month)) return month
  return `${MONTH_NAMES_ID[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

/** monthLabelShort('2026-08') === 'Agu 26' — Recharts x-axis ticks (F08). */
export function monthLabelShort(month: MonthKey): string {
  if (!isValidMonthKey(month)) return month
  return `${MONTH_NAMES_ID_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`
}

/** dateLabel('2026-08-18') === '18 Agustus 2026' */
export function dateLabel(iso: DateISO): string {
  if (!isValidDateISO(iso)) return iso
  return `${Number(iso.slice(8, 10))} ${MONTH_NAMES_ID[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/**
 * dayLabel('2026-08-18') === 'Selasa, 18 Agustus 2026' — the day sub-headers on /m/[month] (F07).
 * The Date is constructed at UTC midnight purely to read a weekday index; no local timezone is consulted.
 */
export function dayLabel(iso: DateISO): string {
  if (!isValidDateISO(iso)) return iso
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return `${DAY_NAMES_ID[dow]}, ${dateLabel(iso)}`
}

/**
 * '2026-08-18' → 'Selasa, 18 Agustus 2026'. Reconciliation R-21 accepted this from F09.
 *
 * F09 proposed an `Intl.DateTimeFormat('id-ID', …)` implementation anchored at Jakarta
 * midnight. It is an alias instead: `dayLabel` already produces exactly this string from
 * the hardcoded name tables, and plan D-F rules out Intl for Indonesian names precisely
 * so the output cannot drift with an ICU release. Two implementations of one string is
 * the pattern R-7/R-8 exist to prevent.
 */
export const formatJakartaLong = (iso: DateISO): string => dayLabel(iso)
