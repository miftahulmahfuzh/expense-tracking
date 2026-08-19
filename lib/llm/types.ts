import type { ParsedExpense } from '@/lib/schema/expense'

/**
 * F04's published vocabulary. Deliberately free of any `@anthropic-ai/sdk` import and
 * of `server-only`, so a client component may import `ParseError` / `isParseError` to
 * render an error state without dragging the SDK — or the API key — into the browser
 * bundle.
 *
 * `lib/llm/parseExpense.ts` re-exports everything here, so F05 can import from either.
 */

export interface ParseInput {
  /** The raw pasted text, verbatim. 1..8000 chars. */
  rawText: string
  /** Today in Asia/Jakarta, 'YYYY-MM-DD'. From `todayJakartaISO()`. */
  todayISO: string
}

/** Where the returned expense actually came from. */
export type ParseSource = 'llm' | 'llm_repair' | 'fallback'

export interface ParseResult {
  expense: ParsedExpense
  source: ParseSource
  /** true when source !== 'llm' — F05 should warn the user to double-check. */
  degraded: boolean
  /**
   * Token usage of the primary + repair calls, for logging. null when no LLM call
   * contributed (fallback after a transport failure).
   *
   * `cachedInputTokens` is not decoration: z.ai applies prompt caching AUTOMATICALLY,
   * without us sending `cache_control`, and reports the cached portion separately. A
   * measured canonical parse is `inputTokens: 82` + `cachedInputTokens: 4224` — so
   * reading `inputTokens` alone understates the real prompt by ~50x. Total input is the
   * sum of the two.
   */
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null
}

export type ParseFailureReason = 'empty_input' | 'input_too_long' | 'no_items_found'

/**
 * The only error F04 throws. An LLM problem is never one of these — LLM problems
 * degrade to the deterministic fallback, so this fires only when there is genuinely
 * nothing to hand back.
 */
export class ParseError extends Error {
  readonly name = 'ParseError'
  readonly reason: ParseFailureReason
  /** Indonesian-flavoured copy, safe to render directly in the UI. */
  readonly userMessage: string

  constructor(reason: ParseFailureReason, userMessage: string, options?: { cause?: unknown }) {
    super(`${reason}: ${userMessage}`, options)
    this.reason = reason
    this.userMessage = userMessage
  }
}

/**
 * Narrowing helper for F05 and the route.
 *
 * Checks the `name` field rather than `instanceof` alone: a Server Action boundary or a
 * duplicated module instance (dev HMR) can produce a structurally identical error whose
 * prototype chain no longer matches this class.
 */
export function isParseError(e: unknown): e is ParseError {
  return (
    e instanceof ParseError ||
    (e instanceof Error && e.name === 'ParseError' && 'reason' in e && 'userMessage' in e)
  )
}

/**
 * Hard input cap, in characters (plan §Interfaces). Bounds the cost of any single LLM
 * call, which is the first line of defence on a route that D3 opens to any Google
 * account. `POST /api/parse` and `parseExpense` both enforce it.
 */
export const MAX_RAW_TEXT_CHARS = 8000

/** Renderable copy for every thrown reason. Indonesian-flavoured, no placeholders. */
export const PARSE_ERROR_COPY: Record<ParseFailureReason, string> = {
  empty_input: 'Teksnya masih kosong. Tulis dulu pengeluarannya ya.',
  input_too_long:
    'Teksnya kepanjangan (maks 8.000 karakter). Potong dulu, atau bagi jadi dua catatan.',
  no_items_found:
    'Nggak nemu satu pun pengeluaran di teks ini. Coba tulis satu baris per item, misalnya: ayam geprek 25k',
}
