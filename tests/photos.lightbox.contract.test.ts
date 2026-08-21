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

describe('viewport geometry — why the controls were invisible on an iPhone', () => {
  /*
   * The bug this pins: the cluster rendered, in the right DOM position, with correct CSS, and
   * was still off-screen on an XS Max while being perfectly fine in desktop Chrome.
   *
   * `position: fixed` on iOS Safari resolves against the LAYOUT viewport, whose bottom edge is
   * underneath Safari's toolbar. A `fixed inset-0` overlay is therefore taller than the visible
   * band, and anything pinned to its bottom renders behind browser chrome. The counter pinned to
   * the TOP was visible the whole time, which is what made it look like the buttons had never
   * shipped.
   *
   * Nothing in lint, typecheck, vitest or `next build` can see this. Only a phone can. So what
   * is asserted here is that the component still USES the mechanism that fixes it.
   */

  it('publishes the visual viewport while it is open', () => {
    expect(code).toContain('useVisualViewport()')
  })

  it('sizes itself from --app-h, with 100dvh only as a fallback', () => {
    expect(code).toContain("height: 'min(var(--app-h, 100dvh), 100dvh)'")
  })

  it('offsets by --vv-top, which is the other half of the same problem', () => {
    // --app-h says how TALL the visible band is; --vv-top says WHERE it is. iOS slides the
    // visual viewport down the layout one; 46px of it, measured on an XS Max.
    expect(code).toContain("top: 'var(--vv-top, 0px)'")
  })

  it('uses inset-x-0, never inset-0, so top/height are not over-constrained', () => {
    // top + bottom + height is three constraints for two degrees of freedom. The browser drops
    // one silently, and this is not the property to leave to chance.
    expect(code).toContain('fixed inset-x-0 z-50')
    expect(code).not.toContain('fixed inset-0 z-50')
  })

  it('clears the home indicator: the cluster is a floating pill, not a full-bleed bar', () => {
    /*
     * `Toast` draws this distinction in globals.css: "a FLOATING pill, so the 8px edge rule
     * applies to its own bottom edge rather than to a line of type inside a full-bleed bar:
     * 22px keeps the whole capsule clear of the home indicator." Shipped as pb-2 (8px), which
     * put three 44px circles onto the indicator rather than above it.
     */
    expect(code).toMatch(/inset-x-0 bottom-0[^"]*pb-5\.5/)
    expect(code).not.toMatch(/inset-x-0 bottom-0[^"]*pb-2/)
  })
})

describe('download: the share sheet is for fingers, not for laptops', () => {
  it('gates the OS share sheet on a coarse pointer', () => {
    /*
     * Card 1a wants the photo in the gallery, and on iOS the share sheet is the only route a web
     * page has to Photos. On a desktop it is a detour — and Chrome on Windows/ChromeOS
     * implements `navigator.share({ files })`, so without this test the download arrow opened a
     * share dialog instead of saving a file. Reported from desktop Chrome.
     */
    expect(code).toContain("window.matchMedia?.('(pointer: coarse)').matches")
    expect(code).toMatch(/if \(\s*touchFirst &&/)
  })

  it('asks about the POINTER, not the user agent', () => {
    // A UA test needs a list of platform strings kept up to date forever; `pointer: coarse` asks
    // the question actually meant. iPadOS reporting MacIntel is the usual way UA tests rot.
    expect(code).not.toMatch(/navigator\.(userAgent|platform)/)
  })

  it('keeps every capability test inside the handler, never at render', () => {
    /*
     * Branching rendered output on a navigator or media capability is a hydration mismatch. The
     * glyph must be identical on the server, on a laptop and on an iPhone.
     *
     * Sliced at `role="dialog"` — the first line of the JSX — rather than at `return (`, which
     * also matches the `return () =>` of every effect cleanup and so began the slice halfway up
     * the component, inside the handlers this is trying to exclude.
     */
    const render = code.slice(code.indexOf('role="dialog"'))
    expect(render).not.toContain('matchMedia')
    expect(render).not.toContain('canShare')
  })
})
