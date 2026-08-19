import type * as React from 'react'
import { AppShell } from '@/components/AppShell'
import { TabBar } from '@/components/ui'
import { currentMonthKey } from '@/lib/format'

/**
 * The tab-bar group. Route groups do not affect URLs, so this adds chrome without changing
 * a single path.
 *
 * WHAT LIVES HERE: `/m/[month]` and `/stats` — the two tab destinations.
 *
 * WHAT DOES NOT, and why (reconciliation R-25 plus design R-38):
 *  - `/new` is a focused compose flow with its own primary action at the bottom of the
 *    page; a tab bar under that button fights it.
 *  - `/e/[id]` is a *pushed* view reached from the month list, not a tab destination. It
 *    gets a header with a back chevron instead, which is the platform convention the
 *    thumb already expects. This reverses F07's original plan.
 *  - `/s/[token]` is public and has no navigation at all.
 *  - `/` decides between a landing page and a redirect (F02) and needs no chrome either way.
 *
 * A root-layout TabBar could not be removed by a nested layout, which is why the split is a
 * route group rather than a conditional.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  // Server-side, so the client never computes the month from the device clock. The app's
  // calendar is Asia/Jakarta; a device set to UTC-11 would otherwise link to last month.
  const monthHref = `/m/${currentMonthKey()}`

  return (
    <AppShell>
      {/* pb-tabbar clears the 54px bar plus the home indicator, so no screen in this group
          adds bottom padding for the bar itself. */}
      <div className="pb-tabbar">{children}</div>
      <TabBar monthHref={monthHref} />
    </AppShell>
  )
}
