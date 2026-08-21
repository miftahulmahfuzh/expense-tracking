import type { Ref, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * The footer chrome both stages share.
 *
 * `mt-auto` plus `sticky bottom-0` inside the flex-column scroller pins the bar to the
 * bottom on a short page and floats it over the content on a long one, with no
 * `position: fixed` and therefore nothing to manually offset.
 *
 * `pb-safe-bar` rather than a flat `pb-3`, and the column it lives in now runs to the true
 * bottom of the screen (see AddExpenseClient). The bar used to stop at the top of the
 * `(bare)` layout's `pb-safe`, which left a ~34px strip of page background below an
 * otherwise full-bleed white footer — the bar read as a floating slab rather than as the
 * bottom of the screen. Now the white goes all the way down and the utility keeps "isi
 * manual" one home-indicator's height clear of the edge, without stacking the two.
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
        'sticky bottom-0 z-20 mt-auto border-t border-rule bg-card px-gutter pt-3 pb-safe-bar',
        className,
      )}
    >
      {children}
    </div>
  )
}
