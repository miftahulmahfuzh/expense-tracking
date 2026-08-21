import Anthropic from '@anthropic-ai/sdk'
import { config as loadEnvFile } from 'dotenv'
import { describe, expect, it } from 'vitest'

import type { WindowItemRow } from '@/lib/db/queries'
import { insightWindows } from '@/lib/insights/freshness'

import type { LlmClientLike } from '../client'
import { writeInsightsWith } from '../insights'

/**
 * F12 §7 — the live insight suite. This is how we find out the prompt is wrong BEFORE the user
 * reads a paragraph that quotes Rp 25 for a Rp 25.000 lunch.
 *
 * It really calls GLM-5.2 and really costs tokens, so it is skipped unless `LLM_LIVE_TEST=1`,
 * exactly like `parseExpense.live.test.ts`:
 *
 *     LLM_LIVE_TEST=1 npx vitest run lib/llm/__tests__/insights.live.test.ts
 *
 * ═══ WHAT CAN AND CANNOT BE ASSERTED ═══
 *
 * The output is free prose from a non-deterministic model, so asserting on wording would be a
 * test that fails on a good day. What IS assertable is the set of properties the feature's
 * honesty rests on, and each of these has a specific way of going wrong:
 *
 *   · it returns something at all              → the tool is being called, not narrated around
 *   · the fixture's merchant names appear      → decision D-F is actually working; a summary
 *                                                that never says "Cordoba" is the generic
 *                                                category summary we rejected
 *   · magnitudes are right                     → the 1000x bug wearing prose. `Rp 25` for a
 *                                                25000 row is the single most likely wrong
 *                                                output and the least visible
 *   · no markdown, no headings                 → the cards supply their own headings
 *
 * WHEN ONE FAILS: FIX THE PROMPT, NOT THE ASSERTION. And note that a `insightPrompt.ts` edit
 * costs exactly one full-price uncached request and is then free again (lib/llm/COST.md), which
 * doubles as confirmation the edit reached the wire.
 */

const LIVE = process.env.LLM_LIVE_TEST === '1'

// tests/setup.ts fills LLM_* with dummies so the unit suite can import freely. For a live run
// the real credentials are in .env.local.
if (LIVE) loadEnvFile({ path: '.env.local', override: true, quiet: true })

const d = LIVE ? describe : describe.skip

const client = (): LlmClientLike =>
  new Anthropic({
    apiKey: process.env.LLM_API_KEY!,
    baseURL: process.env.LLM_BASE_URL!,
    timeout: 25_000,
    maxRetries: 0,
  })

/**
 * A month of the owner's actual pattern, as described on the card: Cordoba for weekday lunch,
 * Trikayo for dinner, weekly bensin, one monthly bill. Deliberately includes a Cordoba price
 * STEP mid-week — 25.000 rising to 27.000 — because "did it notice the change" is the whole
 * question the week summary is being asked.
 */
const TODAY = '2026-08-21'

function fixtureRows(): WindowItemRow[] {
  const rows: WindowItemRow[] = []
  // Two full weeks of weekdays.
  const weekdays = [
    '2026-08-10',
    '2026-08-11',
    '2026-08-12',
    '2026-08-13',
    '2026-08-14',
    '2026-08-17',
    '2026-08-18',
    '2026-08-19',
    '2026-08-20',
    '2026-08-21',
  ]
  for (const day of weekdays) {
    rows.push({
      occurredOn: day,
      name: 'Nasi Cordoba',
      amountIdr: day >= '2026-08-19' ? 27000 : 25000,
      category: 'food',
    })
    rows.push({ occurredOn: day, name: 'Trikayo', amountIdr: 38000, category: 'food' })
  }
  rows.push({
    occurredOn: '2026-08-10',
    name: 'bensin motor',
    amountIdr: 20000,
    category: 'transport',
  })
  rows.push({
    occurredOn: '2026-08-17',
    name: 'bensin motor',
    amountIdr: 20000,
    category: 'transport',
  })
  rows.push({
    occurredOn: '2026-08-05',
    name: 'air & listrik',
    amountIdr: 410000,
    category: 'bills',
  })
  // Last month, for the two-month comparison to have something to compare.
  rows.push({
    occurredOn: '2026-07-06',
    name: 'air & listrik',
    amountIdr: 365000,
    category: 'bills',
  })
  for (const day of ['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28']) {
    rows.push({ occurredOn: day, name: 'bensin motor', amountIdr: 18000, category: 'transport' })
  }
  return rows
}

d('writeInsights (live)', () => {
  it('returns three usable Indonesian summaries that name real merchants and real magnitudes', async () => {
    const rows = fixtureRows()
    const result = await writeInsightsWith(client(), insightWindows(TODAY), rows, {
      model: process.env.LLM_MODEL!,
    })

    expect(
      result,
      'the model returned nothing usable — see the [F12 insight] warning',
    ).not.toBeNull()
    const { weekText, monthText, twoMonthText } = result!.texts
    const all = [weekText, monthText, twoMonthText].join('\n')

    console.log(
      `[live] usage in=${result!.usage.inputTokens} cached=${result!.usage.cachedInputTokens} out=${result!.usage.outputTokens}\n\n` +
        `MINGGU: ${weekText}\n\nBULAN: ${monthText}\n\n2 BULAN: ${twoMonthText}`,
    )

    for (const [name, text] of Object.entries(result!.texts)) {
      expect(text.length, `${name} is suspiciously short`).toBeGreaterThan(40)
      expect(text.length, `${name} is longer than a card can hold`).toBeLessThan(900)
    }

    // D-F: merchant names must survive into the output, or this is the category summary we
    // deliberately did not build.
    expect(all.toLowerCase()).toContain('cordoba')

    /*
     * THE MAGNITUDE CHECK — the 1000x bug in prose. A model that read 25000 as "Rp 25" would
     * produce text that looks completely plausible. Any rupiah figure quoted must be at least
     * four digits, because the smallest row in the fixture is 18.000.
     */
    const figures = [...all.matchAll(/Rp\s?([\d.,]+)/g)].map((m) => m[1]!.replace(/[.,]/g, ''))
    expect(figures.length, 'no rupiah figure quoted at all').toBeGreaterThan(0)
    for (const figure of figures) {
      expect(Number(figure), `Rp ${figure} — magnitude looks wrong`).toBeGreaterThanOrEqual(1000)
    }

    // The cards supply their own headings and render plain text.
    expect(all).not.toMatch(/^#{1,6}\s/m)
    expect(all).not.toMatch(/\*\*/)
  }, 120_000)

  it('declines rather than inventing when the window is genuinely empty', async () => {
    // Short-circuited before the request, so this costs nothing — but it is the assertion that
    // stops a future refactor from "helpfully" summarising an account with no data.
    const result = await writeInsightsWith(client(), insightWindows(TODAY), [], {
      model: process.env.LLM_MODEL!,
    })
    expect(result).toBeNull()
  })
})
