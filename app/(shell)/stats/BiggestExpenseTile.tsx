import Link from 'next/link'

import { CategoryCode, Money } from '@/components/ui'
import type { BiggestExpense } from '@/lib/db/queries'
import { formatDayShort } from '@/lib/stats/format'
import { toIdr } from '@/lib/stats/series'

/**
 * One row of data, so there is no chart here — a link tile with a stat-tile amount.
 * Included because it is the single most actionable fact on the page.
 *
 * HERO DISCIPLINE: the dataviz rules allow exactly one hero figure per view, and on /stats
 * that is the selected month's total at the top. This amount is `size="md"` (17px), not a
 * second `size="hero"`.
 *
 * The link lands on /e/[groupId]#item-[itemId]. The anchor is F07's item <li>, which this
 * feature added (one attribute) rather than dropping the fragment — landing on the group and
 * making the reader hunt for the item defeats the point of the callout.
 */
export default function BiggestExpenseTile({ item }: { item: BiggestExpense | null }) {
  if (!item) return null

  return (
    <section
      className="rounded-card border border-rule bg-card p-4"
      aria-labelledby="stats-big-title"
    >
      <h2 className="eyebrow" id="stats-big-title">
        Pengeluaran terbesar
      </h2>

      <Link
        href={`/e/${item.groupId}#item-${item.itemId}`}
        className="mt-2.5 flex min-h-touch press items-center gap-3"
      >
        <CategoryCode category={item.category} className="w-6 shrink-0" />

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-item">{item.name}</span>
          <span className="mt-0.5 truncate font-mono text-meta text-ink-3">
            {item.groupTitle} · {formatDayShort(item.occurredOn)}
          </span>
        </span>

        <Money value={toIdr(item.amountIdr)} size="md" />
        <span aria-hidden="true" className="shrink-0 text-title leading-none text-ink-3">
          ›
        </span>
      </Link>
    </section>
  )
}
