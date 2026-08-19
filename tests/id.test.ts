// F03a Task 3 — lib/id.ts.
//
// These ids are not decorative. `newShareToken()` is the *only* credential guarding
// /s/<token> (F09 §2.2), so the length, the alphabet size and the CSPRNG all have to
// hold. `isValidId` is the cheap shape gate that lets /e/<garbage> 404 without a DB
// round trip, so it must stay in lockstep with the generator's alphabet.

import { describe, expect, it } from 'vitest'
import {
  ID_ALPHABET,
  ID_ENTROPY_BITS,
  ID_LENGTH,
  isValidId,
  newGroupId,
  newId,
  newItemId,
  newPhotoId,
  newShareToken,
} from '@/lib/id'

const ID_RE = /^[0-9A-Za-z_-]{12}$/

describe('constants', () => {
  it('is nanoid(12) per roadmap §4.2', () => {
    expect(ID_LENGTH).toBe(12)
  })

  it('draws from a 64-symbol URL-safe alphabet', () => {
    expect(new Set(ID_ALPHABET).size).toBe(64)
    expect(ID_ALPHABET).toMatch(/^[0-9A-Za-z_-]{64}$/)
  })

  it('is 72 bits of entropy — 12 × log2(64)', () => {
    expect(ID_ENTROPY_BITS).toBe(72)
    expect(ID_ENTROPY_BITS).toBe(ID_LENGTH * Math.log2(new Set(ID_ALPHABET).size))
  })
})

describe('newId', () => {
  it('returns 12 URL-safe symbols', () => {
    const id = newId()
    expect(id).toHaveLength(12)
    expect(id).toMatch(ID_RE)
  })

  it('honours an explicit size (F06 uses 21 for blob pathnames)', () => {
    expect(newId(21)).toHaveLength(21)
    expect(newId(21)).toMatch(/^[0-9A-Za-z_-]{21}$/)
  })

  it('produces no collisions across 20 000 draws', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20_000; i++) seen.add(newId())
    expect(seen.size).toBe(20_000)
  })

  it('uses more than a handful of distinct symbols — catches a broken RNG', () => {
    // A constant or low-period generator shows up here immediately. With 64 symbols and
    // 12 000 draws, seeing fewer than 60 of them is a ~0 probability event.
    const symbols = new Set<string>()
    for (let i = 0; i < 1_000; i++) for (const ch of newId()) symbols.add(ch)
    expect(symbols.size).toBeGreaterThan(59)
  })
})

describe('semantic aliases', () => {
  it('all mint a valid id', () => {
    for (const mint of [newGroupId, newItemId, newPhotoId, newShareToken]) {
      expect(mint()).toMatch(ID_RE)
    }
  })

  it('are independent draws, not a shared cached value', () => {
    expect(newGroupId()).not.toBe(newGroupId())
    expect(newShareToken()).not.toBe(newShareToken())
  })
})

describe('isValidId', () => {
  it('accepts a freshly generated id', () => {
    for (let i = 0; i < 200; i++) expect(isValidId(newId())).toBe(true)
  })

  it('accepts every symbol of the alphabet in a 12-char string', () => {
    // Guards the generator and the validator against drifting apart.
    for (let i = 0; i < ID_ALPHABET.length; i += 12) {
      const chunk = ID_ALPHABET.slice(i, i + 12).padEnd(12, 'a')
      expect(isValidId(chunk)).toBe(true)
    }
  })

  it('rejects anything that is not exactly 12 URL-safe symbols', () => {
    for (const bad of [
      '',
      'short',
      'has spaces!',
      'a'.repeat(11),
      'a'.repeat(13),
      'abcdefghijk/',
      'abcdefghijk+',
      'abcdefghij\n1',
      '../../etc/pw',
    ]) {
      expect(isValidId(bad)).toBe(false)
    }
  })

  it('rejects non-strings', () => {
    for (const bad of [null, undefined, 42, {}, ['a'.repeat(12)]]) {
      expect(isValidId(bad)).toBe(false)
    }
  })
})
