import type { Ref, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * The footer chrome both stages share.
 *
 * `mt-auto` plus `sticky bottom-0` inside the flex-column scroller pins the bar to the
 * bottom on a short page and floats it over the content on a long one, with no
 * `position: fixed` and therefore nothing to manually offset.
 *
 * NO SAFE-AREA PADDING, and `pb-2` rather than `pb-3` — but for the opposite reason to the
 * one that used to be written here. The column this sits in now runs to the TRUE bottom of
 * the screen (see AddExpenseClient), so this padding is the entire distance between the last
 * control and the physical edge, and it is measured against the home indicator rather than
 * against the safe-area inset.
 *
 * The indicator is a 5px pill sitting 8px off the bottom edge; the inset reserved for it is
 * 34px. Padding by the full inset put "isi manual" 48px up — 35px of blank white above the
 * indicator, which read as the bar having been shoved upward. 8px here matches the pill's
 * own clearance, and the button's 44px tap floor adds 14px of slack under its 16px line box,
 * so the label lands 22px up: level with the indicator, not stacked above it.
 *
 * That does put the tap target within the indicator's band, which is deliberate — a tap is
 * not the system's edge gesture, and the alternative is the gap this replaces.
 *
 * FROSTED as of R-137, and that REVERSES the ruling this comment used to carry. Read the old
 * one before changing it back: the v0.1.0 system floated a 95%-alpha bar with a
 * backdrop-blur, and it was removed because a bar that content recedes under puts a blurred
 * column of rupiah directly behind the total, which reads as smudged digits rather than as
 * depth. That objection still applies here — this bar is `sticky bottom-0` inside the
 * scrolling pane, so its backdrop genuinely does include the item rows sliding under it, not
 * only the wallpaper. R-137 overrules the objection rather than dodging it: the canvas draws
 * this footer frosted, and at the 0.72 tint the rows read as a soft field of colour under a
 * number that is 800-weight `ink` at 11:1. If the smudge ever wins the argument back, the
 * fix is `glass` → `bg-card` on this one element and nothing else moves.
 *
 * `ref` is forwarded because "receding" also means OCCLUDING, and the only component that can
 * report how much of the pane this bar is covering is this one. `lib/scroll/revealAboveBar`
 * reads its live rect rather than assuming a height, because the bar grows a line whenever a
 * validation summary appears.
 */
export function StickyBar({
  children,
  className,
  ref,
}: {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn(
        'glass sticky bottom-0 z-20 mt-auto border-t border-rule px-gutter pt-3 pb-2',
        className,
      )}
    >
      {children}
    </div>
  )
}
