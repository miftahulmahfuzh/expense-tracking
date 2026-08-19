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
 * `pb-safe` rather than `pb-tabbar`: content only has to clear the home indicator here.
 */
export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="pb-safe">{children}</div>
    </AppShell>
  )
}
