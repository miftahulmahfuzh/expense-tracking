'use client'

import { CollapseIcon, ExpandIcon } from '@/components/ui'
import { cn } from '@/lib/cn'

import { useFullscreen } from './FullscreenProvider'

/*
 * THE GLYPHS MOVED (F12). What used to live here was eight hand-drawn path commands plus a
 * `GLYPH` constant carrying `viewBox`, `stroke-width: 2.5`, `stroke-linecap: square` and
 * mitred joins — and a docblock arguing that installing lucide "for two glyphs would import a
 * library to use 0.2% of it".
 *
 * That argument was right at two glyphs and wrong at twelve, which is where F12 landed. What
 * did NOT change is the reason those numbers were chosen: `components/ui/Icon.tsx` now holds
 * the same 2.5 stroke, the same square caps and the same mitred corners, enforced as props on
 * every glyph instead of remembered in three files. Read that module's docblock before
 * concluding the design gave anything up here.
 */

/**
 * The floating fullscreen toggle. Bottom-right of the month screen, above the tab bar.
 *
 * RENDERED BY `/m/[month]` AND NOWHERE ELSE, which is what keeps it honest: the control is
 * the only way out of the collapsed state, so it must exist on exactly the screen that can
 * enter it. No pathname check here — the route boundary IS the check. `FullscreenProvider`
 * carries the matching gate for the chrome (see the note there about `/stats`).
 *
 * A HARD PLATE — no shadow, no ring, and NOT frosted, which since R-137 makes it one of the
 * deliberate exceptions rather than the norm. It floats over the list and over the wallpaper,
 * and the surfaces it floats over are now themselves glass; a frosted chip on a frosted card
 * is two tints deep and reads as a smudge rather than as a control. So it keeps a solid block
 * of colour and nothing else — elevation here is contrast. Which two colours, and why the
 * obvious choice was wrong, is on the `className` below.
 *
 * GEOMETRY. Fixed to the viewport but constrained to the same `max-w-app` column as the page,
 * copied from `TabBar`, so on a wide viewport it tucks against the column's right edge rather
 * than the window's. Raised by exactly `--spacing-tab` while the bar is out, so it clears it
 * by the 16px the wrapper already pads; when the bar leaves, the translate goes and the chip
 * settles into the space the bar left. Animating `transform` rather than `bottom` keeps the
 * whole thing on the compositor.
 *
 * NOTHING ADJUSTS THE PAGE'S BOTTOM PADDING for it. `pb-tabbar` in `(shell)/layout.tsx`
 * already reserves the bar's height plus 2rem, and the chip is 44px inside that band — so in
 * both states the last row of the list can be scrolled clear of it, with no second
 * measurement to keep in sync.
 */
export function FullscreenToggle() {
  const { active, toggle } = useFullscreen()

  return (
    // pointer-events-none on the band, auto on the chip: the wrapper spans the full width and
    // would otherwise swallow taps meant for the tab bar underneath it.
    // `pb-5.5` is the 8px edge rule as a FLOATING element takes it: 22px to the chip's own
    // bottom edge, so the capsule clears the home indicator instead of landing on it. A docked
    // full-bleed bar measures its last line of type instead.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-5.5">
      {/*
       * THE TRANSLATE LIVES HERE, NOT ON THE BUTTON, and that is not a stylistic choice:
       * `press` gives the button `transform: scale(0.975)` while held, and a second transform
       * on the same element REPLACES it rather than composing with it — the chip would drop
       * 54px the instant your thumb landed on it. One element per transform, so the raise and
       * the tap feedback cannot collide.
       */}
      <div
        className={cn(
          'mx-auto flex max-w-app justify-end px-safe',
          'transition-transform duration-280 ease-out-soft motion-reduce:transition-none',
          /* Out of the tab bar's way while the tab bar is still there. The bar is
             `--spacing-tab` of links PLUS its own `pb-4`, so the raise has to include both or
             the chip sits 6px off its top edge instead of the intended 22px. */
          !active && '-translate-y-[calc(var(--spacing-tab)+1rem)]',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          // A toggle button, so the label stays PUT and `aria-pressed` carries the state.
          // Renaming the control per state is what breaks voice control — "tap mode layar
          // penuh" has to keep working once you are in it.
          aria-pressed={active}
          aria-label="Mode layar penuh"
          className={cn(
            'pointer-events-auto grid size-touch press place-items-center rounded-full',
            /*
             * TWO PLATES, and the first draft got this wrong in a way only dark mode showed.
             * It used the tab bar's own `tab-bg` — #0d0d0d in both schemes — which on true
             * black paper is a black disc on a black page: the glyph floated with no control
             * under it. The bar gets away with that colour because it is EDGE TO EDGE and you
             * read it as a chassis from its shape; an isolated 44px circle has no such cue and
             * has to carry its own contrast.
             *
             * So: `ink` on `paper`, the design's inverting plate — the same trick as the
             * INK_STICKER day headings. Black disc with page-coloured brackets in light, white
             * disc with black brackets in dark, both from one pair of tokens.
             *
             * Collapsed goes YELLOW, because yellow is this system's "you are here" and this
             * is the away-from-default state — the same highlighter as the active tab and the
             * month pill. Its foreground is `tab-bg` rather than `ink`: yellow stays #ffe600 in
             * both schemes, so a theme-reactive foreground would put white on it in dark mode
             * at 1.6:1. `tab-bg` does not flip either, so the pair holds at 15.4:1 everywhere.
             */
            active ? 'bg-yellow text-tab-bg' : 'bg-ink text-paper',
          )}
        >
          {active ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      </div>
    </div>
  )
}
