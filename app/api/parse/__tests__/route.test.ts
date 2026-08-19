import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `POST /api/parse` is the only door between the browser and metered LLM spend, so what
 * is tested here is mostly refusal: refuse without a session, refuse a malformed body,
 * refuse an oversized paste, refuse a burst — and in every case refuse BEFORE calling the
 * model.
 *
 * `@/auth` is mocked rather than `@/lib/auth/requireUserId`, so the route runs against
 * F02's real boundary code: a null session produces a real `UnauthorizedError` from the
 * real `requireUserIdApi`. Importing `@/auth` itself would pull in `lib/env.ts`, whose
 * `import 'server-only'` throws outside an RSC graph.
 *
 * `parseExpenseWithMeta` is stubbed on top of the real module — possible only because
 * `lib/llm/parseExpense.ts` reaches its server-only client through a lazy import.
 */

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: authMock }))

const parseExpenseWithMeta = vi.hoisted(() => vi.fn())
vi.mock('@/lib/llm/parseExpense', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/llm/parseExpense')>('@/lib/llm/parseExpense')
  return { ...actual, parseExpenseWithMeta }
})

const { POST } = await import('../route')

const req = (body: unknown) =>
  new Request('http://localhost/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const GOOD_BODY = { rawText: 'ayam geprek 25k', todayISO: '2026-08-19' }
const GOOD_RESULT = {
  expense: {
    title: 'jajan',
    occurred_on: '2026-08-19',
    items: [{ name: 'ayam geprek', amount_idr: 25000, category: 'food' }],
  },
  source: 'llm',
  degraded: false,
  usage: { inputTokens: 36, cachedInputTokens: 4288, outputTokens: 90 },
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user_1' } })
  parseExpenseWithMeta.mockResolvedValue(GOOD_RESULT)
  // The burst limiter lives on globalThis so it survives dev HMR and warm invocations;
  // that also means it survives between tests. Clear it, or the 413 case below arrives
  // already rate-limited and the failure looks like a body-validation bug.
  ;(globalThis as { __parseHits?: Map<string, number[]> }).__parseHits?.clear()
})

describe('POST /api/parse — auth', () => {
  it('401s when unauthenticated, and never calls the LLM', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
    expect(parseExpenseWithMeta).not.toHaveBeenCalled()
  })

  it('401s rather than redirecting — a 307 to HTML is a terrible answer to fetch()', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(401)
    expect(res.headers.get('location')).toBeNull()
  })

  it('answers 401 with renderable Indonesian copy', async () => {
    authMock.mockResolvedValue(null)
    const body = await (await POST(req(GOOD_BODY))).json()
    expect(body.error.message).toMatch(/[Ll]ogin/)
  })
})

describe('POST /api/parse — body validation', () => {
  it('200s on a valid body', async () => {
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      expense: GOOD_RESULT.expense,
      source: 'llm',
      degraded: false,
    })
  })

  it('does not leak token usage to the client', async () => {
    const body = await (await POST(req(GOOD_BODY))).json()
    expect(body).not.toHaveProperty('usage')
    expect(JSON.stringify(body)).not.toContain('4288')
  })

  it('400s on malformed JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{oops',
      }),
    )
    expect(res.status).toBe(400)
    expect(parseExpenseWithMeta).not.toHaveBeenCalled()
  })

  it('400s on a missing or wrongly-shaped field', async () => {
    for (const bad of [
      {},
      { rawText: 'x' },
      { todayISO: '2026-08-19' },
      { rawText: 'x', todayISO: '19/8/2026' },
      { rawText: 'x', todayISO: '2026-8-19' },
      { rawText: 123, todayISO: '2026-08-19' },
    ]) {
      const res = await POST(req(bad))
      expect(res.status, JSON.stringify(bad)).toBe(400)
      expect((await res.json()).error.code, JSON.stringify(bad)).toBe('bad_request')
    }
  })

  it('400s on empty rawText', async () => {
    const res = await POST(req({ rawText: '   ', todayISO: '2026-08-19' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('empty_input')
    expect(parseExpenseWithMeta).not.toHaveBeenCalled()
  })

  it('413s above the 8000-char cap, without calling the LLM', async () => {
    const res = await POST(req({ rawText: 'a'.repeat(8001), todayISO: '2026-08-19' }))
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe('input_too_long')
    expect(parseExpenseWithMeta).not.toHaveBeenCalled()
  })

  it('accepts a paste of exactly 8000 chars', async () => {
    const res = await POST(req({ rawText: 'a'.repeat(8000), todayISO: '2026-08-19' }))
    expect(res.status).toBe(200)
  })

  it('shares its cap with the ParseRequest schema F05 validates against', async () => {
    // A client validator more permissive than the server it guards is worse than none:
    // the user would type 9.000 characters, pass locally, and get a 413 back.
    const { ParseRequest } = await import('@/lib/schema/expense')
    const at = (n: number) =>
      ParseRequest.safeParse({ rawText: 'a'.repeat(n), todayISO: '2026-08-19' }).success
    expect(at(8000)).toBe(true)
    expect(at(8001)).toBe(false)
  })
})

describe('POST /api/parse — parser outcomes', () => {
  it('reports degraded results honestly', async () => {
    parseExpenseWithMeta.mockResolvedValue({
      ...GOOD_RESULT,
      source: 'fallback',
      degraded: true,
    })
    const body = await (await POST(req(GOOD_BODY))).json()
    expect(body).toMatchObject({ ok: true, source: 'fallback', degraded: true })
  })

  it('422s on no_items_found with renderable copy', async () => {
    const { ParseError } = await import('@/lib/llm/types')
    parseExpenseWithMeta.mockRejectedValue(
      new ParseError('no_items_found', 'Nggak nemu satu pun pengeluaran di teks ini.'),
    )
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('no_items_found')
    expect(body.error.message).toContain('Nggak nemu')
  })

  it('maps a late input_too_long ParseError to 413', async () => {
    const { ParseError } = await import('@/lib/llm/types')
    parseExpenseWithMeta.mockRejectedValue(new ParseError('input_too_long', 'Teksnya kepanjangan.'))
    expect((await POST(req(GOOD_BODY))).status).toBe(413)
  })

  it('500s on an unexpected throw, without leaking the message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    parseExpenseWithMeta.mockRejectedValue(new Error('LLM_API_KEY=sk-super-secret rejected'))
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('server_error')
    expect(JSON.stringify(body)).not.toContain('sk-super-secret')
    error.mockRestore()
  })
})

describe('POST /api/parse — rate limiting', () => {
  it('429s after the burst allowance for one user', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(req(GOOD_BODY))).status, `call ${i + 1}`).toBe(200)
    }
    const res = await POST(req(GOOD_BODY))
    expect(res.status).toBe(429)
    expect((await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
  })

  it('counts per user, not globally', async () => {
    for (let i = 0; i < 11; i++) await POST(req(GOOD_BODY))
    authMock.mockResolvedValue({ user: { id: 'user_2' } })
    expect((await POST(req(GOOD_BODY))).status).toBe(200)
  })

  it('does not spend the allowance on unauthenticated calls', async () => {
    authMock.mockResolvedValue(null)
    for (let i = 0; i < 20; i++) await POST(req(GOOD_BODY))
    authMock.mockResolvedValue({ user: { id: 'user_1' } })
    expect((await POST(req(GOOD_BODY))).status).toBe(200)
  })
})
