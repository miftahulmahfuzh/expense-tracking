/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F09 — the share token and the URL built from it.
 *
 *  The token IS the authorisation for /s/[token]: there is no session on that route by
 *  design, so these properties are the whole access-control story.
 *
 *  `mintShareToken` from the plan does not exist. `newShareToken()` in lib/id.ts already
 *  did, and R-42 settled that this app has exactly one CSPRNG id generator — a second one
 *  beside it, with its own alphabet, is the duplication R-7/R-8/R-33 each struck down. What
 *  is asserted here is the CONTRACT that F09 depends on, at the point F09 depends on it, so
 *  a change to lib/id.ts that broke sharing fails a test that names sharing.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest'

import { ID_ENTROPY_BITS, isValidId, newShareToken } from '@/lib/id'
import {
  SHARE_MINT_ATTEMPTS,
  SHARE_PREVIEW_SHOWS_TOTAL,
  SHARE_SHOWS_OWNER_NAME,
  shareUrl,
} from '@/lib/share/config'

describe('the share token', () => {
  it('is 12 URL-safe characters — the shape /s/[token] checks before touching the DB', () => {
    for (let i = 0; i < 200; i++) expect(isValidId(newShareToken())).toBe(true)
  })

  it('never needs percent-encoding, so the URL in a WhatsApp message is the URL we minted', () => {
    for (let i = 0; i < 200; i++) {
      const token = newShareToken()
      expect(encodeURIComponent(token)).toBe(token)
    }
  })

  it('does not repeat across a large sample', () => {
    // Not a randomness test — a birthday collision at 2^72 is ~1e-14 over 20k draws, so a
    // failure here means the generator has been swapped for something with state.
    const seen = new Set<string>()
    for (let i = 0; i < 20_000; i++) seen.add(newShareToken())
    expect(seen.size).toBe(20_000)
  })

  it('carries the 72 bits the threat model is argued from', () => {
    // F09 §2.2: ~7.5e10 years to find one live link at 1,000 guesses/second. If this number
    // ever drops, that entire argument has to be re-made — hence an assertion, not a comment.
    expect(ID_ENTROPY_BITS).toBe(72)
  })
})

describe('shareUrl', () => {
  it('builds an absolute URL from the origin it is given', () => {
    expect(shareUrl('https://expensetracking.online', 'V1StGXR8_Z5j')).toBe(
      'https://expensetracking.online/s/V1StGXR8_Z5j',
    )
  })

  it('takes the origin as an argument, never from the browser', () => {
    // The regression this guards: reading window.location.origin would hand a friend a
    // *.vercel.app preview URL that dies at the next deployment (F09 Open question 6).
    expect(shareUrl.length).toBe(2)
  })
})

describe('the policy defaults', () => {
  it('keeps the rupiah total out of the preview card', () => {
    // WhatsApp renders the card in the chat: bubble, chat list, lock screen, group chat,
    // every forward. Flipping this is a product decision the user makes, not a tidy-up.
    expect(SHARE_PREVIEW_SHOWS_TOTAL).toBe(false)
  })

  it('shows no owner name', () => {
    expect(SHARE_SHOWS_OWNER_NAME).toBe(false)
  })

  it('bounds the mint retry loop', () => {
    expect(SHARE_MINT_ATTEMPTS).toBeGreaterThan(1)
    expect(SHARE_MINT_ATTEMPTS).toBeLessThan(10)
  })
})
