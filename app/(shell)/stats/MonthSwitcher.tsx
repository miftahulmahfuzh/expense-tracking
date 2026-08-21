import Link from 'next/link'

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui'
import { cn } from '@/lib/cn'
import { addMonths, monthLabel, type MonthKey } from '@/lib/format'

/**
 * The month selector. Mechanism = QUERY PARAM (`?m=YYYY-MM`), ruling R-23.
 *
 * Why not `/stats/[month]`: roadmap §4.6 pins `/stats` as a single route and F07's TabBar
 * links to a bare `/stats`. A month here is a VIEW FILTER over one page, not a resource —
 * the resource route for a month is `/m/[month]`, and a second segment would give two
 * canonical URLs for the same month.
 *
 * A server component: two links, no state, no callbacks. The chevrons are F07's
 * MonthHeader chevrons, glyph for glyph, so the gesture is identical on both screens — and
 * the future wall is rendered the same way, as an unfocusable aria-disabled <span> rather
 * than a disabled <button> that would still take a tab stop and do nothing.
 */

/*
 * F12: was a `‹` / `›` character at 22px/800. A typed glyph is whatever the font decides it
 * is — Archivo's single guillemets are noticeably lighter than its letterforms — and there
 * were two byte-identical copies of this component, in this file and its twin, held together
 * by a comment promising they stayed "glyph for glyph". One import is that promise, kept.
 */
function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return dir === 'prev' ? <ChevronLeftIcon /> : <ChevronRightIcon />
}

const CHEVRON_BOX = 'grid size-touch shrink-0 place-items-center rounded-field'

export default function MonthSwitcher({
  selectedMonth,
  currentMonth,
  earliestMonth,
}: {
  selectedMonth: MonthKey
  currentMonth: MonthKey
  /** The start of the chart window. Paging before it would select a month with no bar. */
  earliestMonth: MonthKey
}) {
  const prev = addMonths(selectedMonth, -1)
  const next = addMonths(selectedMonth, 1)

  // 'YYYY-MM' sorts lexicographically exactly as it sorts chronologically.
  const prevBlocked = prev < earliestMonth
  const nextBlocked = next > currentMonth

  return (
    <div className="flex items-center justify-between">
      {prevBlocked ? (
        <span aria-disabled="true" className={cn(CHEVRON_BOX, '-ml-2.5 text-rule')}>
          <Chevron dir="prev" />
        </span>
      ) : (
        <Link
          href={`/stats?m=${prev}`}
          scroll={false}
          aria-label={`Bulan sebelumnya, ${monthLabel(prev)}`}
          className={cn(CHEVRON_BOX, '-ml-2.5 press text-ink')}
        >
          <Chevron dir="prev" />
        </Link>
      )}

      {/* An <h2>, not an <h1>: /stats now carries a real screen title in its header band,
          and two <h1>s on one route is a heading-structure bug that nothing visibly fails
          on. The same yellow sticker as /m/[month], because the two month pagers are the
          same gesture and should read as the same control. */}
      <h2 className="sticker-lg">{monthLabel(selectedMonth)}</h2>

      {nextBlocked ? (
        <span aria-disabled="true" className={cn(CHEVRON_BOX, '-mr-2.5 text-rule')}>
          <Chevron dir="next" />
        </span>
      ) : (
        <Link
          href={`/stats?m=${next}`}
          scroll={false}
          aria-label={`Bulan berikutnya, ${monthLabel(next)}`}
          className={cn(CHEVRON_BOX, '-mr-2.5 press text-ink')}
        >
          <Chevron dir="next" />
        </Link>
      )}
    </div>
  )
}
