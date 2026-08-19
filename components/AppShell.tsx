import type * as React from 'react'
import { cn } from '@/lib/cn'

/**
 * The mobile column.
 *
 * On a phone it is the full width. On a wide viewport it centres at 416px — the design
 * canvas is exactly 414 — against a `paper-2` page, with a hairline down both edges so it
 * reads as a deliberate column rather than a stranded phone layout. Desktop is not
 * designed; it is only not broken, which is the whole brief for it.
 *
 * `min-h-dvh`, never `min-h-screen`: `100vh` on iOS Safari is the URL-bar-collapsed height,
 * so a `100vh` shell is ~80px too tall until you scroll and then leaves a gap at the bottom.
 */
export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="min-h-dvh bg-paper-2">
      <div
        className={cn(
          'mx-auto min-h-dvh w-full max-w-app bg-paper sm:border-x sm:border-rule',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
