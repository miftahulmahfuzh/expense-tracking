import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import type { LlmClientLike } from '../client'
import { fixture } from '../__fixtures__'
import { parseExpenseWith } from '../parseExpense'
import { ParseError } from '../types'

/**
 * Every case here runs against an INJECTED fake client, so the suite never touches the
 * network and never needs a key. That is also why `parseExpenseWith` takes the client as
 * a parameter: `lib/llm/client.ts` opens with `import 'server-only'`, which throws
 * outside an RSC graph — Vitest is not one — so the production wrappers reach it through
 * a lazy `await import()` and the tests bypass it entirely.
 *
 * The most valuable assertion in this file is "sends exactly the allowed request
 * surface". GLM-5.2 is not Claude; a stray `thinking` or `output_config` either 400s or
 * is silently ignored, and silent-ignore is the failure mode that ships.
 */

const TEST_MODEL = 'glm-5.2'
type CreateFn = LlmClientLike['messages']['create']

/** Build a fake Anthropic.Message carrying one tool_use block. */
function toolUse(input: unknown, overrides: Record<string, unknown> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: TEST_MODEL,
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'record_expense', input }],
    usage: { input_tokens: 1800, output_tokens: 220 },
    ...overrides,
  } as unknown as Anthropic.Message
}

function textOnly(text: string): Anthropic.Message {
  return toolUse({}, { stop_reason: 'end_turn', content: [{ type: 'text', text }] })
}

const GOOD = {
  title: 'bakar duit tuesday',
  occurred_on: '2026-08-18',
  items: [
    { name: 'roti buaya', amount_idr: 38500, category: 'food' },
    { name: 'ayam sambal hitam', amount_idr: 45000, category: 'food' },
  ],
}

const fake = (impl: (n: number) => Promise<Anthropic.Message>) => {
  let n = 0
  const create = vi.fn<CreateFn>(async () => impl(n++))
  return { client: { messages: { create } } satisfies LlmClientLike, create }
}

const canonical = fixture('canonical')
const input = { rawText: canonical.rawText, todayISO: canonical.todayISO }
const opts = { model: TEST_MODEL }

/** The messages array as the wire sees it, without fighting the SDK's union types. */
type WireMessage = { role: string; content: string | Array<Record<string, unknown>> }
const wireMessages = (body: Anthropic.MessageCreateParamsNonStreaming): WireMessage[] =>
  body.messages as unknown as WireMessage[]

