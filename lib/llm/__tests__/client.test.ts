import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two SDK defaults this module exists to override, finally asserted.
 *
 * When F04 shipped, this file could not exist: `client.ts` opens with `import 'server-only'`,
 * whose default export condition throws, so importing it under Vitest was impossible (R-67).
 * F06 aliased `server-only` to a no-op stub in `vitest.config.ts`, which makes the module
 * loadable — so the numbers that silently blow the Vercel Hobby ceiling are now testable
 * rather than merely commented.
 *
 * Why they matter, restated once: the TypeScript SDK's `timeout` is in MILLISECONDS (the
 * Python SDK uses seconds) and defaults to **10 minutes**, with `maxRetries: 2`. Worst case
 * is `timeout × (maxRetries + 1)` ≈ 30 minutes against a 60-second function ceiling. Neither
 * default announces itself; a request just hangs until the platform kills it, and the user
 * sees a spinner that never resolves.
 *
 * Constructing the client performs no I/O, so nothing here touches the network.
 * `tests/setup.ts` supplies the dummy `LLM_*` values.
 */

const REAL = {
  key: process.env.LLM_API_KEY,
  url: process.env.LLM_BASE_URL,
  model: process.env.LLM_MODEL,
}

/** The module caches on globalThis, which outlives a module-registry reset. */
function clearCaches() {
  delete (globalThis as { __llmClient?: unknown }).__llmClient
  vi.resetModules()
}

beforeEach(clearCaches)

afterEach(() => {
  process.env.LLM_API_KEY = REAL.key
  process.env.LLM_BASE_URL = REAL.url
  process.env.LLM_MODEL = REAL.model
  clearCaches()
})

describe('lib/llm/client', () => {
  it('caps the timeout at 25s — in milliseconds, not seconds', async () => {
    const { llm, LLM_TIMEOUT_MS } = await import('../client')
    expect(LLM_TIMEOUT_MS).toBe(25_000)
    expect(llm.timeout).toBe(25_000)
    // The default is 600_000. Anything at or above the Vercel ceiling is a hang.
    expect(llm.timeout).toBeLessThan(60_000)
    // A value of 25 would be the seconds/milliseconds mix-up: a 25ms timeout, so every
    // single parse would fail instantly and degrade to the fallback.
    expect(llm.timeout).toBeGreaterThan(1_000)
  })

  it('disables SDK-level retries so parseExpense owns the retry policy', async () => {
    const { llm } = await import('../client')
    // The default is 2, which would make the worst case 3 × 25s = 75s — over the ceiling,
    // and invisible from parseExpense's own wall-clock deadline.
    expect(llm.maxRetries).toBe(0)
  })

  it('worst-case wall clock stays under the Vercel Hobby ceiling', async () => {
    const { llm } = await import('../client')
    expect(llm.timeout * (llm.maxRetries + 1)).toBeLessThan(60_000)
  })

  it('points at the configured base URL, with no /v1 suffix of our own', async () => {
    const { llm } = await import('../client')
    expect(llm.baseURL).toBe(process.env.LLM_BASE_URL)
    // The SDK appends /v1/messages itself. A trailing /v1 here produces /v1/v1/messages,
    // which 404s in a way that reads like an auth failure.
    expect(llm.baseURL.endsWith('/v1')).toBe(false)
    expect(llm.baseURL.endsWith('/')).toBe(false)
  })

  it('re-exports the model id from the validated environment', async () => {
    const { LLM_MODEL } = await import('../client')
    expect(LLM_MODEL).toBe(process.env.LLM_MODEL)
  })

  it('returns the same instance across imports (globalThis cache)', async () => {
    const first = await import('../client')
    vi.resetModules()
    const second = await import('../client')
    expect(second.llm).toBe(first.llm)
  })

  it('crashes loudly at import when an LLM variable is missing', async () => {
    delete process.env.LLM_MODEL
    // lib/env.ts validates the whole core group eagerly, so this is a boot-time failure
    // rather than an undefined `model` reaching the wire (roadmap §4.8).
    await expect(import('../client')).rejects.toThrow(/LLM_MODEL/)
  })
})
