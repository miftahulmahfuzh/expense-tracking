import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'

import type { WindowItemRow } from '@/lib/db/queries'
import { insightWindows } from '@/lib/insights/freshness'

import type { LlmClientLike } from '../client'
import { formatInsightRows, INSIGHT_TOOL_NAME, RECORD_INSIGHT_TOOL } from '../insightPrompt'
import { writeInsightsWith } from '../insights'

/**
 * F12 §7. The client is injected, so nothing here touches the network.
 *
 * WHAT THESE TESTS ARE FOR: `writeInsightsWith` promises never to throw for a model problem and
 * never to invent text. Both are promises the caller LEANS ON — `lib/db/insights.ts` writes no
 * row when this returns null, and `/stats` renders a healthy page around a missing summary. If
 * either silently stopped holding, the visible symptom would be a 500 on a page whose four SQL
 * aggregates were all fine.
 */

const WINDOWS = insightWindows('2026-08-21')

const ROWS: WindowItemRow[] = [
  { occurredOn: '2026-08-18', name: 'Nasi Cordoba', amountIdr: 25000, category: 'food' },
  { occurredOn: '2026-08-18', name: 'Trikayo', amountIdr: 38000, category: 'food' },
  { occurredOn: '2026-08-19', name: 'bensin motor', amountIdr: 20000, category: 'transport' },
]

const GOOD = {
  minggu: 'Cordoba naik Rp 2.000 sejak Rabu. Makan siang stabil.',
  bulan: 'Minggu ini lebih hemat dari minggu lalu.',
  dua_bulan: 'Bensin turun dibanding bulan lalu.',
}

/** A fake `messages.create` that returns whatever content blocks the test wants. */
function client(message: Partial<Anthropic.Message> & { content: Anthropic.Message['content'] }): {
  client: LlmClientLike
  create: ReturnType<typeof vi.fn>
} {
  const create = vi.fn().mockResolvedValue({
    stop_reason: 'tool_use',
    usage: { input_tokens: 60, cache_read_input_tokens: 4352, output_tokens: 190 },
    ...message,
  })
  return { client: { messages: { create } } as unknown as LlmClientLike, create }
}

const toolUse = (input: unknown): Anthropic.Message['content'] => [
  { type: 'tool_use', id: 'tu_1', name: INSIGHT_TOOL_NAME, input } as Anthropic.ToolUseBlock,
]

describe('writeInsightsWith — the happy path', () => {
  it('maps the tool input onto the app’s field names', async () => {
    const { client: c } = client({ content: toolUse(GOOD) })
    const result = await writeInsightsWith(c, WINDOWS, ROWS, { model: 'glm-5.2' })

    expect(result?.texts).toEqual({
      weekText: GOOD.minggu,
      monthText: GOOD.bulan,
      twoMonthText: GOOD.dua_bulan,
    })
  })

  it('reports cached and uncached input SEPARATELY', async () => {
    // lib/llm/COST.md: z.ai caches the prompt itself and leaves `input_tokens` at the uncached
    // remainder. Summing only that understates a warm request by ~70x, which would make the
    // cost note in COST.md read as if this feature were free.
    const { client: c } = client({ content: toolUse(GOOD) })
    const result = await writeInsightsWith(c, WINDOWS, ROWS, { model: 'glm-5.2' })
    expect(result?.usage).toEqual({ inputTokens: 60, cachedInputTokens: 4352, outputTokens: 190 })
  })
})

describe('writeInsightsWith — the request surface', () => {
  it('sends ONLY the portable Messages keys', async () => {
    /*
     * F04 §0.1: GLM-5.2 is not a Claude model. `thinking`, `output_config`, `speed`, `betas` and
     * `cache_control` either 400 or — worse — are silently ignored. The parser has the identical
     * assertion, and this is the second call site that has to keep the promise.
     */
    const { client: c, create } = client({ content: toolUse(GOOD) })
    await writeInsightsWith(c, WINDOWS, ROWS, { model: 'glm-5.2' })

    const [body] = create.mock.calls[0]!
    expect(Object.keys(body).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'system',
      'tool_choice',
      'tools',
    ])
  })

  it('FORCES the single tool — structured output has no other portable mechanism', async () => {
    const { client: c, create } = client({ content: toolUse(GOOD) })
    await writeInsightsWith(c, WINDOWS, ROWS, { model: 'glm-5.2' })

    const [body] = create.mock.calls[0]!
    expect(body.tool_choice).toEqual({ type: 'tool', name: INSIGHT_TOOL_NAME })
    expect(body.tools).toHaveLength(1)
  })

  it('passes the model through and never defaults it', async () => {
    const { client: c, create } = client({ content: toolUse(GOOD) })
    await writeInsightsWith(c, WINDOWS, ROWS, { model: 'some-other-model' })
    expect(create.mock.calls[0]![0].model).toBe('some-other-model')
  })

  it('states the rupiah unit and all three window bounds in the prompt', async () => {
    // The 1000x money bug is why F04's prompt is long, and a summary that reads 25000 as Rp 25
    // is the same bug wearing prose. The bounds are here because "minggu ini" is meaningless
    // without them — the model has no clock.
    const { client: c, create } = client({ content: toolUse(GOOD) })
    await writeInsightsWith(c, WINDOWS, ROWS, { model: 'glm-5.2' })

    const system: string = create.mock.calls[0]![0].system
    expect(system).toContain('RUPIAH BULAT')
    expect(system).toContain('2026-08-17') // week start (Monday)
    expect(system).toContain('2026-08-23') // week end (Sunday)
    expect(system).toContain('2026-08') // this month
    expect(system).toContain('2026-07') // previous month
  })
})

