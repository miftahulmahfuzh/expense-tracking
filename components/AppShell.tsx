import type * as React from 'react'
import { cn } from '@/lib/cn'
import { CutoutArt } from './CutoutArt'

/**
 * The mobile column.
 *
 * On a phone it is the full width. On a wide viewport it centres at 416px — the design
 * canvas is exactly 414 — against a `paper-2` page, so it reads as a deliberate column
 * rather than a stranded phone layout. Desktop is not designed; it is only not broken, which
 * is the whole brief for it. No side rules any more: this design separates surfaces by
 * contrast, and a hairline down each edge was the old system's idiom.
 *
 * THE COLUMN IS THE ART'S FRAME. `CutoutArt` is absolutely positioned to this element, which
 * is why the column is `relative` and why the children are lifted onto their own stacking
 * context with `relative z-10`. Every screen in both route groups therefore gets the
 * wallpaper for free, and any screen that wants to cover it just paints an opaque background
 * — which is exactly what the month header, the cards and the sign-in plate all do.
 *
 * The clipping lives on the ART layer, NOT here, and that is load-bearing: `overflow-hidden`
 * on this element would make it a scroll container, and `/m/[month]`'s sticky header would
 * then stick to a box that never scrolls instead of to the viewport — i.e. it would stop
 * sticking, silently, with nothing failing anywhere.
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
      <div className={cn('relative mx-auto min-h-dvh w-full max-w-app bg-paper', className)}>
        <CutoutArt />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  )
}
