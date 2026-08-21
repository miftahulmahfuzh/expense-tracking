import { describe, expect, it } from 'vitest'

import {
  INSIGHT_COOLDOWN_MS,
  INSIGHT_WINDOW_DAYS,
  insightDataKey,
  insightScopeKey,
  insightWindows,
  isStale,
  jakartaWeekKey,
  shouldRegenerate,
} from '../freshness'

/**
 * F12 §6. Every case here is one the browser cannot show you: a summary describing the wrong
 * week renders perfectly.
 */

describe('jakartaWeekKey', () => {
  it('runs Monday to Sunday — the same seven days for all of them', () => {
    // 2026-08-17 is a Monday; 2026-08-23 the Sunday that closes that week.
    const week = jakartaWeekKey('2026-08-17')
    for (const d of ['17', '18', '19', '20', '21', '22', '23']) {
      expect(jakartaWeekKey(`2026-08-${d}`), d).toBe(week)
    }
  })

  it('starts a new week on the following Monday, not the following Sunday', () => {
    // The off-by-one that would put a Sunday expense in next week's summary.
    expect(jakartaWeekKey('2026-08-24')).not.toBe(jakartaWeekKey('2026-08-23'))
  })

  it('gives a January date the PREVIOUS ISO year when its week belongs there', () => {
    // 2027-01-01 is a Friday, so its week's Thursday (2026-12-31) is in 2026. Naively using
    // the calendar year would label this 2027-W01 and collide with the real one a week later,
    // silently overwriting one summary with the other.
    expect(jakartaWeekKey('2027-01-01')).toBe('2026-W53')
    expect(jakartaWeekKey('2027-01-04')).toBe('2027-W01')
  })

  it('zero-pads, so the keys sort lexicographically', () => {
    expect(jakartaWeekKey('2026-01-05')).toBe('2026-W02')
  })
})

describe('insightScopeKey', () => {
  it('carries the week and the month, and nothing redundant', () => {
    expect(insightScopeKey('2026-08-21')).toBe('2026-W34|2026-08')
  })

  it('changes when the calendar moves even though no expense did', () => {
    // THE MONDAY-MORNING CASE. This is the entire reason scopeKey exists.
    expect(insightScopeKey('2026-08-23')).not.toBe(insightScopeKey('2026-08-24'))
  })
})

describe('insightDataKey', () => {
  it('moves when the newest expense moves', () => {
    const a = insightDataKey(new Date('2026-08-21T10:00:00Z'), 12)
    const b = insightDataKey(new Date('2026-08-21T10:00:01Z'), 12)
    expect(a).not.toBe(b)
  })

  it('moves when a group is DELETED from below the maximum', () => {
    // The hole that max(updated_at) alone leaves: the newest row is untouched, so the max is
    // identical, and only the count reveals that something is gone.
    const stamp = new Date('2026-08-21T10:00:00Z')
    expect(insightDataKey(stamp, 12)).not.toBe(insightDataKey(stamp, 11))
  })

  it('is stable when nothing changed', () => {
    const stamp = new Date('2026-08-21T10:00:00Z')
    expect(insightDataKey(stamp, 12)).toBe(insightDataKey(new Date(stamp), 12))
  })

  it('handles a user with no expenses at all', () => {
    expect(insightDataKey(null, 0)).toBe('0:0')
  })
})

describe('isStale / shouldRegenerate', () => {
  const now = new Date('2026-08-21T12:00:00Z')
  const fresh = {
    dataKey: '1:1',
    scopeKey: '2026-W34|2026-08',
    generatedAt: new Date('2026-08-21T11:00:00Z'),
  }

  it('treats a missing row as stale, and generates with no cooldown to apply', () => {
    expect(isStale(null, '1:1', '2026-W34|2026-08')).toBe(true)
    expect(shouldRegenerate(null, '1:1', '2026-W34|2026-08', now)).toBe(true)
  })

  it('serves matching keys without a model call', () => {
    expect(isStale(fresh, fresh.dataKey, fresh.scopeKey)).toBe(false)
    expect(shouldRegenerate(fresh, fresh.dataKey, fresh.scopeKey, now)).toBe(false)
  })

  it('regenerates on a data change', () => {
    expect(shouldRegenerate(fresh, '2:1', fresh.scopeKey, now)).toBe(true)
  })

  it('regenerates on a calendar change with identical data', () => {
    expect(shouldRegenerate(fresh, fresh.dataKey, '2026-W35|2026-08', now)).toBe(true)
  })

  it('holds the cooldown: stale text written seconds ago is served, not rewritten', () => {
    const justNow = { ...fresh, generatedAt: new Date(now.getTime() - 5_000) }
    expect(isStale(justNow, '2:1', fresh.scopeKey)).toBe(true)
    expect(shouldRegenerate(justNow, '2:1', fresh.scopeKey, now)).toBe(false)
  })

  it('releases the cooldown exactly at the boundary', () => {
    const atEdge = { ...fresh, generatedAt: new Date(now.getTime() - INSIGHT_COOLDOWN_MS) }
    expect(shouldRegenerate(atEdge, '2:1', fresh.scopeKey, now)).toBe(true)
  })

  it('never lets the cooldown suppress a FRESH row into a needless call', () => {
    const justNow = { ...fresh, generatedAt: new Date(now.getTime() - 1_000) }
    expect(shouldRegenerate(justNow, fresh.dataKey, fresh.scopeKey, now)).toBe(false)
  })
})

describe('insightWindows', () => {
  it('spans a Monday-anchored week containing today', () => {
    const w = insightWindows('2026-08-21') // a Friday
    expect(w.weekStartISO).toBe('2026-08-17')
    expect(w.weekEndISO).toBe('2026-08-23')
  })

  it('anchors the week to today itself when today IS Monday', () => {
    const w = insightWindows('2026-08-17')
    expect(w.weekStartISO).toBe('2026-08-17')
  })

  it('anchors correctly on a Sunday — the last day, not the first', () => {
    // Getting this wrong makes Sunday its own one-day "week".
    const w = insightWindows('2026-08-23')
    expect(w.weekStartISO).toBe('2026-08-17')
    expect(w.weekEndISO).toBe('2026-08-23')
  })

  it('reaches INSIGHT_WINDOW_DAYS back, inclusive of today', () => {
    const w = insightWindows('2026-08-21')
    expect(w.windowStartISO).toBe('2026-06-21')
    const days =
      (Date.parse(`${w.todayISO}T00:00:00Z`) - Date.parse(`${w.windowStartISO}T00:00:00Z`)) /
      86_400_000
    expect(days + 1).toBe(INSIGHT_WINDOW_DAYS)
  })

  it('rolls the previous month across a year boundary', () => {
    expect(insightWindows('2026-01-15').previousMonth).toBe('2025-12')
    expect(insightWindows('2026-01-15').thisMonth).toBe('2026-01')
  })

  it('does not land on the 31st when the previous month is shorter', () => {
    // A naive setUTCMonth(-1) on 2026-03-31 gives 2026-03-03. Anchoring on the 1st avoids it.
    expect(insightWindows('2026-03-31').previousMonth).toBe('2026-02')
  })
})
