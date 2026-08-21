'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

import { fullscreenCookie } from '@/lib/fullscreen'

export interface FullscreenApi {
  /**
   * Whether the chrome is collapsed RIGHT NOW — the preference AND being on a screen that
   * honours it. Every consumer wants this one, not the raw preference.
   */
  active: boolean
  /** Flip the preference and persist it. */
  toggle: () => void
}

const FullscreenContext = React.createContext<FullscreenApi | null>(null)

export function useFullscreen(): FullscreenApi {
  const ctx = React.useContext(FullscreenContext)
  if (!ctx) throw new Error('useFullscreen must be used inside <FullscreenProvider>')
  return ctx
}

/**
 * Owns the fullscreen preference for the tab-bar group.
 *
 * SEEDED FROM THE SERVER. `initial` is the cookie as `(shell)/layout.tsx` read it, so the
 * first client render agrees with the HTML it is hydrating. Reading the cookie here instead
 * would make the first render wrong and the second right, which is the flash the cookie
 * exists to avoid — see `lib/fullscreen.ts`.
 *
 * WHY `active` IS GATED ON THE PATHNAME, and this is the load-bearing line in the file: the
 * tab bar lives in a layout shared by `/m/[month]` and `/stats`, but the toggle only renders
 * on the month screen. Honouring the preference everywhere in this group would hide the tab
 * bar on `/stats` with no button anywhere to bring it back — a dead end you can only leave
 * by editing a cookie by hand. The preference persists globally; only the month screen acts
 * on it.
 *
 * `startsWith('/m')` mirrors `TabBar`'s own test for the same route, deliberately: if one of
 * them ever learns about a new month URL the other has to as well, and having them written
 * the same way is what makes that findable.
 */
export function FullscreenProvider({
  initial,
  children,
}: {
  initial: boolean
  children: React.ReactNode
}) {
  const [on, setOn] = React.useState(initial)
  const pathname = usePathname()

  const toggle = React.useCallback(() => {
    const next = !on
    setOn(next)
    /*
     * Written straight to `document.cookie` rather than through a Server Function. Setting a
     * cookie server-side means a round trip and a re-render for a state change the user is
     * watching happen under their thumb; this way the animation starts on the same frame as
     * the tap and the persistence is a side effect nobody waits for.
     *
     * Wrapped because a browser with cookies blocked throws here. Losing the persistence is
     * survivable — losing the toggle is not.
     */
    try {
      document.cookie = fullscreenCookie({ on: next, secure: location.protocol === 'https:' })
    } catch {
      // Preference is session-only in this browser. The toggle still works.
    }
  }, [on])

  const value = React.useMemo<FullscreenApi>(
    () => ({ active: on && pathname.startsWith('/m'), toggle }),
    [on, pathname, toggle],
  )

  return <FullscreenContext.Provider value={value}>{children}</FullscreenContext.Provider>
}
