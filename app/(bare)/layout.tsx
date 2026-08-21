import type * as React from 'react'
import { AppShell } from '@/components/AppShell'

/**
 * The same column, no tab bar: `/`, `/new`, `/e/[id]`, `/s/[token]`.
 *
 * A screen in this group has no tab bar to navigate away with, so it MUST supply its own way
 * out — the design's pattern is a header row of back chevron · mono label · optional action
 * (see `03 App Prototype`'s Detail screen). That header belongs to the screen, because what
 * sits on either side of the label differs per route; F10 does not own screens.
 *
 * NO BOTTOM PADDING, and that is the 8px edge rule (globals.css) rather than an omission.
 * This used to wrap every screen in `pb-safe`, which meant no screen in the group could put
 * anything within 34px of the bottom edge — `/new`'s footer had to cancel it with a negative
 * margin to paint to the edge at all, and `/e/[id]`'s last row sat 62px up. The inset is not
 * a floor every screen wants; it is a decision each screen's bottom-most element makes about
 * its own last row, so it belongs there.
 */
export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div>{children}</div>
    </AppShell>
  )
}