describe('writeInsightsWith — every failure returns null, none throws', () => {
  const cases: Array<
    [string, Partial<Anthropic.Message> & { content: Anthropic.Message['content'] }]
  > = [
    ['prose instead of a tool call', { content: [{ type: 'text', text: 'hi' } as never] }],
    [
      'a tool call under the wrong name',
      { content: [{ type: 'tool_use', id: 'x', name: 'other', input: GOOD } as never] },
    ],
    ['a truncated response', { stop_reason: 'max_tokens', content: toolUse(GOOD) }],
    ['a missing field', { content: toolUse({ minggu: 'a', bulan: 'b' }) }],
    ['an empty string where prose was required', { content: toolUse({ ...GOOD, bulan: '   ' }) }],
    ['a non-string field', { content: toolUse({ ...GOOD, bulan: 42 }) }],
  ]

  for (const [name, message] of cases) {
    it(`returns null on ${name}`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { client: c } = client(message)
      await expect(writeInsightsWith(c, WINDOWS, ROWS, { model: 'glm-5.2' })).resolves.toBeNull()
      warn.mockRestore()
    })
  }

  it('returns null when the request itself throws, rather than propagating', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const create = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    const c = { messages: { create } } as unknown as LlmClientLike
    await expect(writeInsightsWith(c, WINDOWS, ROWS, { model: 'glm-5.2' })).resolves.toBeNull()
    warn.mockRestore()
  })

  it('NEVER logs the item rows — they are the user’s financial data', async () => {
    // The same rule parseExpense states about `rawText`, and it matters more here: the rows
    // carry merchant names, which is where someone eats and when.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const create = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    await writeInsightsWith({ messages: { create } } as unknown as LlmClientLike, WINDOWS, ROWS, {
      model: 'glm-5.2',
    })

    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).not.toContain('Nasi Cordoba')
    expect(logged).not.toContain('25000')
    warn.mockRestore()
  })
})

describe('writeInsightsWith — the no-data short circuit', () => {
  it('spends NO model call when the window is empty', async () => {
    // A brand-new account opening /stats must not pay for a request about nothing.
    const { client: c, create } = client({ content: toolUse(GOOD) })
    await expect(writeInsightsWith(c, WINDOWS, [], { model: 'glm-5.2' })).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('the tool schema', () => {
  it('requires all three sections and forbids extra keys', () => {
    // `as unknown as` because the SDK types `input_schema` as its own `InputSchema`, which does
    // not declare `additionalProperties` — a direct assertion is rejected as non-overlapping.
    const schema = RECORD_INSIGHT_TOOL.input_schema as unknown as {
      required: string[]
      additionalProperties: boolean
    }
    expect(schema.required.sort()).toEqual(['bulan', 'dua_bulan', 'minggu'])
    expect(schema.additionalProperties).toBe(false)
  })

  it('carries no Claude-only field', () => {
    // `strict` and `cache_control` are silently ignored by portable endpoints, which is worse
    // than being rejected because it looks like it worked.
    const json = JSON.stringify(RECORD_INSIGHT_TOOL)
    expect(json).not.toContain('strict')
    expect(json).not.toContain('cache_control')
  })
})

describe('formatInsightRows', () => {
  it('emits a header and one pipe-delimited line per item', () => {
    const out = formatInsightRows(ROWS)
    expect(out.split('\n')[0]).toBe('TANGGAL | NAMA | JUMLAH | KATEGORI')
    expect(out.split('\n')).toHaveLength(ROWS.length + 1)
  })

  it('prints amounts as BARE INTEGERS — no Rp, no separators', () => {
    // Formatting them here would invite the model to read a formatted number back out at a
    // different magnitude, which is the 1000x bug by another route.
    expect(formatInsightRows(ROWS)).toContain('| 25000 |')
    expect(formatInsightRows(ROWS)).not.toContain('Rp')
    expect(formatInsightRows(ROWS)).not.toContain('25.000')
  })

  it('says so rather than emitting an empty table', () => {
    expect(formatInsightRows([])).toContain('tidak ada pengeluaran')
  })
})
