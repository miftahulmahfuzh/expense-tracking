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
 * OPAQUE `bg-card`, and the blur is gone. The previous system floated a 95%-alpha bar with
 * a backdrop-blur so content receded under it; this design has no glass anywhere, and a
 * blurred column of rupiah reads as smudged digits rather than as depth. The top hairline
 * plus a flat white block is the whole separation.
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
        'sticky bottom-0 z-20 mt-auto border-t border-rule bg-card px-gutter pt-3 pb-2',
        className,
      )}
    >
      {children}
    </div>
  )
}
