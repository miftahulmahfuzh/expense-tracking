import Link from 'next/link'

import { Money } from '@/components/ui'
import { cn } from '@/lib/cn'
import { addMonths, isAfterCurrentMonth, monthLabel, type MonthKey } from '@/lib/format'

import type { MonthSummary } from './buckets'

/**
 * The sticky month header: chevron · month · chevron, then THE number.
 *
 * A server component. It holds no state and takes no callbacks, so making it a client
 * component would ship `Money`, `cn` and the whole month-arithmetic module to the browser to
 * render two links.
 *
 * `bg-paper` is opaque rather than translucent-with-blur: rows scrolling under a blurred
 * money column read as smudged digits, and this design earns its layers from hairlines
 * (design R-36), not from glass.
 */

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <span aria-hidden="true" className="text-title leading-none">
      {dir === 'prev' ? '‹' : '›'}
    </span>
  )
}

const CHEVRON_BOX = 'grid size-touch shrink-0 place-items-center rounded-field'

export function MonthHeader({ month, summary }: { month: MonthKey; summary: MonthSummary }) {
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)

  /*
   * You can never page into the future. A month that has not happened has nothing in it, and
   * an infinite corridor of empty months is a worse answer than a wall.
   *
   * Rendered as a <span>, not a disabled <button>: it must not be focusable, must not
   * navigate and must not start a client transition. `aria-disabled` keeps it announced, so a
   * screen reader user learns the wall exists rather than finding a control that does nothing.
   */
  const nextBlocked = isAfterCurrentMonth(next)

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper pt-safe-header px-safe pb-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/m/${prev}`}
          aria-label={`Bulan sebelumnya, ${monthLabel(prev)}`}
          className={cn(CHEVRON_BOX, '-ml-2.5 press text-ink-2')}
        >
          <Chevron dir="prev" />
        </Link>

        {/* The route's one <h1>. Mono chrome label, not a serif screen title: the month is
            navigation, and the serif is reserved for the expense titles below it. */}
        <h1 className="eyebrow">{monthLabel(month)}</h1>

        {nextBlocked ? (
          <span aria-disabled="true" className={cn(CHEVRON_BOX, '-mr-2.5 text-rule')}>
            <Chevron dir="next" />
          </span>
        ) : (
          <Link
            href={`/m/${next}`}
            aria-label={`Bulan berikutnya, ${monthLabel(next)}`}
            className={cn(CHEVRON_BOX, '-mr-2.5 press text-ink-2')}
          >
            <Chevron dir="next" />
          </Link>
        )}
      </div>

      {/*
       * `Money size="hero"` is 40px mono — the single largest thing in the app, and the one
       * pixel this screen exists for. It is NOT wrapped in an aria-live region: this is a
       * server render, so it never changes under the reader mid-session.
       */}
      <p className="mt-3.5">
        <Money value={summary.totalIdr} size="hero" />
      </p>

      <p className="mt-1.5 font-mono tabular text-meta text-ink-3">
        {summary.groupCount} catatan · {summary.itemCount} item
      </p>
    </header>
  )
}
