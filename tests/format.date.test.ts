// F03a Task 6 — the date half of lib/format.ts.
//
// Reconciliation R-10 deleted lib/month.ts: F03 and F07 had each written month
// arithmetic and an Indonesian month-name table. F03's implementation wins; F07's
// TZ-independence tests were judged the better suite and are kept here, pointed at it.
//
// The property under test throughout: Asia/Jakarta is UTC+7 with no DST, ever, so every
// value in this module is a 'YYYY-MM-DD' or 'YYYY-MM' string and the machine's local
// timezone must never be able to change an answer. todayJakartaISO is the one function
// that reads a clock, and it names its timeZone explicitly.

import { afterEach, describe, expect, it } from 'vitest'
import {
  DAY_NAMES_ID,
  MONTH_NAMES_ID,
  MONTH_NAMES_ID_SHORT,
  TZ,
  addMonths,
  currentMonthKey,
  dateLabel,
  dayLabel,
  formatJakartaLong,
  isAfterCurrentMonth,
  isValidDateISO,
  isValidMonthKey,
  monthKey,
  monthLabel,
  monthLabelShort,
  monthRange,
  todayJakartaISO,
} from '@/lib/format'

describe('name tables', () => {
  it('carries 12 Indonesian months, long and short, and 7 days', () => {
    expect(MONTH_NAMES_ID).toHaveLength(12)
    expect(MONTH_NAMES_ID_SHORT).toHaveLength(12)
    expect(DAY_NAMES_ID).toHaveLength(7)
    expect(MONTH_NAMES_ID[0]).toBe('Januari')
    expect(MONTH_NAMES_ID[11]).toBe('Desember')
    expect(MONTH_NAMES_ID_SHORT[7]).toBe('Agu')
    // Sunday-first, matching Date#getUTCDay's indexing.
    expect(DAY_NAMES_ID[0]).toBe('Minggu')
    expect(DAY_NAMES_ID[6]).toBe('Sabtu')
  })

  it('pins the calendar to Asia/Jakarta', () => {
    expect(TZ).toBe('Asia/Jakarta')
  })
})

describe('todayJakartaISO', () => {
  it('stays on the same day at 23:30 Jakarta', () => {
    expect(todayJakartaISO(new Date('2026-08-18T16:30:00Z'))).toBe('2026-08-18')
  })

  it('rolls to the next day at 00:30 Jakarta — the UTC+7 boundary', () => {
    // This is the case that catches a missing `timeZone` option: a naive implementation
    // returns 2026-08-18 here and every expense typed after midnight files a day late.
    expect(todayJakartaISO(new Date('2026-08-18T17:30:00Z'))).toBe('2026-08-19')
  })

  it('crosses the year boundary correctly', () => {
    expect(todayJakartaISO(new Date('2025-12-31T16:59:59Z'))).toBe('2025-12-31')
    expect(todayJakartaISO(new Date('2025-12-31T17:00:00Z'))).toBe('2026-01-01')
  })

  it('zero-pads, so the output always feeds isValidDateISO', () => {
    const iso = todayJakartaISO(new Date('2026-01-05T03:00:00Z'))
    expect(iso).toBe('2026-01-05')
    expect(isValidDateISO(iso)).toBe(true)
    expect(isValidDateISO(todayJakartaISO())).toBe(true)
  })
})

describe('monthKey / currentMonthKey', () => {
  it('slices an ISO date', () => {
    expect(monthKey('2026-08-18')).toBe('2026-08')
  })

  it('reads a Date through the Jakarta clock', () => {
    expect(monthKey(new Date('2026-08-31T17:30:00Z'))).toBe('2026-09')
    expect(currentMonthKey(new Date('2026-08-31T17:30:00Z'))).toBe('2026-09')
    expect(currentMonthKey(new Date('2026-08-31T16:30:00Z'))).toBe('2026-08')
  })

  it('agrees with todayJakartaISO on the live clock', () => {
    expect(currentMonthKey()).toBe(todayJakartaISO().slice(0, 7))
  })
})

describe('monthRange', () => {
  it('is half-open, so February never needs a day count', () => {
    expect(monthRange('2026-08')).toEqual({ startISO: '2026-08-01', endExclusiveISO: '2026-09-01' })
    expect(monthRange('2026-02').endExclusiveISO).toBe('2026-03-01')
    expect(monthRange('2026-12').endExclusiveISO).toBe('2027-01-01')
  })

  it('throws RangeError on a malformed key rather than returning a wrong window', () => {
    // A silently wrong window would return the wrong month's expenses, which looks like
    // data loss to the user. Fail loudly.
    expect(() => monthRange('nope')).toThrow(RangeError)
    expect(() => monthRange('2026-13')).toThrow(RangeError)
    expect(() => monthRange('2026-8')).toThrow(RangeError)
  })
})

