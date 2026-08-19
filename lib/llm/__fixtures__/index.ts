import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Category } from '@/lib/categories'

/**
 * The corpus is the spine of F04 (plan §Task 1). Twelve realistic Indonesian pastes,
 * each a plain `.txt` so it can also be pasted into the app by hand for manual QA.
 *
 * `expect` is the tripwire for the 1000× money bug: `.` is a THOUSANDS separator in
 * Indonesian, so `38.500` is 38500 and never 38.5. Both `fallbackParse` (offline) and
 * GLM-5.2 (`npm run test:live`) are measured against exactly these numbers.
 *
 * Test-only module. Nothing in `app/` or `lib/` outside `__tests__` may import it —
 * it reads from disk at import time, which has no place in a request path.
 *
 * `import.meta.url`, not `__dirname`: the repo is ESM under `verbatimModuleSyntax`,
 * and `__dirname` is a CommonJS-only global that happens to work under some bundlers.
 */
const DIR = fileURLToPath(new URL('.', import.meta.url))

function load(file: string): string {
  return readFileSync(join(DIR, file), 'utf8')
}

export interface Fixture {
  id: string
  file: string
  rawText: string
  /**
   * todayISO to hand the parser — deliberately different from the in-text date so a
   * parser that ignores the text and echoes today is caught immediately.
   */
  todayISO: string
  /** Exact expectations. `null` on a field means "no strong expectation". */
  expect: {
    title: string | null
    occurredOn: string
    itemCount: number
    /** Ordered, exact. This is the 1000× tripwire. */
    amounts: number[]
    total: number
    /** Per-item allowed categories. Empty array = anything goes. */
    categories: Category[][]
  }
}

const f = (id: string, file: string, todayISO: string, expect: Fixture['expect']): Fixture => ({
  id,
  file,
  rawText: load(file),
  todayISO,
  expect,
})

export const FIXTURES: Fixture[] = [
  f('canonical', '01-canonical.txt', '2026-09-01', {
    title: 'bakar duit tuesday',
    occurredOn: '2026-08-18',
    itemCount: 6,
    amounts: [38500, 45000, 49000, 49000, 58850, 26000],
    total: 266350,
    categories: [
      ['food'],
      ['food'],
      // "perumahan laddaland" is a film title, but the literal word "perumahan"
      // means housing. See the plan's OQ-1. Accept either rather than encode a guess.
      ['entertainment', 'housing', 'other'],
      ['entertainment'],
      ['food'],
      ['food'],
    ],
  }),

  f('bills-only', '02-bills-only.txt', '2026-09-01', {
    title: 'tagihan agustus',
    occurredOn: '2026-08-05',
    itemCount: 5,
    amounts: [385000, 200000, 50000, 25000, 150000],
    total: 810000,
    categories: [['bills'], ['bills'], ['bills'], ['bills'], ['bills', 'health']],
  }),

  f('apartment-ipl', '03-apartment-ipl.txt', '2026-09-15', {
    title: 'urusan apartemen',
    occurredOn: '2026-09-01',
    itemCount: 4,
    amounts: [4500000, 1350000, 275000, 50000],
    total: 6175000,
    categories: [['housing'], ['bills', 'housing'], ['housing', 'bills'], []],
  }),

  f('messy', '04-messy-no-date-no-header.txt', '2026-08-19', {
    title: null, // synthesised — any non-empty string
    occurredOn: '2026-08-19', // falls back to todayISO
    itemCount: 5,
    amounts: [32000, 5000, 3000, 10000, 18000],
    total: 68000,
    categories: [['food'], ['food'], ['transport'], ['food'], ['food']],
  }),

  f('mixed-units', '05-mixed-units.txt', '2026-09-01', {
    title: 'campur aduk',
    occurredOn: '2026-08-12',
    itemCount: 7,
    amounts: [4500000, 1250000, 185000, 45000, 27500, 12000, 2000],
    total: 6021500,
    categories: [[], [], [], [], [], ['groceries', 'other'], ['food', 'groceries']],
  }),

  f('with-total', '06-with-total-line.txt', '2026-09-01', {
    title: 'jajan sore rabu',
    occurredOn: '2026-08-20',
    itemCount: 3, // the `total 44000` line must NOT be an item
    amounts: [22000, 10000, 12000],
    total: 44000,
    categories: [['food'], ['food'], ['food']],
  }),

  f('id-month', '07-indonesian-month.txt', '2026-09-01', {
    title: 'belanja bulanan',
    occurredOn: '2026-08-18',
    itemCount: 4,
    amounts: [75000, 38000, 32000, 24500],
    total: 169500,
    categories: [['groceries'], ['groceries'], ['groceries'], ['groceries']],
  }),

  f('dayname-dash', '08-dayname-dash-date.txt', '2026-09-01', {
    title: 'senin boros',
    occurredOn: '2026-08-03',
    itemCount: 4,
    amounts: [27000, 25000, 22000, 31000],
    total: 105000,
    categories: [['transport'], ['food'], ['food'], ['transport']],
  }),

  f('quantities', '09-quantities-and-notes.txt', '2026-09-01', {
    title: 'jumat malam',
    occurredOn: '2026-08-22',
    itemCount: 4, // "bayar pake qris" and "besok jangan jajan lagi" are dropped
    amounts: [60000, 50000, 8000, 5000],
    total: 123000,
    categories: [['food'], ['food'], ['food'], []],
  }),

  f('rp-prefixed', '10-rp-prefixed.txt', '2026-09-01', {
    title: 'kamis',
    occurredOn: '2026-08-21',
    itemCount: 4,
    amounts: [38500, 45000, 12500, 5000],
    total: 101000,
    categories: [['food'], ['transport'], ['transport'], ['transport']],
  }),

  f('single-line', '11-single-line.txt', '2026-08-19', {
    title: null,
    occurredOn: '2026-08-19',
    itemCount: 1,
    amounts: [25000],
    total: 25000,
    categories: [['food']],
  }),

  f('health', '12-health-transport.txt', '2026-10-01', {
    title: 'sakit lagi',
    occurredOn: '2026-09-09',
    itemCount: 4,
    amounts: [150000, 87500, 65000, 24000],
    total: 326500,
    categories: [['health'], ['health'], ['health'], ['transport']],
  }),
]

export const CANONICAL = FIXTURES[0]!

export function fixture(id: string): Fixture {
  const found = FIXTURES.find((x) => x.id === id)
  if (!found) throw new Error(`no fixture ${id}`)
  return found
}
