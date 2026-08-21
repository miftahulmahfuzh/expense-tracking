import { cache } from 'react'

import { Card } from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getInsightSections } from '@/lib/db/insights'
import { todayJakartaISO } from '@/lib/format'

import {
  INSIGHT_EMPTY,
  INSIGHT_HEADINGS,
  INSIGHT_STALE_NOTE,
  INSIGHT_UNAVAILABLE,
} from './insightCopy'

/**
 * The three LLM-written summaries — F12 §7.5, card item 4b.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  THIS COMPONENT IS THE SUSPENSE BOUNDARY'S CONTENT, AND THAT IS THE WHOLE POINT.
 *
 *  `page.tsx` keeps its four SQL aggregates in ONE `Promise.all` and paints the hero figure,
 *  the chart, the category breakdown and Pengeluaran Terbesar immediately. This is the only
 *  part of the page that can take eight seconds, so it is the only part behind a fallback.
 *
 *  Wrapped in React `cache()`. Two callers is not the reason — there is one — but a component
 *  that WRITES during render must be idempotent per request, and `reactStrictMode: true`
 *  (next.config.ts) double-renders in development. Without this, opening /stats in dev would
 *  fire two model calls and two upserts every time the data changed.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `requireUserId()` again rather than a prop: it is a cookie read, already deduped by Auth.js
 * within a request, and passing the userId down would make this component silently reusable
 * against someone else's data if a future caller got the prop wrong.
 */
const load = cache(async () => {
  const userId = await requireUserId()
  return getInsightSections(userId, todayJakartaISO())
})

export default async function InsightSections() {
  const sections = await load()

  /*
   * `null` covers two cases that want the same words: nothing recorded in the 62-day window
   * (so there is nothing to summarise), and a model call that failed with no previous text to
   * fall back on. Distinguishing them for the reader would be a distinction about our
   * infrastructure, not about their money.
   */
  if (!sections) {
    return (
      <Card className="p-4">
        <h2 className="eyebrow">{INSIGHT_HEADINGS.week}</h2>
        <p className="mt-2 text-body text-ink-2">{INSIGHT_UNAVAILABLE}</p>
      </Card>
    )
  }

  const rows = [
    { key: 'week', heading: INSIGHT_HEADINGS.week, text: sections.weekText },
    { key: 'month', heading: INSIGHT_HEADINGS.month, text: sections.monthText },
    { key: 'twoMonth', heading: INSIGHT_HEADINGS.twoMonth, text: sections.twoMonthText },
  ] as const

  return (
    <>
      {rows.map((row) => (
        <section key={row.key} className="glass rounded-card p-4">
          <h2 className="eyebrow">{row.heading}</h2>
          {/* `text-pretty` because these are 2-4 sentence paragraphs and a one-word last line
              is the most visible thing on the card. */}
          <p className="mt-2 text-body text-pretty">{row.text ?? INSIGHT_EMPTY}</p>
        </section>
      ))}

      {/*
        SAYING SO WHEN THE TEXT IS BEHIND THE DATA. The cooldown (§6.3) deliberately serves a
        summary that predates the last edit rather than spending a model call per glance, and a
        failed regeneration keeps the previous text rather than blanking the cards. Both are the
        right call; both are only honest if the page admits it. This is the alternative to
        silently presenting stale analysis as current, which is the one failure mode this
        feature cannot absorb.
      */}
      {sections.stale && (
        <p role="status" className="px-1 text-meta text-ink-3">
          {INSIGHT_STALE_NOTE}
        </p>
      )}
    </>
  )
}
