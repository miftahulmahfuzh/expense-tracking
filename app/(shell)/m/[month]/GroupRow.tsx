import Link from 'next/link'

import { Money } from '@/components/ui'
import type { MonthGroupRow } from '@/lib/db/queries'

/**
 * One expense group in the month list.
 *
 * THE WHOLE ROW IS THE LINK — 414px wide, ≥60px tall. No trailing chevron: a
 * full-width row in a list on iOS is self-evidently tappable, and a chevron would compete
 * with the amount for the right edge, which belongs to the money rail.
 *
 * NO THUMBNAIL, and that is the design's call rather than an omission. Design R-40 puts the
 * photo evidence in the meta line as `⧉ 3`, and roadmap §5 lists the row as "title, item
 * count, photo count, total" — the 44px thumbnail was F07's own plan (its A10 / R-14),
 * written before the design landed. `firstPhotoUrl` therefore ships unused here; it stays in
 * `MonthGroupRow` because it costs nothing (same aggregate, same round trip) and F08/F09 may
 * want it. Restoring a thumbnail means twenty `next/image` requests per month view, so it
 * should be a decision, not a drift.
 */
export function GroupRow({ group }: { group: MonthGroupRow }) {
  return (
    <li className="border-b border-rule last:border-b-0">
      <Link
        href={`/e/${group.id}`}
        className="flex min-h-row-lg press items-center gap-3 py-3"
        // The row is labelled by its own text; the amount inside <Money> carries a
        // screen-reader twin that says "266350 rupiah", so nothing here needs aria-label.
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-row">{group.title}</span>
          <span className="mt-1 block tabular text-meta text-ink-3">
            {group.itemCount} item
            {group.photoCount > 0 && (
              <>
                {' · '}
                {/* The glyph is decorative; the count needs the word to make sense spoken. */}
                <span aria-hidden="true">⧉ </span>
                {group.photoCount}
                <span className="sr-only"> foto</span>
              </>
            )}
          </span>
        </span>

        <Money value={group.totalIdr} size="md" />
      </Link>
    </li>
  )
}
