'use client'

import { useEffect } from 'react'

/**
 * Publishes three CSS custom properties on <html>:
 *
 *   --app-h     usable height in px — the VISUAL viewport, i.e. minus the iOS keyboard
 *   --vv-top    how far the visual viewport has slid DOWN the layout viewport, 0 normally
 *   --kb-inset  height of the keyboard overlay in px, 0 when it is closed
 *
 * WHY THIS EXISTS AT ALL. iOS Safari does not shrink the LAYOUT viewport when the keyboard
 * opens; it only shrinks the VISUAL one. So `100dvh` — which tracks the layout viewport —
 * still measures the full screen while the bottom third of it is covered by keys, and a
 * `sticky bottom-0` bar sits underneath them, unreachable. Reading `visualViewport.height`
 * is the only way to know the real number, and this hook is the whole answer to "the Simpan
 * button must not be covered by the keyboard".
 *
 * Consumers style with `height: var(--app-h, 100dvh)`, offset by `top: var(--vv-top, 0px)`
 * (see below), and put the bar `sticky bottom-0` inside a `flex-1 overflow-y-auto` scroller.
 * `100vh` must appear nowhere.
 *
 * Lives in lib/hooks rather than under a route because F07's detail page has the same
 * sticky-bar-over-a-keyboard problem.
 */

/**
 * `scale` is a float and comes back as 1.0000001 often enough that `> 1` would call an
 * unzoomed viewport zoomed and refuse to publish any geometry at all.
 */
export const ZOOM_TOLERANCE = 0.01

export type ViewportMetrics = {
  /** window.innerHeight — the LAYOUT viewport, which the keyboard does not shrink. */
  innerHeight: number
  /** visualViewport.height */
  height: number
  /** visualViewport.offsetTop */
  offsetTop: number
  /** visualViewport.scale */
  scale: number
}

export type ViewportGeometry = {
  /** px for --app-h, or null to UNSET it so consumers fall back to their `100dvh` default. */
  appHeight: number | null
  /** px for --vv-top. */
  top: number
  /** px for --kb-inset. */
  keyboardInset: number
}

/**
 * The whole decision, as a pure function so it can be tested against measured device numbers
 * instead of against a browser.
 */
export function viewportGeometry({
  innerHeight,
  height,
  offsetTop,
  scale,
}: ViewportMetrics): ViewportGeometry {
  /*
   * PINCH-ZOOM IS NOT A KEYBOARD, and telling them apart is what `scale` is for.
   *
   * Zooming to 2× halves `visualViewport.height` and moves `offsetTop` continuously as the
   * user pans. Feeding either into layout means the app resizes and slides itself while
   * somebody is trying to read it — at 2× the column would collapse to half height and then
   * chase the pan, which is worse than the bug this hook exists to fix and defeats the
   * pinch-zoom that `app/layout.tsx` deliberately keeps enabled.
   *
   * So above 1× we publish NOTHING and let the layout viewport carry the fallback. The cost
   * is that zooming while the keyboard is open puts the sticky bar back behind the keys until
   * the user zooms out; that is a two-gesture corner, and a pannable page is the right
   * behaviour for it.
   */
  if (scale > 1 + ZOOM_TOLERANCE) return { appHeight: null, top: 0, keyboardInset: 0 }

  return {
    appHeight: Math.round(height),
    /*
     * At 1× a non-zero `offsetTop` means exactly one thing: iOS is revealing the focused
     * field. The layout viewport does not shrink for the keyboard, so when the document
     * cannot scroll Safari slides the VISUAL viewport down the layout one instead. Anything
     * laid out from layout y=0 is then off by this much — the app's own header is pushed off
     * the top of the screen and an equal band of bare page background appears under the
     * sticky bar, measured at 46px on an iPhone XS Max. Consumers cancel it with
     * `top: var(--vv-top)`, which lands them back on the band the user can actually see.
     *
     * Clamped at 0 because the two viewports briefly disagree mid-animation and report a
     * small negative offset.
     */
    top: Math.max(0, Math.round(offsetTop)),
    // Also needs offsetTop: a visual viewport that has slid down is not a keyboard, and
    // ignoring the slide reports one that is not there.
    keyboardInset: Math.max(0, Math.round(innerHeight - height - offsetTop)),
  }
}

/**
 * How many mounted consumers are publishing right now.
 *
 * REF-COUNTED FROM F12, because there are now two. `AddExpenseClient` holds these vars for the
 * whole /new flow, and F06's Lightbox — reachable from the PhotoPicker on that very screen —
 * needs them too while it is open. Without the count, closing the Lightbox ran ITS cleanup and
 * removed `--app-h` from under /new, whose effect has an empty dependency array and would not
 * re-publish until the next resize or scroll. The sticky Simpan bar would jump behind the
 * keyboard again, and only sometimes, which is the worst kind.
 *
 * Module scope rather than a context: the vars live on `document.documentElement`, so the thing
 * being counted is genuinely global. Under React StrictMode's double-invoke the count goes
 * 1 → 0 → 1 and the second mount's `apply()` republishes immediately, so the transient removal
 * is invisible.
 */
let consumers = 0

export function useVisualViewport(): void {
  useEffect(() => {
    consumers += 1
    const root = document.documentElement
    const viewport = window.visualViewport

    const apply = () => {
      const geometry: ViewportGeometry = viewport
        ? viewportGeometry({
            innerHeight: window.innerHeight,
            height: viewport.height,
            offsetTop: viewport.offsetTop,
            scale: viewport.scale,
          })
        : { appHeight: Math.round(window.innerHeight), top: 0, keyboardInset: 0 }

      if (geometry.appHeight === null) root.style.removeProperty('--app-h')
      else root.style.setProperty('--app-h', `${geometry.appHeight}px`)
      root.style.setProperty('--vv-top', `${geometry.top}px`)
      root.style.setProperty('--kb-inset', `${geometry.keyboardInset}px`)
    }

    apply()
    viewport?.addEventListener('resize', apply)
    // `scroll` is not optional: sliding the visual viewport down to reveal a field changes
    // only offsetTop, and on some iOS versions the keyboard opening fires scroll and not
    // resize. --vv-top would otherwise stay stale at exactly the moment it matters.
    viewport?.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)
    window.addEventListener('resize', apply)

    return () => {
      viewport?.removeEventListener('resize', apply)
      viewport?.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
      window.removeEventListener('resize', apply)
      /*
       * Remove rather than leave behind: the next route may not be a fixed-height screen, and a
       * stale --app-h would silently constrain it.
       *
       * ONLY WHEN THE LAST CONSUMER GOES, though — see `consumers` above. Removing while another
       * mounted consumer still depends on these would break that one silently.
       */
      consumers -= 1
      if (consumers === 0) {
        root.style.removeProperty('--app-h')
        root.style.removeProperty('--vv-top')
        root.style.removeProperty('--kb-inset')
      }
    }
  }, [])
}