describe('parseExpense — happy path', () => {
  it('returns the tool input when it validates', async () => {
    const { client, create } = fake(async () => toolUse(GOOD))
    const r = await parseExpenseWith(client, input, opts)
    expect(r.source).toBe('llm')
    expect(r.degraded).toBe(false)
    expect(r.expense).toEqual(GOOD)
    expect(r.usage).toEqual({ inputTokens: 1800, outputTokens: 220 })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('sends exactly the allowed request surface', async () => {
    const { client, create } = fake(async () => toolUse(GOOD))
    await parseExpenseWith(client, input, opts)
    const body = create.mock.calls[0]![0]

    expect(Object.keys(body).sort()).toEqual(
      ['max_tokens', 'messages', 'model', 'system', 'tool_choice', 'tools'].sort(),
    )
    for (const forbidden of [
      'thinking',
      'output_config',
      'effort',
      'speed',
      'betas',
      'fallbacks',
      'temperature',
      'top_p',
      'top_k',
      'stream',
      'metadata',
    ]) {
      expect(body, forbidden).not.toHaveProperty(forbidden)
    }
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_expense' })
    expect(body.tools!.length).toBe(1)
    expect(body.tools![0]).not.toHaveProperty('strict')
    expect(body.max_tokens).toBe(4000)
    expect(body.model).toBe(TEST_MODEL)
    expect(String(body.system)).toContain(canonical.todayISO)

    const msgs = wireMessages(body)
    expect(msgs.length).toBe(1)
    expect(msgs[0]!.role).toBe('user')
    expect(JSON.stringify(msgs)).toContain('roti buaya')
  })

  it('passes a timeout under the Vercel ceiling', async () => {
    const { client, create } = fake(async () => toolUse(GOOD))
    await parseExpenseWith(client, input, opts)
    const timeout = create.mock.calls[0]![1]!.timeout!
    expect(timeout).toBeLessThanOrEqual(25_000)
    expect(timeout).toBeGreaterThan(0)
  })
})

describe('parseExpense — repair round-trip', () => {
  it('repairs once when the first output fails Zod', async () => {
    const bad = { ...GOOD, items: [{ ...GOOD.items[0], amount_idr: '38500' }] }
    const { client, create } = fake(async (n) => (n === 0 ? toolUse(bad) : toolUse(GOOD)))

    const r = await parseExpenseWith(client, input, opts)
    expect(r.source).toBe('llm_repair')
    expect(r.degraded).toBe(true)
    expect(r.expense).toEqual(GOOD)
    expect(create).toHaveBeenCalledTimes(2)
    // Usage accumulates across both calls — the repair is not free.
    expect(r.usage).toEqual({ inputTokens: 3600, outputTokens: 440 })
  })

  it('feeds the validation error back as a tool_result', async () => {
    const bad = { ...GOOD, occurred_on: '18/8/2026' }
    const { client, create } = fake(async (n) => (n === 0 ? toolUse(bad) : toolUse(GOOD)))
    await parseExpenseWith(client, input, opts)

    const msgs = wireMessages(create.mock.calls[1]![0])
    // user paste, assistant tool_use, user tool_result
    expect(msgs.length).toBe(3)
    expect(msgs[1]!.role).toBe('assistant')
    const assistant = msgs[1]!.content as Array<Record<string, unknown>>
    expect(assistant[0]!.type).toBe('tool_use')
    expect(msgs[2]!.role).toBe('user')
    const result = (msgs[2]!.content as Array<Record<string, unknown>>)[0]!
    expect(result.type).toBe('tool_result')
    expect(result.is_error).toBe(true)
    expect(result.tool_use_id).toBe('toolu_1')
    expect(String(result.content)).toContain('occurred_on')
  })

  it('repairs AT MOST once, then falls back', async () => {
    const bad = { ...GOOD, items: [] }
    const { client, create } = fake(async () => toolUse(bad))

    const r = await parseExpenseWith(client, input, opts)
    expect(create).toHaveBeenCalledTimes(2)
    expect(r.source).toBe('fallback')
    expect(r.degraded).toBe(true)
    expect(r.expense.items.map((i) => i.amount_idr)).toEqual(canonical.expect.amounts)
  })

  it('gives the repair a shorter timeout than the primary call', async () => {
    const bad = { ...GOOD, items: [] }
    const { client, create } = fake(async () => toolUse(bad))
    await parseExpenseWith(client, input, opts)
    expect(create.mock.calls[1]![1]!.timeout!).toBeLessThanOrEqual(15_000)
  })
})

describe('parseExpense — fallback', () => {
  it('falls back when the API throws', async () => {
    const { client } = fake(async () => {
      throw new Error('ECONNRESET')
    })
    const r = await parseExpenseWith(client, input, opts)
    expect(r.source).toBe('fallback')
    expect(r.expense.items.length).toBe(6)
    expect(r.expense.items.every((i) => i.category === 'other')).toBe(true)
    // No LLM tokens were spent, so there is nothing honest to report.
    expect(r.usage).toBeNull()
  })

  it('falls back when the model replies with prose instead of a tool call', async () => {
    const { client } = fake(async () => textOnly('Maaf, saya tidak mengerti.'))
    const r = await parseExpenseWith(client, input, opts)
    expect(r.source).toBe('fallback')
    expect(r.expense.occurred_on).toBe('2026-08-18')
  })

  it('falls back when the response is truncated at max_tokens', async () => {
    const { client, create } = fake(async () => toolUse(GOOD, { stop_reason: 'max_tokens' }))
    const r = await parseExpenseWith(client, input, opts)
    expect(r.source).toBe('fallback')
    // A truncated tool_use is not worth repairing — the retry would truncate too.
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('never leaves the user with nothing when a fallback is possible', async () => {
    const { client } = fake(async () => {
      throw new Error('502 Bad Gateway')
    })
    const r = await parseExpenseWith(client, input, opts)
    expect(r.expense.items.length).toBeGreaterThan(0)
  })
})

describe('parseExpense — thrown errors', () => {
  const { client } = fake(async () => toolUse(GOOD))

  it('throws empty_input on blank text', async () => {
    await expect(
      parseExpenseWith(client, { rawText: '  \n ', todayISO: '2026-08-19' }, opts),
    ).rejects.toMatchObject({ name: 'ParseError', reason: 'empty_input' })
  })

  it('throws input_too_long above 8000 chars', async () => {
    await expect(
      parseExpenseWith(client, { rawText: 'a'.repeat(8001), todayISO: '2026-08-19' }, opts),
    ).rejects.toMatchObject({ name: 'ParseError', reason: 'input_too_long' })
  })

  it('throws no_items_found when LLM and fallback both find nothing', async () => {
    const dead = fake(async () => {
      throw new Error('down')
    })
    await expect(
      parseExpenseWith(
        dead.client,
        { rawText: 'besok jangan jajan lagi\ncatatan: hemat', todayISO: '2026-08-19' },
        opts,
      ),
    ).rejects.toMatchObject({ name: 'ParseError', reason: 'no_items_found' })
  })

  it('every ParseError carries renderable Indonesian copy', async () => {
    try {
      await parseExpenseWith(client, { rawText: '', todayISO: '2026-08-19' }, opts)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError)
      expect((e as ParseError).userMessage.length).toBeGreaterThan(5)
    }
  })

  it('does not call the API at all for invalid input', async () => {
    const guard = fake(async () => toolUse(GOOD))
    await expect(
      parseExpenseWith(guard.client, { rawText: '', todayISO: '2026-08-19' }, opts),
    ).rejects.toThrow()
    await expect(
      parseExpenseWith(guard.client, { rawText: 'x'.repeat(8001), todayISO: '2026-08-19' }, opts),
    ).rejects.toThrow()
    expect(guard.create).not.toHaveBeenCalled()
  })
})

describe('parseExpense — logging', () => {
  it('never writes rawText to the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = fake(async () => {
      throw new Error('ECONNRESET')
    })
    await parseExpenseWith(client, input, opts)
    const logged = warn.mock.calls.flat().join(' ')
    expect(warn).toHaveBeenCalled()
    expect(logged).not.toContain('roti buaya')
    expect(logged).toContain('primary')
    warn.mockRestore()
  })
})
