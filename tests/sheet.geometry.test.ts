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
})
