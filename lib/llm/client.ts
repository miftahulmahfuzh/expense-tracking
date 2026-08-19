import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

/**
 * GLM-5.2 via z.ai's Anthropic-**compatible** endpoint.
 *
 * IMPORTANT — GLM-5.2 IS NOT A CLAUDE MODEL. Only the plain Messages API surface is
 * available: `model`, `max_tokens`, `system`, `messages`, `tools`, `tool_choice`. Never
 * send `thinking`, `output_config` (incl. `effort`), `speed`, `betas`, `fallbacks`,
 * `strict` on a tool, or `cache_control` — they either 400 or, worse, are silently
 * ignored. `temperature`/`top_p` are left unset deliberately: the tool schema and the
 * prompt carry determinism, and the server default is the best-tested path.
 * See docs/plans/F04-llm-parsing.md §0.1. Structured output therefore comes from tool
 * use with a single FORCED tool, which is the portable mechanism.
 *
 * TIMEOUTS. The TypeScript SDK's `timeout` is in MILLISECONDS (the Python SDK uses
 * seconds) and defaults to 10 minutes with `maxRetries: 2` — a ~30-minute worst case
 * that would blow Vercel Hobby's 60s ceiling silently. Both defaults are overridden
 * here: 25s, no retries. Retry policy belongs in `parseExpense`, where it can respect a
 * wall-clock deadline and fall back to the regex parser instead of hanging.
 *
 * `import 'server-only'` is the point of this module being separate from
 * `parseExpense.ts`: an accidental import from a client component is then a BUILD error
 * rather than an `LLM_API_KEY` in a browser bundle (F04 Contract delta #2). The same
 * marker is why `parseExpense.ts` reaches this module through a lazy `await import()` —
 * `server-only` throws under Vitest, which is not an RSC graph, and the unit tests must
 * be able to import the parser and inject a fake.
 */

export interface LlmClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

/** Milliseconds. Also the cap `parseExpense` clamps its primary attempt to. */
export const LLM_TIMEOUT_MS = 25_000

function build(): Anthropic {
  return new Anthropic({
    apiKey: env.LLM_API_KEY,
    // Must have no trailing slash and no `/v1` suffix — the SDK appends `/v1/messages`
    // itself, and `/v1/v1/messages` 404s in a way that reads like an auth failure.
    baseURL: env.LLM_BASE_URL,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0,
  })
}

// One instance across dev HMR re-evaluations and warm serverless invocations. The
// constructor performs no I/O, so this is about not rebuilding the object graph.
const globalForLlm = globalThis as unknown as { __llmClient?: Anthropic }

export const llm: Anthropic = (globalForLlm.__llmClient ??= build())

export const LLM_MODEL: string = env.LLM_MODEL
