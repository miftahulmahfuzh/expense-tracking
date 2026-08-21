import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { FullscreenToggle } from '@/components/fullscreen'
import { Card, EmptyState, INK_STICKER, Money } from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getMonthGroups } from '@/lib/db/queries'
import { dayLabel, monthLabel } from '@/lib/format'

import { bucketByDay, summariseMonth } from './buckets'
import { GroupRow } from './GroupRow'
import { isSupportedMonthKey } from './monthParam'
import { MonthHeader } from './MonthHeader'

/**
 * `/m/[month]` — the home screen and the app's answer to "how much did I spend this month?".
 *
 * ONE QUERY. `getMonthGroups` returns every row with its total, item count and photo count
 * already aggregated (F03, one round trip, no N+1), and the month total is summed from those
 * rows rather than fetched again (roadmap A6 / D7). Adding a second query to this page is a
 * regression, not an optimisation.
 *
 * NO `export const dynamic`. `requireUserId()` reads the session cookie, which makes the
 * route dynamic by construction — and R-75 recorded that Next 16 dropped `dynamic` from the
 * route-segment-config table. `next build` must list this route as `ƒ`; if it ever shows `○`,
 * the auth call has been lost and the page would be cached across users.
 */

export async function generateMetadata({ params }: PageProps<'/m/[month]'>): Promise<Metadata> {
  const { month } = await params
  return { title: isSupportedMonthKey(month) ? monthLabel(month) : 'Bulan tidak ditemukan' }
}

export default async function MonthPage({ params }: PageProps<'/m/[month]'>) {
  const { month } = await params

  // Cheap, before the session and before the database: a malformed month is a routing
  // mistake, not an authorisation one (R-45).
  if (!isSupportedMonthKey(month)) notFound()

  const userId = await requireUserId()
  const groups = await getMonthGroups(userId, month)

  const summary = summariseMonth(groups)
  const days = bucketByDay(groups)

  return (
    <main>
      <MonthHeader month={month} summary={summary} />

      {/*
       * Rendered HERE and on no other screen, deliberately. The toggle is the only way back
       * out of fullscreen mode — the tab bar is off the bottom of the screen while it is on —
       * so it has to live on exactly the route that can turn it on. Putting it in the group
       * layout instead would need a pathname check to stay off `/stats`, and getting that
       * check wrong strands the user on a screen with no navigation and no way to restore it.
       */}
      <FullscreenToggle />

      {days.length === 0 ? (
        <div className="pt-9 px-safe">
          {/*
           * Design R-40's canonical empty copy, verbatim. It points at the Tambah tab rather
           * than carrying its own button: the tab bar is 54px below this text with a raised
           * ＋ on it, and a second call to action would just be a second thing to aim at.
           */}
          <EmptyState
            title="Belum ada catatan"
            description="Bulan ini masih kosong. Tempel catatan pertamamu di tab Tambah."
          />
        </div>
      ) : (
        days.map((bucket) => (
          <section key={bucket.day} className="pt-6 px-safe">
            {/*
             * Day headings do NOT stick. F07's plan had them sticky under the month header at
             * a measured `top-[8.5rem]`, which its own note flagged as fragile — the literal
             * has to be re-measured every time the header's type scale moves, and when it is
             * wrong the heading hides behind the header with nothing failing anywhere. F10
             * publishes no header-height token to key it off, so the choice is a magic number
             * or no stickiness. The month total is what has to stay on screen while scrolling,
             * and it does.
             */}
            {/*
             * The day heading is an INK sticker — the design's black-on-page label, the only
             * place the page inverts. It reads as a printed tab on the day's card.
             *
             * BOTH of these sit on the bare page, which since the cutout-art layer landed
             * means both sit on top of a creature. The heading already had a plate; the day
             * total needed one, and got the design's own card-coloured tag (the same one the
             * date wears on `/e/[id]` and `/s/[token]`). The design's month screen has no
             * per-day total at all, so it never had to answer this — but it answers it
             * everywhere else the same way: small type over art gets a plate.
             */}
            {/*
             * THE DAY TOTAL IS EARNED, and only a day with more than one expense earns it.
             * A single-expense day printed the identical rupiah figure twice, 30px apart —
             * once on the day tag and once on the only row under it — which is a sum of one
             * addend presented as a summary. It read as two different numbers that happened
             * to match, and the reader has to compare them to find out they do not mean
             * anything different. From two rows up the total is doing real work: it is the
             * only place the day's arithmetic exists.
             */}
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="sticker" style={INK_STICKER}>
                {dayLabel(bucket.day)}
              </h2>
              {bucket.rows.length > 1 && (
                <span className="glass rounded-chip px-2 py-1">
                  <Money value={bucket.totalIdr} size="sm" tone="muted" />
                </span>
              )}
            </div>

            <Card as="ul" padded={false} className="mt-2 overflow-hidden px-4">
              {bucket.rows.map((group) => (
                <GroupRow key={group.id} group={group} />
              ))}
            </Card>
          </section>
        ))
      )}
    </main>
  )
}
