import type { Ref, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * The footer chrome both stages share.
 *
 * `mt-auto` plus `sticky bottom-0` inside the flex-column scroller pins the bar to the
 * bottom on a short page and floats it over the content on a long one, with no
 * `position: fixed` and therefore nothing to manually offset.
 *
 * NO SAFE-AREA PADDING HERE, deliberately. The `(bare)` layout already wraps every screen
 * in `pb-safe`, and the scroller ends above that padding — so the bar clears the home
 * indicator by construction. Adding `env(safe-area-inset-bottom)` again would double it and
 * leave a visible gap under the button on a notched device.
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
        'sticky bottom-0 z-20 mt-auto border-t border-rule bg-card px-gutter pt-3 pb-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
