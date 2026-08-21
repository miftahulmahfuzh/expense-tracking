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
 * A card is a flat BLOCK: white on the page grey, black on true black. No border and no
 * shadow — contrast alone is the elevation, exactly like print. (The previous system drew a
 * hairline around every card; the design pull removed it, and removing it is most of why
 * the app now reads as graphic rather than as a form.)
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
        'rounded-card bg-card',
        padded === true && 'p-4',
        padded === 'rows' && 'py-0.5 pr-1.5 pl-4',
        className,
      )}
      {...rest}
    />
  )
}
