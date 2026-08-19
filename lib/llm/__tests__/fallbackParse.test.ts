import { describe, expect, it } from 'vitest'
import { ParsedExpense } from '@/lib/schema/expense'
import { FIXTURES, fixture } from '../__fixtures__'
import { fallbackParse } from '../fallbackParse'

/**
 * The fallback exists so the user is never hard-blocked by an LLM failure. It is
 * deliberately dumb: line by line, trailing amount via `parseIdrLoose`, name is the
 * rest, category is always `other`. It produces something *editable*, not something
 * *correct* — F05 shows a "cek lagi" banner whenever it runs.
 *
 * Pure and synchronous: no network, no clock, no I/O. Every case below is exact.
 */
const run = (rawText: string, todayISO = '2026-08-19') => fallbackParse({ rawText, todayISO })

describe('fallbackParse — always returns something Zod-valid or null', () => {
  it('every fixture yields a Zod-valid ParsedExpense', () => {
    for (const fx of FIXTURES) {
      const out = fallbackParse({ rawText: fx.rawText, todayISO: fx.todayISO })
      expect(out, fx.id).not.toBeNull()
      expect(() => ParsedExpense.parse(out), fx.id).not.toThrow()
    }
  })

  it('returns null when nothing is parseable', () => {
    expect(run('')).toBeNull()
    expect(run('   \n\n  ')).toBeNull()
    expect(run('besok jangan jajan lagi\ncatatan: hemat')).toBeNull()
  })
})

describe('fallbackParse — amounts', () => {
  it('extracts the trailing amount and never divides by 1000', () => {
    const out = run('roti buaya 38500\nayam sambal hitam 45k\ntisu 12.000')!
    expect(out.items.map((i) => i.amount_idr)).toEqual([38500, 45000, 12000])
  })

  it('handles Rp-prefixed and price-first lines', () => {
    const out = run('Rp 38.500 roti buaya\nbensin motor Rp45.000')!
    expect(out.items.map((i) => i.amount_idr)).toEqual([38500, 45000])
    expect(out.items.map((i) => i.name)).toEqual(['roti buaya', 'bensin motor'])
  })

  it('does NOT multiply a quantity prefix by the trailing total', () => {
    const out = run('2x nasi goreng 60k')!
    expect(out.items[0]!.amount_idr).toBe(60000)
    expect(out.items[0]!.name).toBe('2x nasi goreng')
  })

  it('gets every canonical amount exactly right', () => {
    const fx = fixture('canonical')
    const out = fallbackParse({ rawText: fx.rawText, todayISO: fx.todayISO })!
    expect(out.items.map((i) => i.amount_idr)).toEqual(fx.expect.amounts)
  })
})

describe('fallbackParse — skipping', () => {
  it('drops total / subtotal / jumlah lines', () => {
    for (const line of [
      'total 44000',
      'totalnya 44.000',
      'Total: Rp 44.000',
      'subtotal 44000',
      'sub total 44000',
      'grand total 44000',
      'jumlah 44.000',
      'semua 44rb',
      '= 44.000',
    ]) {
      const out = run(`seblak 22k\ncireng 10k\n${line}`)!
      expect(out.items.length, line).toBe(2)
    }
  })

  it('drops priceless lines rather than emitting amount 0', () => {
    const out = run('seblak 22k\nbayar pake qris\nbesok hemat\nes teh 5000')!
    expect(out.items.map((i) => i.amount_idr)).toEqual([22000, 5000])
    expect(out.items.some((i) => i.amount_idr === 0)).toBe(false)
  })

  it('drops blank lines', () => {
    const out = run('nasi padang 32k\n\n\ngorengan 10k')!
    expect(out.items.length).toBe(2)
  })

  it('caps at 50 items', () => {
    const many = Array.from({ length: 80 }, (_, i) => `item ${i} 1000`).join('\n')
    expect(run(many)!.items.length).toBe(50)
  })
})

