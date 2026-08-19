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
 * A card is a raised surface with a hairline border and NO shadow. Elevation in this design
 * comes from `card` sitting lighter than `paper` plus the `rule` hairline — which is the
 * only elevation that survives dark mode, where a shadow is invisible.
 *
 * Rows inside a card separate with `divide-y divide-rule-2`: `divide-*` puts no border
 * after the last child, so the final row never draws a line against the card's own edge.
 */
export function Card({ as = 'div', padded = true, className, ...rest }: CardProps) {
  // Widened to ElementType so one set of handler types serves every tag in the union —
  // otherwise TS demands the props be LiHTMLAttributes the moment `as="li"` is possible.
  const Tag = as as React.ElementType
  return (
    <Tag
      className={cn(
        'rounded-card border border-rule bg-card',
        padded === true && 'p-4',
        padded === 'rows' && 'py-0.5 pr-1.5 pl-4',
        className,
      )}
      {...rest}
    />
  )
}
