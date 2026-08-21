import type * as React from 'react'
import { cookies } from 'next/headers'
import { AppShell } from '@/components/AppShell'
import { FullscreenProvider } from '@/components/fullscreen'
import { TabBar } from '@/components/ui'
import { currentMonthKey } from '@/lib/format'
import { FULLSCREEN_COOKIE, isFullscreenValue } from '@/lib/fullscreen'

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
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  // Server-side, so the client never computes the month from the device clock. The app's
  // calendar is Asia/Jakarta; a device set to UTC-11 would otherwise link to last month.
  const monthHref = `/m/${currentMonthKey()}`

  /*
   * The month screen's fullscreen preference, read here so the collapsed chrome is CORRECT ON
   * FIRST PAINT rather than corrected a frame after hydration. `lib/fullscreen.ts` has the
   * full argument for the cookie over localStorage.
   *
   * `cookies()` opts this layout into dynamic rendering, which costs nothing here: both
   * routes in this group already call `requireUserId()`, so both were dynamic by
   * construction. `next build` must still list them as `ƒ`.
   */
  const fullscreen = isFullscreenValue((await cookies()).get(FULLSCREEN_COOKIE)?.value)

  return (
    <AppShell>
      <FullscreenProvider initial={fullscreen}>
        {/* pb-tabbar clears the 54px bar plus the home indicator, so no screen in this group
            adds bottom padding for the bar itself. It is deliberately NOT reduced in
            fullscreen mode: the band it reserves is what the floating toggle then sits in,
            so the last row clears whichever of the two is on screen. */}
        <div className="pb-tabbar">{children}</div>
        <TabBar monthHref={monthHref} />
      </FullscreenProvider>
    </AppShell>
  )
}
