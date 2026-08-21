import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { repoRoot } from '../../../tests/support/importGraph'
import { viewportGeometry } from '../useVisualViewport'

/**
 * iPhone XS Max, standalone PWA: 414×896 CSS px, safe-area-inset-bottom 34.
 * The keyboard-open numbers are measured off the original bug report screenshot — the
 * keyboard plus its accessory bar took 390px, leaving a 506px visual viewport, and iOS had
 * slid that viewport 46px down the layout one to reveal the focused item name.
 */
const INNER = 896
const KEYBOARD_OPEN = { innerHeight: INNER, height: 506, offsetTop: 46, scale: 1 }

describe('viewportGeometry', () => {
  it('is a no-op with the keyboard closed', () => {
    expect(viewportGeometry({ innerHeight: INNER, height: INNER, offsetTop: 0, scale: 1 })).toEqual(
      {
        appHeight: 896,
        top: 0,
        keyboardInset: 0,
      },
    )
  })

  /*
   * THE BUG. --app-h alone described a 506px-tall app anchored at layout y=0 while the user
   * was looking at layout [46, 552] — so the header hung off the top and a 46px band of bare
   * page background sat under the Simpan bar, visible in the screenshot.
   */
  it('reports the slide that put dead space under the sticky bar', () => {
    expect(viewportGeometry(KEYBOARD_OPEN)).toEqual({
      appHeight: 506,
      top: 46,
      keyboardInset: 344,
    })
  })

  it('lines the app up with the band the user can see', () => {
    const { appHeight, top } = viewportGeometry(KEYBOARD_OPEN)
    // `top: var(--vv-top)` + `height: var(--app-h)` == the visual viewport, exactly.
    expect(top).toBe(KEYBOARD_OPEN.offsetTop)
    expect(top + (appHeight as number)).toBe(KEYBOARD_OPEN.offsetTop + KEYBOARD_OPEN.height)
    // Which is also why a larger slide cannot push the bar behind the keys: the container
    // tracks the visible band rather than growing past it.
    const deeper = viewportGeometry({ ...KEYBOARD_OPEN, offsetTop: 300 })
    expect(deeper.top + (deeper.appHeight as number)).toBe(300 + KEYBOARD_OPEN.height)
  })

  /* ── pinch-zoom ─────────────────────────────────────────────────────────── */

  it('publishes nothing while pinch-zoomed', () => {
    // 2× halves the visual viewport; treating that as chrome would halve the app's height.
    expect(viewportGeometry({ innerHeight: INNER, height: 448, offsetTop: 200, scale: 2 })).toEqual(
      {
        appHeight: null,
        top: 0,
        keyboardInset: 0,
      },
    )
  })

  it('does not mistake float noise in scale for a zoom', () => {
    const noisy = viewportGeometry({ ...KEYBOARD_OPEN, scale: 1.0000001 })
    expect(noisy.appHeight).toBe(506)
    expect(noisy.top).toBe(46)
  })

  /* ── mid-animation nonsense ─────────────────────────────────────────────── */

  it('clamps a negative offsetTop reported mid-animation', () => {
    expect(viewportGeometry({ ...KEYBOARD_OPEN, offsetTop: -3 }).top).toBe(0)
  })

  it('never reports a negative keyboard inset', () => {
    expect(
      viewportGeometry({ innerHeight: INNER, height: 900, offsetTop: 0, scale: 1 }).keyboardInset,
    ).toBe(0)
  })

  it('rounds to whole pixels', () => {
    const g = viewportGeometry({ innerHeight: 896, height: 505.7, offsetTop: 45.8, scale: 1 })
    expect(g).toEqual({ appHeight: 506, top: 46, keyboardInset: 345 })
  })
})

describe('the ref count (F12) — two consumers now share these vars', () => {
  /*
   * `AddExpenseClient` holds the vars for the whole /new flow; the Lightbox needs them while it
   * is open, and is reachable from the PhotoPicker on that very screen. Before the count, the
   * Lightbox's cleanup removed `--app-h` from under /new — whose effect has an empty dependency
   * array and would not republish until the next resize or scroll, so the sticky Simpan bar
   * would jump back behind the keyboard, intermittently.
   *
   * Asserted on the source because the counter is module state behind a hook, and this suite has
   * no React renderer: `environment: 'node'`, no jsdom.
   */
  const src = readFileSync(resolve(repoRoot, 'lib/hooks/useVisualViewport.ts'), 'utf8')

  it('counts consumers rather than assuming there is one', () => {
    expect(src).toMatch(/let consumers = 0/)
    expect(src).toMatch(/consumers \+= 1/)
    expect(src).toMatch(/consumers -= 1/)
  })

  it('removes the custom properties ONLY when the last consumer unmounts', () => {
    expect(src).toMatch(/if \(consumers === 0\) \{/)
    // Every removal must sit inside that guard, or the count is decorative.
    const guarded = src.slice(src.indexOf('if (consumers === 0)'))
    for (const prop of ['--app-h', '--vv-top', '--kb-inset']) {
      expect(guarded, prop).toContain(`removeProperty('${prop}')`)
    }
  })
})