describe('fallbackParse — dates', () => {
  it('reads DD/MM/YYYY as Indonesian, not US', () => {
    expect(run('header - 18/8/2026\nkopi 20k')!.occurred_on).toBe('2026-08-18')
    // 12/8 would be ambiguous under a US reading; the Indonesian reading must win.
    expect(run('header - 12/8/2026\nkopi 20k')!.occurred_on).toBe('2026-08-12')
  })

  it('handles dash and dot separators', () => {
    expect(run('senin - 3-8-2026\nkopi 20k')!.occurred_on).toBe('2026-08-03')
    expect(run('senin - 3.8.2026\nkopi 20k')!.occurred_on).toBe('2026-08-03')
  })

  it('handles two-digit years', () => {
    expect(run('x - 18/8/26\nkopi 20k')!.occurred_on).toBe('2026-08-18')
  })

  it('handles Indonesian and English month names', () => {
    expect(run('belanja 18 Agustus 2026\nberas 75.000')!.occurred_on).toBe('2026-08-18')
    expect(run('belanja 18 Ags 2026\nberas 75.000')!.occurred_on).toBe('2026-08-18')
    expect(run('belanja 18 Aug 2026\nberas 75.000')!.occurred_on).toBe('2026-08-18')
    expect(run('belanja 9 Sep 2026\nberas 75.000')!.occurred_on).toBe('2026-09-09')
  })

  it('falls back to todayISO when there is no date', () => {
    expect(run('nasi padang 32k', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })

  it('ignores day names as dates', () => {
    expect(run('senin boros\nkopi 20k', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })

  it('rejects impossible dates and falls back', () => {
    expect(run('x - 45/99/2026\nkopi 20k', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })

  it('is not fooled by a large dotted amount', () => {
    expect(run('laptop 1.234.567', '2026-08-19')!.occurred_on).toBe('2026-08-19')
  })
})

describe('fallbackParse — title', () => {
  it('strips the date off the header line', () => {
    expect(run('bakar duit tuesday - 18/8/2026\nkopi 20k')!.title).toBe('bakar duit tuesday')
    expect(run('belanja bulanan 18 Agustus 2026\nberas 75.000')!.title).toBe('belanja bulanan')
    expect(run('18/8/2026 jajan sore\nkopi 20k')!.title).toBe('jajan sore')
  })

  it('keeps the day name in the title', () => {
    expect(run('senin boros - 3-8-2026\nkopi 20k')!.title).toBe('senin boros')
  })

  it('synthesises a title when there is no header', () => {
    const out = run('nasi padang 32k\nes teh 5000', '2026-08-19')!
    expect(out.title).toBe('pengeluaran 2026-08-19')
  })

  it('synthesises when the header is only a date', () => {
    const out = run('18/8/2026\nkopi 20k')!
    expect(out.title).toBe('pengeluaran 2026-08-18')
  })

  it('truncates a very long title to 120 chars', () => {
    const long = 'a'.repeat(300)
    expect(run(`${long}\nkopi 20k`)!.title.length).toBeLessThanOrEqual(120)
  })
})

describe('fallbackParse — names and categories', () => {
  it('categorises everything as other — it does not guess', () => {
    const out = run('ayam geprek 25k\nbensin 50k')!
    expect(out.items.every((i) => i.category === 'other')).toBe(true)
  })

  it('keeps the user wording verbatim, minus the price and separators', () => {
    const out = run('pak gembus - 26k\nfan fries plaza blok m 58850')!
    expect(out.items.map((i) => i.name)).toEqual(['pak gembus', 'fan fries plaza blok m'])
  })

  it('names an anonymous priced line "lainnya"', () => {
    expect(run('kopi 20k\n15000')!.items[1]!.name).toBe('lainnya')
  })

  it('truncates names to 120 chars', () => {
    const out = run(`${'x'.repeat(300)} 25k`)!
    expect(out.items[0]!.name.length).toBeLessThanOrEqual(120)
  })

  it('preserves item order', () => {
    const out = run('a 1000\nb 2000\nc 3000')!
    expect(out.items.map((i) => i.name)).toEqual(['a', 'b', 'c'])
  })
})
