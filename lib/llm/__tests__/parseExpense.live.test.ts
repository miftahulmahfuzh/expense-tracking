import Anthropic from '@anthropic-ai/sdk'
import { config as loadEnvFile } from 'dotenv'
import { describe, expect, it } from 'vitest'
import type { LlmClientLike } from '../client'
import { FIXTURES, fixture } from '../__fixtures__'
import { parseExpenseWith } from '../parseExpense'

/**
 * This is how we find out the prompt is wrong BEFORE the user does. It really calls
 * GLM-5.2 and it really costs tokens, so it is skipped unless `LLM_LIVE_TEST=1` and CI
 * never needs a key:
 *
 *     npm run test:live        # three consecutive green runs before declaring victory
 *
 * `LLM_LIVE_TEST` is deliberately NOT in `lib/env.ts` (F04 Contract delta #3): §4.8 makes
 * a missing variable a loud crash, and this one is absent in production by design.
 *
 * WHEN A FIXTURE FAILS: FIX THE PROMPT, NOT THE ASSERTION. The only assertion that may be
 * loosened is a category allow-list, and only with the reasoning recorded in
 * docs/plans/F04-llm-parsing.md. GLM is not deterministic — a prompt that passes one run
 * in three is not shipped.
 */

const LIVE = process.env.LLM_LIVE_TEST === '1'

// tests/setup.ts fills LLM_* with dummies so the unit suite can import freely. For a live
// run the real credentials are in .env.local, which is the local source of truth; in CI
// the file is absent and the ambient environment already holds the real values.
if (LIVE) loadEnvFile({ path: '.env.local', override: true, quiet: true })

const d = LIVE ? describe : describe.skip

const client = (): LlmClientLike =>
  new Anthropic({
    apiKey: process.env.LLM_API_KEY!,
    baseURL: process.env.LLM_BASE_URL!,
    timeout: 25_000,
    maxRetries: 0,
  })

const opts = () => ({ model: process.env.LLM_MODEL! })

/**
 * One parse, with a single retry — and ONLY when the first attempt degraded to the
 * fallback, which means the LLM never answered at all.
 *
 * This is not a loosened assertion. Every accuracy expectation below still gets exactly
 * one shot at a real model response: amounts, dates, counts and titles are never retried.
 * What is retried is the transport. Measured p50 latency is ~5s, but z.ai occasionally
 * takes longer than the 25s client timeout, and a corpus run of 15 sequential calls hits
 * that often enough to make an otherwise-green suite look red. A timeout is exactly the
 * case `parseExpense` is designed to absorb, so failing the *prompt* over it would be
 * reading the wrong signal. If the second attempt also degrades, `not.toBe('fallback')`
 * fails as loudly as before.
 */
async function liveParse(fx: { rawText: string; todayISO: string }) {
  const input = { rawText: fx.rawText, todayISO: fx.todayISO }
  const first = await parseExpenseWith(client(), input, opts())
  if (first.source !== 'fallback') return first
  console.warn('[live] first attempt degraded to fallback (transport); retrying once')
  return parseExpenseWith(client(), input, opts())
}

/** 25s primary + 15s repair, twice over, plus slack. */
const LIVE_TIMEOUT_MS = 120_000

d('GLM-5.2 live — canonical fixture must be exact', () => {
  it(
    'parses the roadmap example with exact amounts and date',
    async () => {
      const fx = fixture('canonical')
      const r = await liveParse(fx)

      // If this is 'fallback', the LLM call or the prompt failed. Read the console.warn
      // line above this failure for the reason.
      expect(r.source, 'expected the LLM to succeed, not the fallback').toBe('llm')

      expect(r.expense.title).toBe('bakar duit tuesday')
      expect(r.expense.occurred_on).toBe('2026-08-18')
      expect(r.expense.items).toHaveLength(6)
      expect(r.expense.items.map((i) => i.amount_idr)).toEqual([
        38500, 45000, 49000, 49000, 58850, 26000,
      ])
      expect(r.expense.items.reduce((s, i) => s + i.amount_idr, 0)).toBe(266_350)

      // Names keep the user's wording.
      expect(r.expense.items[0]!.name.toLowerCase()).toContain('roti buaya')
      expect(r.expense.items[5]!.name.toLowerCase()).toContain('pak gembus')

      // Every category is exact now that OQ-1 is closed: items 2 and 3 are both movie
      // tickets, so `perumahan laddaland` answering `housing` is a real failure. The
      // prompt names that title explicitly, and adds the magnitude tell — rent is
      // hundreds of thousands a month, not 49 ribu.
      const cats = r.expense.items.map((i) => i.category)
      expect(cats[0]).toBe('food')
      expect(cats[1]).toBe('food')
      expect(cats[2]).toBe('entertainment')
      expect(cats[3]).toBe('entertainment')
      expect(cats[4]).toBe('food')
      expect(cats[5]).toBe('food')

      // z.ai caches the prompt automatically, so `in` is only the uncached remainder on a
      // warm prompt; real input is in + cached. Refresh lib/llm/COST.md from this line.
      console.log(
        `[live] usage in=${r.usage?.inputTokens} cached=${r.usage?.cachedInputTokens} out=${r.usage?.outputTokens}`,
      )
    },
    LIVE_TIMEOUT_MS,
  )
})

