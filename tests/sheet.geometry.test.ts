import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * A guard on the ONE declaration that makes the bottom sheet a bottom sheet.
 *
 * This asserts against the stylesheet text, which is not normally worth doing — but the bug
 * it guards is invisible to every other kind of test. `<dialog>` arrives from the UA
 * stylesheet with `width: fit-content; height: fit-content`. `.sheet` overrode the width and
 * not the height, so `height: fit-content` survived; a non-auto height makes `top: 0;
 * bottom: 0` over-constrained, `bottom` loses, and the dialog collapses to the panel's own
 * height at the TOP of the viewport. Verified in WebKit: the dialog computed to 365px instead
 * of 896px, and the sheet painted at the top of the screen with the scrim underneath it.
 *
 * jsdom has no layout and no UA `<dialog>` styles, so it cannot see any of that. A browser
 * test could, and this repo has no browser-test harness. Until it does, this is the tripwire:
 * if someone removes the height, or the `inset: 0` that it has to agree with, this fails.
 */
const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8')

/** The declaration block of a selector, comments stripped. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} not found in globals.css`).toBeGreaterThan(-1)
  const end = css.indexOf('\n  }', start)
  return css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('.sheet geometry', () => {
  it('overrides the UA dialog height so the dialog fills the viewport', () => {
    expect(block('.sheet')).toMatch(/height:\s*100%\s*;/)
  })

  it('still pins to all four viewport edges', () => {
    expect(block('.sheet')).toMatch(/inset:\s*0\s*;/)
    expect(block('.sheet')).toMatch(/position:\s*fixed\s*;/)
  })

  /*
   * The panel is pushed down by the dialog's own box, so a dialog that is not full-height
   * silently disables this. Both halves have to stay for the sheet to sit at the bottom.
   */
  it('bottom-aligns the panel inside that viewport-tall box', () => {
    expect(block('.sheet')).toMatch(/align-items:\s*flex-end\s*;/)
  })

  it('does not reintroduce a max-height that would re-constrain it', () => {
    expect(block('.sheet')).toMatch(/max-height:\s*none\s*;/)
  })

  /*
   * `overflow: hidden` here is a bug, not a style choice — it makes the dialog a SCROLL
   * CONTAINER. The panel spends the entry transition at `translateY(100%)`, one panel-height
   * below this box, and transformed children count toward scrollable overflow: the dialog
   * therefore has exactly one panel-height of scroll range for the length of the animation, and
   * `showModal()`'s focusing steps scroll the panel into view and take it. Measured in WebKit at
   * 414x896: scrollTop 317 of scrollHeight 1213, panel painting at 263..580 instead of 579..896.
   * Desktop WebKit re-clamps when the overflow goes away; iOS does not, which is the whole "the
   * category picker never appears" report. `clip` clips without a scroll container, so there is
   * nothing to displace.
   */
  it('clips instead of scrolling, so the entry transform cannot displace the panel', () => {
    expect(block('.sheet')).toMatch(/overflow:\s*clip\s*;/)
    expect(block('.sheet')).not.toMatch(/overflow:\s*(hidden|auto|scroll)\s*;/)
  })
})

/**
 * `Sheet` swallows pointer input for the span of the entry transition, to discard the ghost
 * click iOS delivers up to ~300ms after a tap. Because the sheet fills the viewport that
 * phantom tap always lands on something of ours — it was selecting a category and closing the
 * picker the instant it opened. The window is a JS constant and the transition is a CSS one; if
 * they drift the guard either ends early (the ghost gets through) or overstays (real taps
 * ignored), and nothing else in the suite can see either failure.
 */
describe('Sheet entry window', () => {
  const sheet = readFileSync(
    fileURLToPath(new URL('../components/ui/Sheet.tsx', import.meta.url)),
    'utf8',
  )

  it('keeps ENTRY_MS in step with the panel transition', () => {
    const js = sheet.match(/const ENTRY_MS = (\d+)/)
    expect(js, 'ENTRY_MS not found in Sheet.tsx').not.toBeNull()

    const declared = block('.sheet-panel').match(/transition:\s*transform\s*(\d+)ms/)
    expect(declared, 'panel transform transition not found in globals.css').not.toBeNull()

    expect(Number(js![1])).toBe(Number(declared![1]))
  })

  it('discards a click that arrives inside that window', () => {
    expect(sheet).toMatch(/performance\.now\(\) - openedAtRef\.current < ENTRY_MS/)
  })

  /*
   * The panel goes inert, never the dialog. `pointer-events: none` on the dialog lets the ghost
   * click fall THROUGH to the sheet stacked behind, and closing the editor under the picker is a
   * worse bug than the one being fixed — it is what "the Ubah item moved to the bottom" was.
   */
  it('makes the panel inert, not the dialog', () => {
    expect(sheet).toMatch(/panel\.style\.pointerEvents = 'none'/)
    expect(sheet).not.toMatch(/dialog\.style\.pointerEvents = 'none'/)
  })
})
