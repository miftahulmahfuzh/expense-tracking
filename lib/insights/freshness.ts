/**
 * When is a stored summary still true? — F12 §6.
 *
 * Pure and dependency-free, because every interesting case here is a case the browser would
 * never show you: a wrong summary looks exactly like a right one. There is no glitch to
 * notice, no console error, no layout shift — just a paragraph confidently describing last
 * week. So the arithmetic is unit-tested rather than eyeballed.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  FRESHNESS IS TWO KEYS, AND NEITHER SUBSUMES THE OTHER.
 *
 *  dataKey  — did the expenses change?  Derived from the data.
 *  scopeKey — did the calendar move?    Derived from the clock.
 *
 *  Only the clock can tell you that on Monday morning, with nothing added anywhere, the
 *  paragraph headed "Simpulan Minggu Ini" is now about a week that ended yesterday.
 *  Only the data can tell you that a receipt was corrected at 3pm.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { DateISO, MonthKey } from '@/lib/format'

/**
 * How long a freshly-written summary is allowed to answer for a stale one.
 *
 * Without this, edit → look → edit → look is one model call per glance, and roadmap D3 lets
 * any Google account sign in. `lib/llm/COST.md`'s abuse-surface section is the reason every
 * LLM path in this app is bounded and not just the obvious one.
 *
 * 60s is chosen against the human loop it is bounding: fixing a typo and reopening Simpulan
 * takes a few seconds, so the second look serves the cached text; coming back after actually
 * reading the page regenerates.
 */
export const INSIGHT_COOLDOWN_MS = 60_000

/** How far back the model is allowed to see. Covers this week, this month, and the pair. */
export const INSIGHT_WINDOW_DAYS = 62

/* ── day arithmetic ────────────────────────────────────────────────────────────────────────
   A `DateISO` is already a JAKARTA calendar day (lib/format.ts owns that conversion), so it is
   read here at UTC midnight and only ever shifted by whole days. That keeps every function
   below timezone-free: no local offset can move a date across a boundary, which is exactly the
   bug that would put a Sunday expense in the wrong week for seven hours a day.               */

function atUtcMidnight(iso: DateISO): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function toISO(d: Date): DateISO {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: DateISO, days: number): DateISO {
  const d = atUtcMidnight(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d)
}

/** Monday = 0 … Sunday = 6. The card asks for Monday-to-Sunday weeks, so this is the basis. */
function mondayIndex(iso: DateISO): number {
  return (atUtcMidnight(iso).getUTCDay() + 6) % 7
}

/* ── the two keys ─────────────────────────────────────────────────────────────────────────*/

/**
 * The ISO-8601 week containing `iso`, as `YYYY-Www`.
 *
 * ISO weeks run Monday to Sunday, which is what the card asked for, so this is a free match
 * rather than a coincidence to be careful about. The Thursday trick is the standard definition:
 * a week belongs to whichever year contains its Thursday, which is why the label's year can
 * differ from the date's — 2027-01-01 is a Friday and lives in `2026-W53`. Getting that wrong
 * would make the first week of some Januaries collide with the last week of the December
 * before it, and one of the two summaries would silently overwrite the other.
 */
export function jakartaWeekKey(iso: DateISO): string {
  const thursday = atUtcMidnight(addDays(iso, 3 - mondayIndex(iso)))
  const isoYear = thursday.getUTCFullYear()
  const jan1 = new Date(Date.UTC(isoYear, 0, 1))
  /*
   * CEIL over the 1-BASED day offset, not `1 + round(...)`. The rounded form is only correct
   * when 1 January happens to itself be a Thursday: with jan1 on a Friday, the Thursday of
   * ISO week 1 is six days later, `round(6/7)` is 1, and every week in that year is reported
   * one too high. Caught by the 2027-01-04 case in the test — a silent off-by-one that would
   * have made two different weeks share a scopeKey.
   */
  const dayOffset = (thursday.getTime() - jan1.getTime()) / 86_400_000
  const week = Math.ceil((dayOffset + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/**
 * The calendar identity of all three sections, in one string.
 *
 * Two components, not three: the two-month window is derived from the month, so a month change
 * already invalidates it. Adding a redundant third would be a key that can disagree with
 * itself.
 */
export function insightScopeKey(todayISO: DateISO): string {
  return `${jakartaWeekKey(todayISO)}|${todayISO.slice(0, 7)}`
}

/**
 * The data identity of the user's expenses.
 *
 * NOT `max(updated_at)` ALONE, and the reason is a hole that took writing down to see: deleting
 * a group whose `updated_at` sits BELOW the current maximum leaves the maximum untouched. The
 * data changed, the key would not, and the summary would keep quoting a deleted expense
 * forever. The row count moves in that case, so the pair covers it.
 *
 * Residual, accepted: deleting the very newest group and creating another within the same
 * timestamp tick leaves both components unchanged. Postgres `timestamptz` is microsecond
 * resolution and the two writes are separate statements, so this needs the two to land in the
 * same microsecond — and the cost if it ever happened is one stale paragraph until the next
 * edit.
 *
 * `updatedAt` is only truthful because F12 also made item mutations touch their parent group —
 * see `app/actions/items.ts`. Before that, correcting an amount changed no group row at all.
 */
export function insightDataKey(maxUpdatedAt: Date | null, groupCount: number): string {
  return `${maxUpdatedAt ? maxUpdatedAt.getTime() : 0}:${groupCount}`
}

/* ── the decision ─────────────────────────────────────────────────────────────────────────*/

/** Just the fields the decision reads. Keeps this module free of the Drizzle row type. */
export interface StoredInsightKeys {
  dataKey: string
  scopeKey: string
  generatedAt: Date
}

export function isStale(
  stored: StoredInsightKeys | null,
  dataKey: string,
  scopeKey: string,
): boolean {
  if (!stored) return true
  return stored.dataKey !== dataKey || stored.scopeKey !== scopeKey
}

/**
 * Should the page spend a model call?
 *
 * Nothing stored → yes, and the cooldown cannot apply: there is no text to serve instead.
 * Stored and fresh → no.
 * Stored, stale, but written seconds ago → NO, serve the slightly-stale text. See
 * `INSIGHT_COOLDOWN_MS`.
 */
export function shouldRegenerate(
  stored: StoredInsightKeys | null,
  dataKey: string,
  scopeKey: string,
  now: Date,
): boolean {
  if (!stored) return true
  if (!isStale(stored, dataKey, scopeKey)) return false
  return now.getTime() - stored.generatedAt.getTime() >= INSIGHT_COOLDOWN_MS
}

/* ── the windows the model is told about ──────────────────────────────────────────────────*/

export interface InsightWindows {
  /** The SQL window. One query covers all three sections. */
  windowStartISO: DateISO
  todayISO: DateISO
  /** Monday–Sunday containing today. */
  weekStartISO: DateISO
  weekEndISO: DateISO
  thisMonth: MonthKey
  previousMonth: MonthKey
}

export function insightWindows(todayISO: DateISO): InsightWindows {
  const weekStartISO = addDays(todayISO, -mondayIndex(todayISO))
  const thisMonth = todayISO.slice(0, 7)
  const firstOfMonth = atUtcMidnight(`${thisMonth}-01`)
  firstOfMonth.setUTCMonth(firstOfMonth.getUTCMonth() - 1)

  return {
    windowStartISO: addDays(todayISO, -(INSIGHT_WINDOW_DAYS - 1)),
    todayISO,
    weekStartISO,
    weekEndISO: addDays(weekStartISO, 6),
    thisMonth,
    previousMonth: toISO(firstOfMonth).slice(0, 7),
  }
}
