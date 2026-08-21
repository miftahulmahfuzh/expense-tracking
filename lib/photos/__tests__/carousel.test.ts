import { describe, expect, it } from 'vitest'

import {
  isEager,
  isWrappable,
  realIndexFor,
  trackIndexFor,
  trackLength,
  wrapTarget,
} from '../carousel'

/**
 * F12 §3. The whole point of extracting this module is that the off-by-one is checkable
 * without a scroller, a touch or a DOM — so every case below is one the browser would only
 * have shown as "the counter says 3 while photo 2 is on screen".
 */

describe('isWrappable / trackLength', () => {
  it('does not wrap a single photo — the app’s most common case', () => {
    // One receipt on one expense. Sentinels here would be two wasted decodes of the same
    // image to enable a gesture that has nowhere to go.
    expect(isWrappable(1)).toBe(false)
    expect(trackLength(1)).toBe(1)
  })

  it('wraps from two upwards', () => {
    expect(isWrappable(2)).toBe(true)
    expect(trackLength(2)).toBe(4) // [B, A, B, A]
    expect(trackLength(7)).toBe(9)
  })

  it('handles an empty gallery without producing a negative track', () => {
    expect(isWrappable(0)).toBe(false)
    expect(trackLength(0)).toBe(0)
  })
})

describe('trackIndexFor', () => {
  it('offsets by the leading sentinel when there is one', () => {
    expect(trackIndexFor(0, 7)).toBe(1)
    expect(trackIndexFor(6, 7)).toBe(7)
  })

  it('is the identity with no sentinels, so the mount scroll is still 0', () => {
    expect(trackIndexFor(0, 1)).toBe(0)
  })
})

describe('realIndexFor', () => {
  it('maps the body of the track straight through', () => {
    for (let real = 0; real < 7; real++) {
      expect(realIndexFor(trackIndexFor(real, 7), 7)).toBe(real)
    }
  })

  it('reads the leading clone as the LAST photo', () => {
    // Position 0 shows Gn. If this returned 0 the counter would flash "1 / 7" during the
    // wrap from the first photo backwards.
    expect(realIndexFor(0, 7)).toBe(6)
  })

  it('reads the trailing clone as the FIRST photo', () => {
    expect(realIndexFor(8, 7)).toBe(0)
  })

  it('survives n = 2, where every position is a boundary', () => {
    // Track is [B, A, B, A] — indices 0..3.
    expect([0, 1, 2, 3].map((p) => realIndexFor(p, 2))).toEqual([1, 0, 1, 0])
  })

  it('clamps rather than wrapping when there are no sentinels', () => {
    expect(realIndexFor(0, 1)).toBe(0)
    // A rubber-band overscroll can momentarily round to -1 or 1 on a single-slide track.
    expect(realIndexFor(-1, 1)).toBe(0)
    expect(realIndexFor(1, 1)).toBe(0)
  })

  it('never returns NaN or a negative index for an empty gallery', () => {
    expect(realIndexFor(0, 0)).toBe(0)
  })
})

describe('wrapTarget', () => {
  it('sends the leading clone to the real last slide', () => {
    expect(wrapTarget(0, 7)).toBe(7)
  })

  it('sends the trailing clone to the real first slide', () => {
    expect(wrapTarget(8, 7)).toBe(1)
  })

  it('leaves every ordinary position alone', () => {
    for (let pos = 1; pos <= 7; pos++) expect(wrapTarget(pos, 7)).toBeNull()
  })

  it('is a no-op without sentinels, so a single photo never scroll-jumps', () => {
    expect(wrapTarget(0, 1)).toBeNull()
    expect(wrapTarget(1, 1)).toBeNull()
  })

  it('round-trips: the jump target shows the same photo as the clone it replaces', () => {
    // This is the property that makes the jump invisible. If it ever fails, the wrap becomes
    // a visible flick to a different image.
    for (const n of [2, 3, 7]) {
      for (const clone of [0, n + 1]) {
        const target = wrapTarget(clone, n)!
        expect(realIndexFor(target, n)).toBe(realIndexFor(clone, n))
      }
    }
  })
})

describe('isEager', () => {
  it('covers the active cell and both neighbours in TRACK space', () => {
    expect([3, 4, 5].every((p) => isEager(p, 4))).toBe(true)
    expect(isEager(6, 4)).toBe(false)
  })

  it('eager-loads across a sentinel, which a realIndex check would miss', () => {
    // Sitting on the real last photo of 7 (track 7), the trailing clone at 8 is the next
    // thing a swipe reveals. Compared by realIndex, 6 and 0 look four slides apart.
    expect(isEager(8, 7)).toBe(true)
  })
})
