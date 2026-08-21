import type * as React from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** The element to render. `ul`/`li` for a real list; `div` otherwise. */
  as?: 'div' | 'section' | 'article' | 'ul' | 'li'
  /**
   * `true` (default) — the standard 16px inset, for prose and stat tiles.
   * `'rows'` — 16px left / 6px right / 2px vertical: the inset a list of rows wants, so
   *   the separators run the full width of the text column and a 44px delete target can
   *   sit flush to the right edge without looking crammed.
   * `false` — no padding at all.
   */
  padded?: boolean | 'rows'
}

/**
 * A card is a FROSTED BLOCK (R-137): the `glass` tint over a 14px blur of whatever the page
 * has behind it, which on every screen in both route groups is the cut-out wallpaper (R-47).
 * It was a flat white block until R-137, and it is still flat — no border and no shadow,
 * contrast alone is the elevation, exactly like print. What changed is that the elevation now
 * has the art showing through it, which is what R-133 built a whole fullscreen mode to get.
 *
 * `glass` and not `bg-card`: the tint is only ever correct together with its blur and its
 * ink-3 collapse, and `bg-card` is the opaque fallback the shared rule reaches for by itself
 * when the browser has no `backdrop-filter` or the reader has asked for less transparency.
 *
 * Rows inside a card separate with `divide-y divide-rule`: `divide-*` puts no border after
 * the last child, so the final row never draws a line against the card's own edge — the one
 * hairline this design keeps.
 */
export function Card({ as = 'div', padded = true, className, ...rest }: CardProps) {
  // Widened to ElementType so one set of handler types serves every tag in the union —
  // otherwise TS demands the props be LiHTMLAttributes the moment `as="li"` is possible.
  const Tag = as as React.ElementType
  return (
    <Tag
      className={cn(
        'glass rounded-card',
        padded === true && 'p-4',
        padded === 'rows' && 'py-0.5 pr-1.5 pl-4',
        className,
      )}
      {...rest}
    />
  )
}
