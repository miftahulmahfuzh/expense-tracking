import { parseIdrLoose } from '@/lib/format'
import type { ParsedExpense, ParsedItem } from '@/lib/schema/expense'
import type { ParseInput } from './types'

/**
 * The promise this module keeps: **the user is never hard-blocked by an LLM failure.**
 *
 * It is deliberately dumb. Line by line, the amount is the trailing (or `Rp`-prefixed
 * leading) number, the name is whatever is left, and the category is always `other`
 * because guessing wrong is worse than not guessing (roadmap D1 — retagging is one tap).
 * It aims to produce something *editable*, not something *correct*: F05 renders a
 * "cek lagi" banner whenever `degraded` is true.
 *
 * Pure and synchronous — no network, no clock, no I/O, no `Date.now()`. Every date it
 * emits comes from the text or from the caller's `todayISO`.
 *
 * ⚠️ THIS MODULE SHIPS TO THE BROWSER. F05's `useParse` imports it directly, because with
 * no network there is no server to ask for a fallback — the offline path would otherwise be
 * the one dead end in the app. So this file and everything it imports (`lib/format.ts`,
 * `lib/schema/expense.ts`, `lib/categories.ts`, `lib/llm/types.ts`) must stay free of
 * `import 'server-only'`, of the database, and of the Anthropic SDK. `scripts/f05-preflight.sh`
 * asserts exactly that; adding a server-only import here breaks `/new`'s build, not this file's
 * tests.
 *
 * All money parsing delegates to `parseIdrLoose` (F03 owns it, reconciliation R-8);
 * `lib/llm/__tests__/parseIdrLoose.contract.test.ts` is the gate on that dependency.
 */

const MAX_ITEMS = 50
const MAX_NAME = 120
const MAX_TITLE = 120

/** Lines that are a sum of other lines, not a purchase. Emitting one double-counts. */
const TOTAL_RE =
  /^\s*(?:=\s*)?(?:total(?:nya)?|sub\s*-?\s*total|grand\s*total|jumlah(?:nya)?|semua(?:nya)?|sum|all)\b/i

/** A bare `= 266.350` line. */
const BARE_EQUALS_RE = /^\s*=\s*[\d.,]/

/** Amount at the end of the line — the common case: `roti buaya 38500`. */
const TAIL_AMOUNT_RE = /(?:rp\.?\s*|idr\s*)?(\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)?)\s*[.,;:!]?\s*$/i

/**
 * Amount at the start of the line: `Rp 38.500 roti buaya`. The `Rp`/`IDR` prefix is
 * REQUIRED here — without it, `2x nasi goreng 60k` would read its quantity as the price.
 */
const LEAD_AMOUNT_RE =
  /^\s*(?:rp\.?\s*|idr\s*)(\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)?)\s*[-–—:,]?\s*(.*)$/i

/** DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, with a 2- or 4-digit year. Never MM/DD. */
const NUMERIC_DATE_RE = /\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})\b/

/** `18 Agustus 2026`, `18 Ags 2026`, `9 Sep 2026`. */
const NAMED_DATE_RE = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  pebruari: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  ags: 8,
  agt: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oct: 10,
  oktober: 10,
  october: 10,
  nov: 11,
  nop: 11,
  november: 11,
  nopember: 11,
  des: 12,
  dec: 12,
  desember: 12,
  december: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function toISO(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const y = year < 100 ? 2000 + year : year
  if (y < 2000 || y > 2100) return null
  // Reject 31 February and friends by round-tripping through UTC. UTC, not local:
  // the app's calendar is Asia/Jakarta and no host timezone may influence this.
  const d = new Date(Date.UTC(y, month - 1, day))
  if (d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) return null
  return `${y}-${pad(month)}-${pad(day)}`
}

interface FoundDate {
  iso: string
  /** The exact substring matched, so it can be stripped off the title. */
  raw: string
  /** Which line it was found on — only a date on line 0 is stripped from the header. */
  lineIndex: number
}

/**
 * First valid date wins, scanning top to bottom. A date-shaped run of digits that is
 * not a real date (`45/99/2026`, or the `50.000` inside `1.250.000`) is rejected by
 * `toISO` and the scan simply continues.
 */
function findDate(lines: string[]): FoundDate | null {
  for (const [lineIndex, line] of lines.entries()) {
    const n = NUMERIC_DATE_RE.exec(line)
    if (n) {
      const iso = toISO(Number(n[1]), Number(n[2]), Number(n[3]))
      if (iso) return { iso, raw: n[0], lineIndex }
    }
    const m = NAMED_DATE_RE.exec(line)
    if (m) {
      const month = MONTHS[m[2]!.toLowerCase()]
      if (month) {
        const iso = toISO(Number(m[1]), month, Number(m[3]))
        if (iso) return { iso, raw: m[0], lineIndex }
      }
    }
  }
  return null
}

function trimEdges(s: string): string {
  return s
    .replace(/^[\s\-–—:,;|.]+/, '')
    .replace(/[\s\-–—:,;|.]+$/, '')
    .trim()
}

interface Extracted {
  name: string
  amount: number
}

function extractLine(line: string): Extracted | null {
  // Price-first form takes priority — it is unambiguous because of the Rp prefix.
  const lead = LEAD_AMOUNT_RE.exec(line)
  if (lead) {
    const amount = parseIdrLoose(lead[1]!)
    const rest = trimEdges(lead[2] ?? '')
    if (amount !== null && rest !== '') return { name: rest, amount }
  }

  const tail = TAIL_AMOUNT_RE.exec(line)
  if (!tail) return null
  const amount = parseIdrLoose(tail[1]!)
  if (amount === null) return null

  const name = trimEdges(line.slice(0, tail.index))
  return { name: name === '' ? 'lainnya' : name, amount }
}

export function fallbackParse(input: ParseInput): ParsedExpense | null {
  const lines = input.rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')

  if (lines.length === 0) return null

  const date = findDate(lines)
  const occurredOn = date?.iso ?? input.todayISO

  /**
   * Header detection, and why it is not simply "the first line has no price".
   *
   * `belanja bulanan 18 Agustus 2026` ends in `2026`, which `extractLine` happily reads
   * as an amount — so a naive check turns the header into a Rp 2.026 item and loses the
   * title. The date is therefore stripped from line 0 FIRST, and what remains decides:
   *
   *   ''                        -> the line was only a date. Skip it, synthesise a title.
   *   no price after stripping  -> it is the header. Take it as the title.
   *   still priced             -> there is no header; line 0 is an item.
   */
  const first = lines[0]!
  const firstWithoutDate =
    date !== null && date.lineIndex === 0 ? trimEdges(first.replace(date.raw, ' ')) : first

  let bodyStart = 0
  let title = ''
  if (firstWithoutDate === '') {
    bodyStart = 1
  } else if (extractLine(firstWithoutDate) === null) {
    bodyStart = 1
    title = firstWithoutDate.slice(0, MAX_TITLE)
  }
  if (title === '') title = `pengeluaran ${occurredOn}`

  const items: ParsedItem[] = []
  for (const line of lines.slice(bodyStart)) {
    if (items.length >= MAX_ITEMS) break
    if (TOTAL_RE.test(line) || BARE_EQUALS_RE.test(line)) continue

    const got = extractLine(line)
    if (got === null) continue // no price -> skip; never emit amount 0

    items.push({
      name: got.name.slice(0, MAX_NAME),
      amount_idr: got.amount,
      category: 'other',
    })
  }

  if (items.length === 0) return null

  return { title, occurred_on: occurredOn, items }
}
