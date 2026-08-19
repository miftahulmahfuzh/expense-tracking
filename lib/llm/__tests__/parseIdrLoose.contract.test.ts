import { describe, expect, it } from 'vitest'
import { parseIdrLoose } from '@/lib/format'

/**
 * F04's dependency gate on F03 (plan §Task 2, OQ-2).
 *
 * `fallbackParse` is built directly on `parseIdrLoose`, and F03 owns that function
 * (`lib/format.ts`, reconciliation R-8). This file does not duplicate F03's suite —
 * `tests/format.money.test.ts` is the canonical 46-case table, including the
 * `parseIdrLoose(formatIdr(n)) === n` round-trip property. What lives here is the
 * narrower list of behaviours the regex fallback structurally depends on, so that a
 * later refactor of `lib/format.ts` fails in F04's own suite rather than in a user's
 * expense table a month later.
 *
 * If a case here fails, the fix belongs in `lib/format.ts`. Do NOT write a second
 * copy of the function under `lib/llm/` — that is exactly what R-7/R-8 struck down.
 */
describe('parseIdrLoose — F04 relies on exactly this behaviour', () => {
  const cases: Array<[string, number | null]> = [
    // The 1000× tripwire: a dot is a THOUSANDS separator, never a decimal point.
    ['38500', 38500],
    ['38.500', 38500],
    ['58.850', 58850],
    ['1.234.567', 1_234_567],
    ['2000', 2000],
    ['0', 0],
    // Currency markers, in every casing the corpus contains.
    ['Rp 38.500', 38500],
    ['Rp38.500', 38500],
    ['rp 38.500', 38500],
    ['IDR 38.500', 38500],
    // ribu suffixes, including the spaced and upper-case forms in the corpus.
    ['45k', 45000],
    ['45K', 45000],
    ['45 k', 45000],
    ['45rb', 45000],
    ['45 rb', 45000],
    ['45RB', 45000],
    ['45ribu', 45000],
    // juta suffixes. `1.5jt` is the sloppy dot-as-decimal form; the fallback needs it
    // to read as 1_500_000 rather than null (OQ-2's one open question, now closed).
    ['1jt', 1_000_000],
    ['1,5jt', 1_500_000],
    ['1.5jt', 1_500_000],
    ['4,5jt', 4_500_000],
    ['2 juta', 2_000_000],
    // Nothing defensible to return ⇒ null, so `extractLine` can skip the line rather
    // than emitting a zero-rupiah row.
    ['', null],
    ['abc', null],
    ['-', null],
  ]

  for (const [input, want] of cases) {
    it(`${JSON.stringify(input)} -> ${want}`, () => {
      expect(parseIdrLoose(input)).toBe(want)
    })
  }
})
