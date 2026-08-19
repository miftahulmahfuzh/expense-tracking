// F03a Tasks 4+5 — the money half of lib/format.ts.
//
// The tables in docs/plans/F03-data-layer.md §8 ARE the specification: "if the
// implementation and the table disagree, the table wins". Every row below is copied
// from there, so this file is the contract, not a sample of it.
//
// The one rule worth restating: in Indonesian notation "." is the THOUSANDS separator
// and "," is the decimal comma. "38.500" is thirty-eight thousand five hundred.

import { describe, expect, it } from 'vitest'
import { formatIdr, formatIdrCompact, formatIdrDigits, parseIdrLoose } from '@/lib/format'

/* --------------------------------------------------------------- §8.1 formatIdr */

const FORMAT_CASES: ReadonlyArray<readonly [number, string, string]> = [
  [0, 'Rp 0', 'empty month / empty group'],
  [500, 'Rp 500', 'below the first group boundary'],
  [1000, 'Rp 1.000', 'first separator'],
  [26000, 'Rp 26.000', 'canonical example, pak gembus 26k'],
  [38500, 'Rp 38.500', "roadmap §4.7's literal example"],
  [58850, 'Rp 58.850', 'canonical example, non-round value'],
  [266350, 'Rp 266.350', 'roadmap §1 canonical group total'],
  [1250000, 'Rp 1.250.000', 'two separators'],
  [1000000000, 'Rp 1.000.000.000', '§4.3 maximum item amount'],
  [-45000, '-Rp 45.000', 'sign goes outside Rp, never "Rp -45.000"'],
  [38500.4, 'Rp 38.500', 'rounds down'],
  [38500.6, 'Rp 38.501', 'rounds up'],
  [Number.NaN, 'Rp 0', 'never renders "Rp NaN" in the UI'],
]

describe('formatIdr (§8.1)', () => {
  it.each(FORMAT_CASES)('formatIdr(%p) === %p — %s', (n, expected) => {
    expect(formatIdr(n)).toBe(expected)
  })

  it('emits a plain ASCII space, not the non-breaking space Intl would give us', () => {
    // This is the whole reason D-F refuses Intl.NumberFormat here: the glyph id-ID
    // emits has changed across ICU releases, and §4.7 specifies a literal string.
    expect(formatIdr(38500)).toBe('Rp 38.500')
    expect(formatIdr(38500)).not.toContain(' ')
  })

  it('survives the infinities without rendering one', () => {
    expect(formatIdr(Number.POSITIVE_INFINITY)).toBe('Rp 0')
    expect(formatIdr(Number.NEGATIVE_INFINITY)).toBe('Rp 0')
  })
})

/* --------------------------------------------------- R-8 / F10 D-3 formatIdrDigits */

describe('formatIdrDigits (reconciliation R-8, accepting F10 D-3)', () => {
  it('is formatIdr without the prefix, so Money can typeset "Rp" separately', () => {
    expect(formatIdrDigits(38500)).toBe('38.500')
    expect(formatIdrDigits(0)).toBe('0')
    expect(formatIdrDigits(1000000000)).toBe('1.000.000.000')
  })

  it('is the sole digit-grouping implementation — formatIdr is built on it', () => {
    for (const [n] of FORMAT_CASES) {
      const digits = formatIdrDigits(n)
      expect(formatIdr(n)).toBe(digits.startsWith('-') ? `-Rp ${digits.slice(1)}` : `Rp ${digits}`)
    }
  })

  it('keeps the sign inline (callers that split it pass an absolute value)', () => {
    expect(formatIdrDigits(-45000)).toBe('-45.000')
  })

  it('degrades a non-finite amount to "0"', () => {
    expect(formatIdrDigits(Number.NaN)).toBe('0')
  })
})

/* ------------------------------------------------------ §8.1b formatIdrCompact */

const COMPACT_CASES: ReadonlyArray<readonly [number, string]> = [
  [0, 'Rp 0'],
  [950, 'Rp 950'],
  [1000, 'Rp 1rb'],
  [9500, 'Rp 9,5rb'],
  [45000, 'Rp 45rb'],
  [266350, 'Rp 266rb'],
  [1500000, 'Rp 1,5jt'],
  [12000000, 'Rp 12jt'],
  [1234567890, 'Rp 1,2M'],
]

describe('formatIdrCompact (§8.1b)', () => {
  it.each(COMPACT_CASES)('formatIdrCompact(%p) === %p', (n, expected) => {
    expect(formatIdrCompact(n)).toBe(expected)
  })

  it('uses the Indonesian decimal comma, never a dot', () => {
    expect(formatIdrCompact(9500)).toContain(',')
    expect(formatIdrCompact(9500)).not.toContain('.')
  })

  it('puts the sign outside Rp, like formatIdr', () => {
    expect(formatIdrCompact(-45000)).toBe('-Rp 45rb')
  })
})

