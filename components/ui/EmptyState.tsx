import type * as React from 'react'
import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  /** Optional. The design ships none — the pink plate is the whole illustration. */
  icon?: React.ReactNode
  /** What is not here yet. Sentence case, no full stop. Renders as the headline. */
  title: string
  /** One line telling the reader what to do next. */
  description?: string
  /** A Button or ButtonLink. An empty screen is an invitation, not a shrug. */
  action?: React.ReactNode
  className?: string
}

/**
 * A PINK PLATE with a dashed edge and a 22px/900 headline — not an apology.
 *
 * This is the only centred text in the app and the only dashed border, and both exceptions
 * are deliberate: an empty screen should read as different in kind from a screen with
 * content, not as a screen that failed to load. The pink is one of the design's two big
 * background moments (the other is the sign-in screen), which is why it is worth spending
 * on a state the user should see rarely and understand instantly.
 *
 * The headline is `ink`, not the eyebrow it used to be: on pink in dark mode (#2a1518) the
 * page's own ink is what stays readable, and the plate carries the "this is empty" signal
 * on its own.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-dashed border-ink-3 bg-pink px-6 py-9 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 text-title opacity-70" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-headline">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-[32ch] text-body text-pretty text-ink-2">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
