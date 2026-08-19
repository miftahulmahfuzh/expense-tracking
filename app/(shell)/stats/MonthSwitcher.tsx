import Link from 'next/link'

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

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <span aria-hidden="true" className="text-title leading-none">
      {dir === 'prev' ? '‹' : '›'}
    </span>
  )
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
          className={cn(CHEVRON_BOX, '-ml-2.5 press text-ink-2')}
        >
          <Chevron dir="prev" />
        </Link>
      )}

      {/* The route's one <h1>. Mono chrome label, matching /m/[month]. */}
      <h1 className="eyebrow">{monthLabel(selectedMonth)}</h1>

      {nextBlocked ? (
        <span aria-disabled="true" className={cn(CHEVRON_BOX, '-mr-2.5 text-rule')}>
          <Chevron dir="next" />
        </span>
      ) : (
        <Link
          href={`/stats?m=${next}`}
          scroll={false}
          aria-label={`Bulan berikutnya, ${monthLabel(next)}`}
          className={cn(CHEVRON_BOX, '-mr-2.5 press text-ink-2')}
        >
          <Chevron dir="next" />
        </Link>
      )}
    </div>
  )
}
