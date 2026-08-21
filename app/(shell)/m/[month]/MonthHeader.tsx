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
 * The header is a WHITE BLOCK, not the page: it is the only card-coloured band on this
 * screen and it is what the grey list scrolls under. Opaque rather than
 * translucent-with-blur — rows scrolling behind a blurred money column read as smudged
 * digits, and this design has no glass in it anywhere.
 */

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <span aria-hidden="true" className="text-[22px] leading-none font-extrabold">
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
    <header className="sticky top-0 z-30 border-b border-rule bg-card pt-safe-header px-safe pb-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/m/${prev}`}
          aria-label={`Bulan sebelumnya, ${monthLabel(prev)}`}
          className={cn(CHEVRON_BOX, '-ml-2.5 press text-ink-2')}
        >
          <Chevron dir="prev" />
        </Link>

        {/* The route's one <h1>, and a YELLOW STICKER rather than a screen title: the month
            is navigation, and the highlighter is what marks where you are — the same yellow
            as the active tab 800px below it. */}
        <h1 className="sticker-lg">{monthLabel(month)}</h1>

        {nextBlocked ? (
          <span aria-disabled="true" className={cn(CHEVRON_BOX, '-mr-2.5 text-rule')}>
            <Chevron dir="next" />
          </span>
        ) : (
          <Link
            href={`/m/${next}`}
            aria-label={`Bulan berikutnya, ${monthLabel(next)}`}
            className={cn(CHEVRON_BOX, '-mr-2.5 press text-ink')}
          >
            <Chevron dir="next" />
          </Link>
        )}
      </div>

      {/*
       * `Money size="hero"` is 44px/900 — the single largest thing in the app, and the one
       * pixel this screen exists for. It is NOT wrapped in an aria-live region: this is a
       * server render, so it never changes under the reader mid-session.
       */}
      <p className="mt-3.5">
        <Money value={summary.totalIdr} size="hero" />
      </p>

      <p className="mt-2 tabular text-meta text-ink-3 uppercase">
        {summary.groupCount} catatan · {summary.itemCount} item
      </p>
    </header>
  )
}
