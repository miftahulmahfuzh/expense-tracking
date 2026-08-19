import type * as React from 'react'
import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  /** Optional. The design ships none — the dashed outline is the whole illustration. */
  icon?: React.ReactNode
  /** What is not here yet. Sentence case, no full stop. Renders as the mono eyebrow. */
  title: string
  /** One line telling the reader what to do next. */
  description?: string
  /** A Button or ButtonLink. An empty screen is an invitation, not a shrug. */
  action?: React.ReactNode
  className?: string
}

/**
 * The only centred text in the app, and the only dashed border — a container drawn as
 * not-yet-filled. Both exceptions are deliberate: an empty screen should read as different
 * in kind from a screen with content, not as a screen that failed to load.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-dashed border-rule px-6 py-9 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 text-title opacity-70" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="eyebrow">{title}</p>
      {description && (
        <p className="mx-auto mt-2.5 max-w-[32ch] text-item text-pretty text-ink-2">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
