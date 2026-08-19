import { describe, expect, it } from 'vitest'

import {
  formatDayShort,
  formatIdrAxis,
  formatMtdRange,
  monthMedium,
  monthsBetween,
  monthTickLabel,
} from '../format'

describe('monthTickLabel', () => {
  it('gives the bare three-letter Indonesian month', () => {
    expect(monthTickLabel('2026-01')).toBe('Jan')
    expect(monthTickLabel('2026-05')).toBe('Mei')
    expect(monthTickLabel('2026-08')).toBe('Agu')
    expect(monthTickLabel('2026-12')).toBe('Des')
  })

  it('falls back to the input rather than rendering "undefined" on a bad key', () => {
    expect(monthTickLabel('2026-13')).toBe('2026-13')
  })
})

describe('monthMedium', () => {
  it('carries the full year', () => {
    expect(monthMedium('2026-08')).toBe('Agu 2026')
    expect(monthMedium('2025-12')).toBe('Des 2025')
  })
})

describe('monthsBetween', () => {
  it('is signed and crosses years', () => {
    expect(monthsBetween('2026-06', '2026-08')).toBe(2)
    expect(monthsBetween('2026-08', '2026-06')).toBe(-2)
    expect(monthsBetween('2026-08', '2026-08')).toBe(0)
    expect(monthsBetween('2025-09', '2026-08')).toBe(11)
    expect(monthsBetween('2020-01', '2026-08')).toBe(79)
  })
})

describe('formatIdrAxis', () => {
  it('drops the Rp prefix and keeps F03 suffixes', () => {
    expect(formatIdrAxis(0)).toBe('0')
    expect(formatIdrAxis(950)).toBe('950')
    expect(formatIdrAxis(45_000)).toBe('45rb')
    expect(formatIdrAxis(266_350)).toBe('266rb')
    expect(formatIdrAxis(1_500_000)).toBe('1,5jt')
    expect(formatIdrAxis(2_418_350)).toBe('2,4jt')
    expect(formatIdrAxis(12_000_000)).toBe('12jt')
    expect(formatIdrAxis(2_000_000_000)).toBe('2M')
  })

  it('never leaks a stray "Rp"', () => {
    for (const n of [0, 1, 999, 1000, 1e6, 1e9]) {
      expect(formatIdrAxis(n)).not.toContain('Rp')
    }
  })
})

describe('formatDayShort', () => {
  it('renders the tight meta-line date', () => {
    expect(formatDayShort('2026-08-18')).toBe('18 Agu 2026')
    expect(formatDayShort('2026-01-01')).toBe('1 Jan 2026')
  })
})

describe('formatMtdRange', () => {
  it('spells out the comparison window', () => {
    expect(formatMtdRange('2026-07', 19)).toBe('1–19 Jul 2026')
    expect(formatMtdRange('2026-02', 1)).toBe('1–1 Feb 2026')
  })
})
