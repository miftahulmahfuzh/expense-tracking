import { describe, expect, it } from 'vitest'

import {
  FULLSCREEN_COOKIE,
  FULLSCREEN_MAX_AGE,
  FULLSCREEN_ON,
  fullscreenCookie,
  isFullscreenValue,
  readFullscreenCookie,
} from '@/lib/fullscreen'

/**
 * The month screen's fullscreen preference.
 *
 * Only the codec is tested, because only the codec is testable: the rest of the feature is
 * three components' worth of class names, and this repo has no DOM test environment (no
 * jsdom, no testing-library — see vitest.config.ts). That is the right split. What could
 * silently break here is the READ defaulting the wrong way, and what could break there is
 * visible the moment you open the screen.
 */

describe('isFullscreenValue', () => {
  it('reads the on value', () => {
    expect(isFullscreenValue(FULLSCREEN_ON)).toBe(true)
  })

  it('treats an absent cookie as off', () => {
    expect(isFullscreenValue(undefined)).toBe(false)
    expect(isFullscreenValue(null)).toBe(false)
  })

  /*
   * THE ONE THAT MATTERS. "On" hides the tab bar, so a garbage value defaulting to on would
   * strand someone on a screen whose navigation is off the bottom — recoverable only from
   * devtools. Off is the state that always has an escape hatch painted on it, so off is what
   * anything unrecognised has to mean: a stale value from a previous version of this code, a
   * truncated cookie, or whatever the user typed into devtools themselves.
   */
  it('treats every other value as off, including truthy ones', () => {
    for (const value of ['', '0', 'true', 'yes', 'on', '2', '01', ' 1', '1 ', 'null']) {
      expect(isFullscreenValue(value), `expected ${JSON.stringify(value)} to read as off`).toBe(
        false,
      )
    }
  })
})

describe('fullscreenCookie', () => {
  it('stores the on value with a one-year lifetime', () => {
    const cookie = fullscreenCookie({ on: true, secure: true })

    expect(cookie).toContain(`${FULLSCREEN_COOKIE}=${FULLSCREEN_ON}`)
    expect(cookie).toContain(`max-age=${FULLSCREEN_MAX_AGE}`)
  })

  /*
   * Turning it off DELETES rather than writing a second "off" value, so there is only ever
   * one thing `isFullscreenValue` has to recognise. `max-age=0` is that instruction.
   */
  it('deletes the cookie when turning off', () => {
    const cookie = fullscreenCookie({ on: false, secure: true })

    expect(cookie).toContain('max-age=0')
    expect(cookie.startsWith(`${FULLSCREEN_COOKIE}=;`)).toBe(true)
  })

  it('scopes to the whole site and stays same-site lax', () => {
    // path=/ because the preference is set on /m and read by the layout above it. lax rather
    // than strict so it survives arriving from the home-screen shortcut.
    const cookie = fullscreenCookie({ on: true, secure: true })

    expect(cookie).toContain('path=/')
    expect(cookie).toContain('samesite=lax')
  })

  /*
   * Safari DISCARDS a Secure cookie set over plain http, which would break persistence on
   * localhost only — production would look fine, so this is the flag most likely to be
   * "fixed" by hard-coding it on. The caller passes the protocol; the codec stays pure.
   */
  it('omits secure when the page is not on https', () => {
    expect(fullscreenCookie({ on: true, secure: false })).not.toContain('secure')
    expect(fullscreenCookie({ on: true, secure: true })).toContain('secure')
  })
})

describe('readFullscreenCookie', () => {
  it('finds the value among other cookies', () => {
    expect(readFullscreenCookie(`a=1; ${FULLSCREEN_COOKIE}=${FULLSCREEN_ON}; z=9`)).toBe(true)
  })

  it('tolerates the whitespace browsers actually emit', () => {
    // `document.cookie` joins with "; " but the leading pair has no space, and some
    // environments differ. Nothing here should depend on which.
    expect(readFullscreenCookie(`${FULLSCREEN_COOKIE}=${FULLSCREEN_ON}`)).toBe(true)
    expect(readFullscreenCookie(`x=1;${FULLSCREEN_COOKIE}=${FULLSCREEN_ON}`)).toBe(true)
    expect(readFullscreenCookie(`x=1;   ${FULLSCREEN_COOKIE}=${FULLSCREEN_ON}   `)).toBe(true)
  })

  it('reads an empty cookie jar as off', () => {
    expect(readFullscreenCookie('')).toBe(false)
  })

  it('reads a jar without this cookie as off', () => {
    expect(readFullscreenCookie('authjs.session-token=abc; theme=dark')).toBe(false)
  })

  /*
   * Exact name match. A prefix test would let a future `et-fullscreen-variant` cookie drive
   * this one, and the failure would be a screen with no navigation on it.
   */
  it('does not match a cookie that merely starts with the name', () => {
    expect(readFullscreenCookie(`${FULLSCREEN_COOKIE}-variant=${FULLSCREEN_ON}`)).toBe(false)
    expect(readFullscreenCookie(`not-${FULLSCREEN_COOKIE}=${FULLSCREEN_ON}`)).toBe(false)
  })

  /*
   * THE BUG THIS FUNCTION EXISTS FOR. Cookie deleted (so absent), but a cached RSC payload
   * still carries `initial={true}`. The live jar has to win, or an edge-swipe back from
   * /new lands in a fullscreen the user cannot have navigated away from.
   */
  it('reports off once the cookie is deleted, whatever a stale payload claims', () => {
    const deleted = fullscreenCookie({ on: false, secure: true })
    // What a browser is left holding after that assignment is simply no entry at all.
    expect(deleted).toContain('max-age=0')
    expect(readFullscreenCookie('authjs.session-token=abc')).toBe(false)
  })

  /*
   * The writer and the reader are the two halves of one contract and nothing else checks that
   * they agree: `document.cookie` hands back only the `name=value` pairs, never the attributes
   * the writer appends, so this drops everything after the first `;` the way a browser does.
   */
  it('round-trips the value it writes', () => {
    const written = fullscreenCookie({ on: true, secure: false })
    const [pair = ''] = written.split(';')
    expect(readFullscreenCookie(pair)).toBe(true)
  })
})
