import type { ReactNode } from 'react'

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
 * `bg-card/95 backdrop-blur` rather than an opaque fill: content scrolling under the bar
 * should be legible-but-receding, which is what tells you there is more list below.
 */
export function StickyBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 mt-auto border-t border-rule bg-card/95 px-gutter pt-3 pb-3 backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  )
}