describe('addMonths', () => {
  it('crosses year boundaries in both directions', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-08', 0)).toBe('2026-08')
    expect(addMonths('2026-08', -12)).toBe('2025-08')
    expect(addMonths('2026-03', -14)).toBe('2025-01')
    expect(addMonths('2026-08', 12)).toBe('2027-08')
  })

  it('composes back to the identity — the 12-month F08 axis walks 11 steps back', () => {
    let m = '2026-08'
    for (let i = 0; i < 11; i++) m = addMonths(m, -1)
    expect(m).toBe('2025-09')
    for (let i = 0; i < 11; i++) m = addMonths(m, 1)
    expect(m).toBe('2026-08')
  })

  it('throws RangeError on a malformed key', () => {
    expect(() => addMonths('nope', 1)).toThrow(RangeError)
  })
})

describe('isAfterCurrentMonth', () => {
  it('compares zero-padded keys as strings — calendar order, no allocation', () => {
    const now = new Date('2026-08-18T05:00:00Z')
    expect(isAfterCurrentMonth('2026-09', now)).toBe(true)
    expect(isAfterCurrentMonth('2026-08', now)).toBe(false)
    expect(isAfterCurrentMonth('2026-07', now)).toBe(false)
    expect(isAfterCurrentMonth('2027-01', now)).toBe(true)
    expect(isAfterCurrentMonth('2025-12', now)).toBe(false)
  })
})

describe('labels', () => {
  it('renders Indonesian names deterministically', () => {
    expect(monthLabel('2026-08')).toBe('Agustus 2026')
    expect(monthLabelShort('2026-08')).toBe('Agu 26')
    expect(dateLabel('2026-08-18')).toBe('18 Agustus 2026')
    // 18 Aug 2026 really is a Tuesday — it is the roadmap's canonical example.
    expect(dayLabel('2026-08-18')).toBe('Selasa, 18 Agustus 2026')
    expect(dayLabel('2026-01-01')).toBe('Kamis, 1 Januari 2026')
  })

  it('drops the leading zero from the day of month', () => {
    expect(dateLabel('2026-08-01')).toBe('1 Agustus 2026')
  })

  it('passes malformed input straight through instead of throwing in a render', () => {
    // These run inside server components; a throw here is a 500 on a page that could
    // otherwise have rendered. Degrade to the raw value.
    expect(monthLabel('nope')).toBe('nope')
    expect(monthLabelShort('nope')).toBe('nope')
    expect(dateLabel('2026-02-30')).toBe('2026-02-30')
    expect(dayLabel('nope')).toBe('nope')
  })
})

describe('formatJakartaLong (reconciliation R-21)', () => {
  it('is dayLabel — F09 asked for the same string F07 already had', () => {
    expect(formatJakartaLong('2026-08-18')).toBe('Selasa, 18 Agustus 2026')
    for (const iso of ['2026-01-01', '2026-02-28', '2026-12-31', '2025-06-15']) {
      expect(formatJakartaLong(iso)).toBe(dayLabel(iso))
    }
  })
})

describe('timezone independence (kept from F07, per R-10)', () => {
  const previous = process.env.TZ
  afterEach(() => {
    process.env.TZ = previous
  })

  it.each(['Pacific/Kiritimati', 'Pacific/Midway', 'UTC', 'America/New_York'])(
    'renders identical labels with the machine clock set to %s',
    (tz) => {
      process.env.TZ = tz
      expect(dayLabel('2026-08-18')).toBe('Selasa, 18 Agustus 2026')
      expect(dateLabel('2026-08-18')).toBe('18 Agustus 2026')
      expect(formatJakartaLong('2026-08-18')).toBe('Selasa, 18 Agustus 2026')
      expect(monthLabel('2026-08')).toBe('Agustus 2026')
      // UTC+14 and UTC-11 are the extremes; a local-time getter anywhere in the chain
      // shifts the answer by a day at one of them.
      expect(todayJakartaISO(new Date('2026-08-18T16:30:00Z'))).toBe('2026-08-18')
      expect(todayJakartaISO(new Date('2026-08-18T17:30:00Z'))).toBe('2026-08-19')
    },
  )
})

describe('isValidDateISO', () => {
  it('accepts real calendar dates', () => {
    for (const ok of ['2026-08-18', '2026-02-28', '2024-02-29', '2026-12-31', '2026-01-01']) {
      expect(isValidDateISO(ok)).toBe(true)
    }
  })

  it('rejects impossible dates, wrong shapes and non-strings', () => {
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-08-00',
      '2026-08-32',
      '2026-8-1',
      '26-08-18',
      '2026/08/18',
      '2026-08-18T00:00:00Z',
      '',
      'nope',
      null,
      undefined,
      20260818,
    ]) {
      expect(isValidDateISO(bad)).toBe(false)
    }
  })

  it('knows February in a non-leap year', () => {
    expect(isValidDateISO('2025-02-29')).toBe(false)
    expect(isValidDateISO('2024-02-29')).toBe(true)
  })
})

describe('isValidMonthKey', () => {
  it('accepts 01–12 only', () => {
    for (const ok of ['2026-01', '2026-08', '2026-12']) expect(isValidMonthKey(ok)).toBe(true)
    for (const bad of [
      '2026-13',
      '2026-00',
      '2026-8',
      '26-08',
      '2026-08-18',
      'agustus',
      '',
      null,
      undefined,
      202608,
    ]) {
      expect(isValidMonthKey(bad)).toBe(false)
    }
  })
})
