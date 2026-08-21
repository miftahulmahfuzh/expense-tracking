/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The Lightbox's gesture and chrome contract — F12, after a regression that shipped in F06
 *  and survived until someone tried to swipe.
 *
 *  These are source assertions, not renders: the suite runs on `environment: 'node'`, and more
 *  to the point NONE of this is observable without a real touchscreen. jsdom has no scroll-snap,
 *  no momentum, no `touch-action` and no two-finger gesture — a component test would have
 *  reported the broken swipe as passing, which is exactly how it lasted this long.
 *
 *  So each assertion below pins a specific VALUE whose wrongness is invisible in review and
 *  invisible in CI, and says what breaks when it changes.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

const LIGHTBOX = 'components/photos/Lightbox.tsx'
const source = readFileSync(resolve(repoRoot, LIGHTBOX), 'utf8')

/** Source with comments stripped: every forbidden value is DISCUSSED in the docblocks. */
const code = source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('touch-action — the value that decides whether paging works at all', () => {
  it('is pan-x on the image at rest, never none', () => {
    /*
     * `touch-action: none` means the browser performs no default touch behaviour for a touch
     * starting on this element, INCLUDING scrolling an ancestor scroll container — and the
     * scroll-snap track is an ancestor. With `none`, a one-finger swipe beginning on the photo
     * does not page.
     *
     * It is only broken where it matters: `object-contain` leaves letterbox bars on a wide
     * viewport, and swiping those hits the host div and works fine. On a phone in portrait with
     * a portrait receipt there is almost no bar to grab.
     */
    expect(code).toContain("touchAction: 'pan-x'")
    expect(code, 'touch-action: none at rest kills one-finger paging').not.toMatch(
      /touchAction:\s*'none'\s*\}/,
    )
  })

  it('flips to none while zoomed, so a pan does not flick to the next photo', () => {
    expect(code).toMatch(/touchAction\s*=\s*scale > 1 \? 'none' : 'pan-x'/)
  })

  it('sets it imperatively, alongside the transform, not through React', () => {
    // A setState per frame inside a 60 Hz pinch is the difference between smooth and laggy.
    expect(code).toMatch(/el\.style\.touchAction/)
  })

  it('still withholds pinch-zoom, which is what the original `none` was protecting', () => {
    // `pan-x` permits horizontal panning ONLY. Safari cannot page-zoom the document, so the
    // two-finger gesture stays ours — which was the correct half of F06's reasoning.
    expect(code).not.toContain("touchAction: 'auto'")
    expect(code).not.toContain("touchAction: 'manipulation'")
  })
})

describe('the scroll track', () => {
  it('keeps native snap paging rather than a JS pager', () => {
    expect(code).toContain('scrollSnapType')
    expect(code).toContain("scrollSnapStop: 'always'")
  })

  it('disables horizontal overflow only while zoomed', () => {
    expect(code).toMatch(/overflowX:\s*zoomed \? 'hidden' : 'auto'/)
  })

  it('registers touch listeners as NON-passive', () => {
    // React attaches touchmove at the root as passive, so preventDefault() inside an onTouchMove
    // JSX prop is a silent no-op — Safari page-zooms and the photo never scales.
    expect(code).toMatch(/\{\s*passive:\s*false\s*\}/)
  })

  it('wraps on settle rather than during momentum', () => {
    // Rewriting scrollLeft mid-fling makes iOS reapply the remaining velocity from the new
    // offset: the photo jerks and can overshoot two slides.
    expect(code).toContain('scrollend')
    expect(code).toContain('wrapTarget')
    expect(code).toMatch(/behavior:\s*'auto'/)
  })
})

describe('the floating chrome (card 1a–1e)', () => {
  it('renders all four controls', () => {
    for (const icon of ['CloseIcon', 'DownloadIcon', 'ShareIcon', 'TrashIcon']) {
      expect(code, `${icon} is missing from the viewer`).toContain(`<${icon} />`)
    }
  })

  it('puts the cluster bottom-right and the close button top-right', () => {
    expect(code).toMatch(/absolute inset-x-0 bottom-0[^"]*items-end/)
    expect(code).toMatch(/absolute inset-x-0 top-0[^"]*justify-between/)
  })

  it('gates share and delete on their props, and NEVER download', () => {
    /*
     * This is the security property, not a styling choice: `onShare`/`onDelete` are Server
     * Actions that /s/[token] and /f/[token] must not reach, so their icons appear only where
     * the prop is wired. Download is pure client work and is therefore always available —
     * including to a public viewer, which is the point of card 1a.
     */
    expect(code).toMatch(/\{onShare && \(/)
    expect(code).toMatch(/\{onDelete && \(/)
    // The footer itself is unconditional.
    expect(code).not.toMatch(/\{hasCluster/)
  })

  it('keeps the header pointer-events-none with an opt-in on the button', () => {
    // The header spans the full width over the photo. Without this, its empty half swallows
    // taps meant for the image underneath — including the tap that dismisses.
    expect(code).toContain('pointer-events-none absolute inset-x-0 top-0')
    expect(code).toContain('pointer-events-auto')
  })

  it('labels every icon button, since none of them shows its word', () => {
    expect(code).toMatch(/aria-label=\{COPY\.close\}/)
    expect(code).toMatch(/label=\{COPY\.download\}/)
    expect(code).toMatch(/label=\{COPY\.share\}/)
    expect(code).toMatch(/label=\{COPY\.delete\}/)
  })

  it('warms the download and the share on pointerdown', () => {
    // navigator.share() must be called while the gesture is still live; awaiting a fetch or a
    // Server Action spends WebKit's activation window. Without warming, both fail exactly on the
    // slow connection where the user needs them.
    expect(code).toMatch(/onPointerDown=\{warmDownload\}/)
    expect(code).toMatch(/onPointerDown=\{warmShare\}/)
  })
})
