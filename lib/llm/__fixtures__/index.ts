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
      // F14 split `food` five ways, so several of these now allow more than one answer:
      // the corpus cannot decide whether a warung item was an ordinary meal or a treat
      // bought out, and both readings are correct. The tripwire this file exists for is
      // `amounts`, not `categories`.
      ['jajan', 'meals'],
      ['meals', 'dining'],
      // "perumahan laddaland" is a FILM TITLE — the user confirmed it was a cinema
      // ticket (OQ-1, closed 2026-08-19). The literal word "perumahan" means housing,
      // which is why GLM used to answer `housing` here. F14 gave the cinema its own
      // category, and the system prompt names this exact title in its `cinema` examples.
      ['cinema'],
      ['cinema'],
      ['jajan', 'meals', 'dining'],
      ['jajan', 'meals'],
    ],
  }),

  f('bills-only', '02-bills-only.txt', '2026-09-01', {
    title: 'tagihan agustus',
    occurredOn: '2026-08-05',
    itemCount: 5,
    amounts: [385000, 200000, 50000, 25000, 150000],
    total: 810000,
    // F14: indihome is now `internet` and token listrik is now `utilities`; only the
    // remainder stays `bills`. This fixture is the one that proves that narrowing.
    categories: [['internet'], ['utilities'], ['bills'], ['bills'], ['bills', 'health']],
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
    categories: [['meals'], ['drinks'], ['parking'], ['jajan'], ['drinks']],
  }),

  f('mixed-units', '05-mixed-units.txt', '2026-09-01', {
    title: 'campur aduk',
    occurredOn: '2026-08-12',
    itemCount: 7,
    amounts: [4500000, 1250000, 185000, 45000, 27500, 12000, 2000],
    total: 6021500,
    // `groceries` was deleted by F14 as unused: tisu falls to `other`, permen to `snacks`.
    categories: [[], [], [], [], [], ['other'], ['snacks']],
  }),

  f('with-total', '06-with-total-line.txt', '2026-09-01', {
    title: 'jajan sore rabu',
    occurredOn: '2026-08-20',
    itemCount: 3, // the `total 44000` line must NOT be an item
    amounts: [22000, 10000, 12000],
    total: 44000,
    categories: [['jajan'], ['jajan'], ['drinks']],
  }),

  f('id-month', '07-indonesian-month.txt', '2026-09-01', {
    title: 'belanja bulanan',
    occurredOn: '2026-08-18',
    itemCount: 4,
    amounts: [75000, 38000, 32000, 24500],
    total: 169500,
    // Every item here was `groceries`, the category F14 deleted because the user never
    // used it. They land in `other`, which is exactly where the migration puts them too.
    categories: [['other'], ['other'], ['other'], ['other']],
  }),

  f('dayname-dash', '08-dayname-dash-date.txt', '2026-09-01', {
    title: 'senin boros',
    occurredOn: '2026-08-03',
    itemCount: 4,
    amounts: [27000, 25000, 22000, 31000],
    total: 105000,
    categories: [['transport'], ['meals'], ['drinks'], ['transport']],
  }),

  f('quantities', '09-quantities-and-notes.txt', '2026-09-01', {
    title: 'jumat malam',
    occurredOn: '2026-08-22',
    itemCount: 4, // "bayar pake qris" and "besok jangan jajan lagi" are dropped
    amounts: [60000, 50000, 8000, 5000],
    total: 123000,
    categories: [['meals'], ['meals'], ['drinks'], []],
  }),

  f('rp-prefixed', '10-rp-prefixed.txt', '2026-09-01', {
    title: 'kamis',
    occurredOn: '2026-08-21',
    itemCount: 4,
    amounts: [38500, 45000, 12500, 5000],
    total: 101000,
    // F14: bensin is `fuel` and parkir is `parking`; the tol keeps `transport`.
    categories: [['jajan', 'meals'], ['fuel'], ['transport'], ['parking']],
  }),

  f('single-line', '11-single-line.txt', '2026-08-19', {
    title: null,
    occurredOn: '2026-08-19',
    itemCount: 1,
    amounts: [25000],
    total: 25000,
    categories: [['meals']],
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