d('GLM-5.2 live — full corpus', () => {
  for (const fx of FIXTURES) {
    it(
      `${fx.id}: exact amounts + date`,
      async () => {
        const r = await liveParse(fx)

        expect(r.source, `${fx.id} degraded to fallback`).not.toBe('fallback')
        expect(r.expense.occurred_on, `${fx.id} date`).toBe(fx.expect.occurredOn)
        expect(r.expense.items.length, `${fx.id} item count`).toBe(fx.expect.itemCount)
        expect(
          r.expense.items.map((i) => i.amount_idr),
          `${fx.id} amounts — a 1000x error means the dot rule failed`,
        ).toEqual(fx.expect.amounts)
        expect(
          r.expense.items.reduce((s, i) => s + i.amount_idr, 0),
          `${fx.id} total`,
        ).toBe(fx.expect.total)

        if (fx.expect.title !== null) {
          expect(r.expense.title.trim(), `${fx.id} title`).toBe(fx.expect.title)
        } else {
          expect(r.expense.title.trim().length, `${fx.id} title`).toBeGreaterThan(0)
        }

        fx.expect.categories.forEach((allowed, idx) => {
          if (allowed.length === 0) return
          expect(allowed, `${fx.id} item[${idx}] category`).toContain(
            r.expense.items[idx]!.category,
          )
        })
      },
      LIVE_TIMEOUT_MS,
    )
  }
})

d('GLM-5.2 live — every amount is an integer, never a string', () => {
  it(
    'never emits a string or a decimal amount',
    async () => {
      const fx = fixture('mixed-units')
      const r = await liveParse(fx)
      for (const item of r.expense.items) {
        expect(typeof item.amount_idr).toBe('number')
        expect(Number.isInteger(item.amount_idr)).toBe(true)
        expect(item.amount_idr).toBeGreaterThan(0)
      }
    },
    LIVE_TIMEOUT_MS,
  )
})

/**
 * OQ-7 — does z.ai accept the standard repair shape: an assistant `tool_use` turn
 * followed by a user `tool_result` with `is_error: true`? It is the least-exercised
 * corner of the wire protocol on a non-Claude backend, and the whole recovery path
 * depends on it.
 *
 * Forced by taking a REAL first response and corrupting its tool input in flight, so the
 * `tool_use_id` the repair turn references is one the server actually produced.
 */
d('GLM-5.2 live — the repair round-trip is accepted by the server (OQ-7)', () => {
  it(
    'recovers from an invalid first tool call via tool_result is_error',
    async () => {
      const real = client()
      let call = 0
      const corrupting: LlmClientLike = {
        messages: {
          create: async (body, options) => {
            const msg = await real.messages.create(body, options)
            if (call++ === 0) {
              const block = msg.content.find((b) => b.type === 'tool_use')
              if (block && block.type === 'tool_use') {
                const input = block.input as { items?: Array<{ amount_idr: unknown }> }
                // The exact failure mode the prompt fights: a stringified amount.
                for (const item of input.items ?? []) item.amount_idr = String(item.amount_idr)
              }
            }
            return msg
          },
        },
      }

      const fx = fixture('canonical')
      const r = await parseExpenseWith(
        corrupting,
        { rawText: fx.rawText, todayISO: fx.todayISO },
        opts(),
      )

      expect(call, 'the repair round-trip should have been attempted').toBe(2)
      expect(r.source, 'the server rejected the tool_result repair shape').toBe('llm_repair')
      expect(r.degraded).toBe(true)
      expect(r.expense.items.map((i) => i.amount_idr)).toEqual(fx.expect.amounts)
    },
    LIVE_TIMEOUT_MS,
  )
})
