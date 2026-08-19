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
 * A tripwire against re-adding the ghost-click guard, which was a fix for a bug that did not
 * exist.
 *
 * 8d0f652 read "tap Kategori and the picker flashes and vanishes / hold it and the editor jumps
 * to the bottom" as iOS delivering a synthesised second click ~300ms after a tap, and defended
 * against it by making the panel `pointer-events: none` and dropping any click that arrived
 * inside a 280ms window. Both symptoms were in fact the dialog's own scroll offset displacing
 * the panel by exactly its own height — see the `overflow: clip` note in globals.css, which is
 * what actually fixed them.
 *
 * The guard is not harmless. It swallows real input for the first 280ms of every sheet, on every
 * platform, and the sheet it protected was never in danger. If a genuine ghost click is ever
 * demonstrated on a device, reintroduce this deliberately and with the measurement attached —
 * not as a guess.
 */
describe('Sheet has no ghost-click guard', () => {
  const sheet = readFileSync(
    fileURLToPath(new URL('../components/ui/Sheet.tsx', import.meta.url)),
    'utf8',
  )

  it('does not suppress pointer events on open', () => {
    expect(sheet).not.toMatch(/pointerEvents/)
  })

  /*
   * A time window is the shape this mistake takes: "ignore input for N ms after opening". It
   * cannot distinguish a phantom tap from a fast, deliberate one, which is why the real fix had
   * to be geometric.
   */
  it('does not gate its handlers on how long ago it opened', () => {
    expect(sheet).not.toMatch(/ENTRY_MS|openedAt/)
    expect(sheet).not.toMatch(/performance\.now\(\)/)
  })

  /*
   * The scrim tap must stay unconditional. `e.target === dialog` is exact on a modal <dialog>:
   * the ::backdrop's event target is the dialog element itself, so a tap inside the panel can
   * never match it, and no timing test is needed to tell them apart.
   */
  it('closes on a scrim tap with nothing but the identity test', () => {
    expect(sheet).toMatch(/if \(e\.target === dialogRef\.current\) onClose\(\)/)
  })
})
