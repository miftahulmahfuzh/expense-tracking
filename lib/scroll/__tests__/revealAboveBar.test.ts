import { describe, expect, it } from 'vitest'

import { REVEAL_MARGIN, revealDelta } from '../revealAboveBar'

/**
 * The numbers below are the real geometry measured off the bug report screenshot
 * (iPhone XS Max, 414×896 CSS px, standalone PWA, keyboard open):
 *
 *   pane top          128   header = pt-safe-header(44+28) + 44 + pb-3(12)
 *   pane bottom       472   container = --app-h(506) - env(safe-area-inset-bottom)(34)
 *   sticky bar top    334   the bar measured 138px tall — 40% OF THE PANE
 *
 * So the pane is 344px tall and only its top 206px is actually looking at anything.
 */
const PANE_TOP = 128
const PANE_BOTTOM = 472
const BAR_TOP = 334

function geometry(rowTop: number, rowBottom: number, occlusionTop = BAR_TOP) {
  return { paneTop: PANE_TOP, occlusionTop, rowTop, rowBottom, margin: REVEAL_MARGIN }
}

describe('revealDelta', () => {
  it('does not move a row that already clears the bar', () => {
    expect(revealDelta(geometry(200, 300))).toBe(0)
  })

  /*
   * THE REPORTED BUG. `scrollIntoView({ block: 'center' })` centres in the WHOLE pane, so the
   * new item row landed centred on 300 — 44px of name input visible and its error message,
   * category chip and amount field all underneath Simpan.
   */
  it('lifts a row whose lower half is behind the bar', () => {
    // A two-line ItemRow: name 44 + gap 8 + chip/amount 44 + py-3 twice = 120 tall.
    const delta = revealDelta(geometry(240, 360))
    expect(delta).toBe(360 - (BAR_TOP - REVEAL_MARGIN))
    // After scrolling, the whole row sits above the bar with the margin intact.
    expect(360 - delta).toBe(BAR_TOP - REVEAL_MARGIN)
    expect(240 - delta).toBeGreaterThan(PANE_TOP)
  })

  it('lifts a row that the keyboard left entirely behind the bar', () => {
    // Tambah Item centred the row at 495 against the pre-keyboard pane; then --app-h shrank.
    const delta = revealDelta(geometry(435, 555))
    expect(555 - delta).toBe(BAR_TOP - REVEAL_MARGIN)
    expect(435 - delta).toBeGreaterThanOrEqual(PANE_TOP + REVEAL_MARGIN)
  })

  it('scrolls back up for a row above the pane', () => {
    const delta = revealDelta(geometry(40, 160))
    expect(delta).toBe(40 - (PANE_TOP + REVEAL_MARGIN))
    expect(delta).toBeLessThan(0)
    expect(40 - delta).toBe(PANE_TOP + REVEAL_MARGIN)
  })

  /*
   * A row with both field errors is taller than the visible band. Showing its top is the
   * only useful choice — the top is where the name input and its message are.
   */
  it('prefers the top of a row taller than the visible band', () => {
    const delta = revealDelta(geometry(300, 700))
    expect(300 - delta).toBe(PANE_TOP + REVEAL_MARGIN)
  })

  it('treats the pane bottom as the occlusion line when there is no bar', () => {
    expect(revealDelta(geometry(240, 360, PANE_BOTTOM))).toBe(0)
    expect(revealDelta(geometry(400, 520, PANE_BOTTOM))).toBe(520 - (PANE_BOTTOM - REVEAL_MARGIN))
  })

  it('returns whole pixels', () => {
    expect(revealDelta(geometry(240.4, 360.7))).toBe(Math.round(360.7 - BAR_TOP + REVEAL_MARGIN))
  })
})
