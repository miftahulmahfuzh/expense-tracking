'use client'

import { useEffect } from 'react'

/**
 * Publishes two CSS custom properties on <html>:
 *
 *   --app-h     usable height in px — the VISUAL viewport, i.e. minus the iOS keyboard
 *   --kb-inset  height of the keyboard overlay in px, 0 when it is closed
 *
 * WHY THIS EXISTS AT ALL. iOS Safari does not shrink the LAYOUT viewport when the keyboard
 * opens; it only shrinks the VISUAL one. So `100dvh` — which tracks the layout viewport —
 * still measures the full screen while the bottom third of it is covered by keys, and a
 * `sticky bottom-0` bar sits underneath them, unreachable. Reading `visualViewport.height`
 * is the only way to know the real number, and this hook is the whole answer to "the Simpan
 * button must not be covered by the keyboard".
 *
 * Consumers style with `height: var(--app-h, 100dvh)` and put the bar `sticky bottom-0`
 * inside a `flex-1 overflow-y-auto` scroller. `100vh` must appear nowhere.
 *
 * Lives in lib/hooks rather than under a route because F07's detail page has the same
 * sticky-bar-over-a-keyboard problem.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport

    const apply = () => {
      const height = viewport ? viewport.height : window.innerHeight
      root.style.setProperty('--app-h', `${Math.round(height)}px`)
      /*
       * `offsetTop` matters: when the page is scrolled inside a pinch-zoom, the visual
       * viewport is offset from the layout one, and ignoring it reports a keyboard that is
       * not there. Clamped at 0 because the two viewports briefly disagree mid-animation.
       */
      const inset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0
      root.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
    }

    apply()
    viewport?.addEventListener('resize', apply)
    // The keyboard opening fires `scroll`, not only `resize`, on some iOS versions.
    viewport?.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)
    window.addEventListener('resize', apply)

    return () => {
      viewport?.removeEventListener('resize', apply)
      viewport?.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
      window.removeEventListener('resize', apply)
      // Remove rather than leave behind: the next route may not be a fixed-height screen,
      // and a stale --app-h would silently constrain it.
      root.style.removeProperty('--app-h')
      root.style.removeProperty('--kb-inset')
    }
  }, [])
}