/* ---------------------------------------------------- §8.2 parseIdrLoose accepts */

const PARSE_OK: ReadonlyArray<readonly [string, number, string]> = [
  ['38500', 38500, 'bare integer'],
  ['38.500', 38500, '"." is a THOUSANDS separator in Indonesian'],
  ['Rp 38.500', 38500, 'roadmap §4.7 example'],
  ['Rp. 38.500', 38500, 'Rp. with a dot'],
  ['Rp38.500', 38500, 'no space'],
  ['rp 38.500', 38500, 'lowercase'],
  ['  38.500  ', 38500, 'surrounding whitespace'],
  ['1.250.000', 1250000, 'two thousands separators'],
  ['1.234.567.890', 1234567890, '> §4.3 max — the parser does not clamp, Zod rejects downstream'],
  ['38.500,00', 38500, 'full id-ID form: "." thousands + "," decimals'],
  ['Rp 1.250.000,-', 1250000, 'Indonesian invoice tail'],
  ['45k', 45000, 'k suffix'],
  ['45K', 45000, 'case-insensitive'],
  ['45rb', 45000, 'rb suffix'],
  ['45 rb', 45000, 'space before suffix'],
  ['45ribu', 45000, 'full word'],
  ['45 ribu', 45000, 'full word with space'],
  ['100rb', 100000, ''],
  ['3,5rb', 3500, 'fractional thousand, comma decimal'],
  ['12.5k', 12500, 'fractional thousand, dot as decimal because the suffix disambiguates'],
  ['1jt', 1000000, 'jt suffix'],
  ['1,5jt', 1500000, 'roadmap §4.7 example'],
  ['1.5jt', 1500000, "same value, dot form (F04's prompt must produce both)"],
  ['1,25jt', 1250000, 'two decimal digits'],
  ['2,5 juta', 2500000, 'full word'],
  ['IDR 45.000', 45000, 'IDR prefix'],
  ['75.000 rupiah', 75000, 'rupiah suffix word'],
  ['0', 0, 'zero is valid (min(0))'],
  ['49k', 49000, 'canonical example'],
  ['58850', 58850, 'canonical example'],
  ['12,000', 12000, 'US-style comma-thousands degrades gracefully (3 trailing digits ⇒ thousands)'],
  ['45.000k', 45000000, 'thousands group inside a suffixed number; documented, not an accident'],
  ['1,5', 2, 'no suffix, 1 trailing digit ⇒ decimal ⇒ Math.round(1.5). Defined, not accidental'],
  ['4 5 0 0 0', 45000, 'whitespace is stripped first — listed in §8.3 so nobody "fixes" it'],
]

describe('parseIdrLoose — accepted (§8.2)', () => {
  it.each(PARSE_OK)('parseIdrLoose(%p) === %p — %s', (input, expected) => {
    expect(parseIdrLoose(input)).toBe(expected)
  })

  it('returns integers, never floats', () => {
    for (const [input] of PARSE_OK) {
      expect(Number.isInteger(parseIdrLoose(input))).toBe(true)
    }
  })

  it('never returns a negative — expenses are ≥ 0', () => {
    for (const [input] of PARSE_OK) {
      expect(parseIdrLoose(input)!).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('parseIdrLoose ∘ formatIdr round-trip (§7 Task 5)', () => {
  // Every value the user can see must survive being re-typed. This is the property
  // that catches a formatter and a parser drifting apart.
  it.each(PARSE_OK)('parseIdrLoose(formatIdr(%p → %p)) === %p', (_input, expected) => {
    expect(parseIdrLoose(formatIdr(expected))).toBe(expected)
  })

  it.each(FORMAT_CASES.filter(([n]) => Number.isFinite(n) && n >= 0))(
    'round-trips the §8.1 row %p',
    (n) => {
      const rounded = Math.round(n)
      expect(parseIdrLoose(formatIdr(rounded))).toBe(rounded)
    },
  )
})

/* ------------------------------------------------------- §8.3 parseIdrLoose null */

const PARSE_NULL: ReadonlyArray<readonly [unknown, string]> = [
  ['', 'empty'],
  ['   ', 'whitespace only'],
  ['abc', 'no digits'],
  ['seratus ribu', "words are F04's job, not the input field's"],
  ['Rp', 'currency marker with no number'],
  ['45k5', 'suffix not at the end'],
  ['12,,3', 'malformed separators'],
  ['-5000', 'negatives are not expenses'],
  ['1e5', 'no scientific notation'],
  [null, 'defensive typeof guard'],
  [undefined, 'defensive typeof guard'],
  [42, 'defensive typeof guard'],
  [{}, 'defensive typeof guard'],
  [['45000'], 'defensive typeof guard'],
]

describe('parseIdrLoose — must return null (§8.3)', () => {
  it.each(PARSE_NULL)('parseIdrLoose(%p) === null — %s', (input) => {
    expect(parseIdrLoose(input as string)).toBeNull()
  })
})
