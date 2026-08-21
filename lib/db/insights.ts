import 'server-only'

import { eq } from 'drizzle-orm'

import { getInsightWatermark, getItemsForWindow } from '@/lib/db/queries'
import {
  insightDataKey,
  insightScopeKey,
  insightWindows,
  shouldRegenerate,
  type StoredInsightKeys,
} from '@/lib/insights/freshness'
import { writeInsights } from '@/lib/llm/insights'

import { db } from './index'
import { expenseInsights } from './schema'

/**
 * Read-or-regenerate for the `/stats` summaries — F12 §6, §7.5.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  STAMP ON WRITE, GENERATE ON READ — decision D-E.
 *
 *  The card offered "it is fine if we always call LLM … everytime i edited / added new
 *  Expense". This honours the same cost tolerance and is strictly better on both axes:
 *
 *    · the SAVE path pays nothing. Adding an expense is the most latency-sensitive action in
 *      the app, and it now touches one indexed column (app/actions/items.ts) instead of waiting
 *      on a model.
 *    · five rapid edits collapse into ONE call, not five. Under the card's design, fixing a
 *      typo three times and changing a category would have written four sets of three
 *      paragraphs and thrown three of them away.
 *
 *  What it costs: the first visit after an edit waits. That is why the caller puts this inside a
 *  Suspense boundary — the hero, chart, breakdown and biggest-expense tile paint from SQL
 *  immediately and only these three cards stream in.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `server-only`, and load-bearing rather than decorative: this module reaches the database AND
 * the LLM client. An accidental import from a client component must be a build error, not an
 * `LLM_API_KEY` in a browser bundle.
 */

export interface InsightSections {
  weekText: string | null
  monthText: string | null
  twoMonthText: string | null
  generatedAt: Date
  /** True when the text is known to be behind the data — the cooldown is holding (§6.3). */
  stale: boolean
}

/**
 * What `/stats` renders. `null` means "no summary and none coming": either the user has nothing
 * in the window, or the model call failed and the page should say so.
 *
 * NOT A THROW on failure. The rest of `/stats` is four healthy SQL aggregates, and a summary is
 * not worth taking that page down.
 */
export async function getInsightSections(
  userId: string,
  todayISO: string,
): Promise<InsightSections | null> {
  const windows = insightWindows(todayISO)
  const scopeKey = insightScopeKey(todayISO)

  /*
   * ONE await boundary for the two cheap reads. The watermark is a single aggregate over the
   * user's groups and the stored row is a primary-key lookup; running them in series would be
   * two round trips to decide whether a third is needed.
   */
  const [watermark, storedRows] = await Promise.all([
    getInsightWatermark(userId),
    db
      .select({
        weekText: expenseInsights.weekText,
        monthText: expenseInsights.monthText,
        twoMonthText: expenseInsights.twoMonthText,
        dataKey: expenseInsights.dataKey,
        scopeKey: expenseInsights.scopeKey,
        generatedAt: expenseInsights.generatedAt,
      })
      .from(expenseInsights)
      .where(eq(expenseInsights.userId, userId))
      .limit(1),
  ])

  const stored = storedRows[0] ?? null
  const dataKey = insightDataKey(watermark.maxUpdatedAt, watermark.groupCount)
  const keys: StoredInsightKeys | null = stored
    ? { dataKey: stored.dataKey, scopeKey: stored.scopeKey, generatedAt: stored.generatedAt }
    : null

  if (!shouldRegenerate(keys, dataKey, scopeKey, new Date())) {
    if (!stored) return null // nothing stored and nothing to do — an empty account
    return {
      weekText: stored.weekText,
      monthText: stored.monthText,
      twoMonthText: stored.twoMonthText,
      generatedAt: stored.generatedAt,
      // Serving text we KNOW is behind the data: the cooldown decided that was better than
      // spending a call per glance. Saying so is what keeps the page honest.
      stale: stored.dataKey !== dataKey || stored.scopeKey !== scopeKey,
    }
  }

  const rows = await getItemsForWindow(userId, windows.windowStartISO, windows.todayISO)

  /*
   * A silent truncation reads as "we looked at everything" when we did not. `getItemsForWindow`
   * caps at 1500 rows to bound the prompt, and if that cap ever fires the summary is written
   * against a partial window — worth a log line, because nothing about the output would show it.
   */
  if (rows.length >= 1500) {
    console.warn(`[F12 insight] row cap reached (${rows.length}); window truncated`)
  }

  const written = await writeInsights(windows, rows)

  /*
   * The call failed, or there was nothing in the window. WRITE NOTHING — no row, no empty row,
   * no timestamp. Two consequences, both wanted: the next page view retries rather than serving
   * a cached failure, and any previously good text stays exactly where it was.
   */
  if (!written) {
    if (stored) {
      return {
        weekText: stored.weekText,
        monthText: stored.monthText,
        twoMonthText: stored.twoMonthText,
        generatedAt: stored.generatedAt,
        // Old text, honestly labelled. Better than an error where a paragraph used to be.
        stale: true,
      }
    }
    return null
  }

  const generatedAt = new Date()

  /*
   * `onConflictDoUpdate` on the primary key — one statement, no read-modify-write, and safe
   * against the one race that exists here: two tabs opening /stats at the same moment both
   * generate and both upsert. Last write wins, both wrote the same three paragraphs from the
   * same rows, and the keys they wrote are identical. React `cache()` on the caller already
   * collapses this within a single request; across requests it is idempotent by construction.
   */
  await db
    .insert(expenseInsights)
    .values({
      userId,
      ...written.texts,
      dataKey,
      scopeKey,
      generatedAt,
      model: written.model,
    })
    .onConflictDoUpdate({
      target: expenseInsights.userId,
      set: {
        ...written.texts,
        dataKey,
        scopeKey,
        generatedAt,
        model: written.model,
      },
    })

  return { ...written.texts, generatedAt, stale: false }
}
