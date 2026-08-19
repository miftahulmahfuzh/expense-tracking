import type Anthropic from '@anthropic-ai/sdk'
import { ParsedExpense } from '@/lib/schema/expense'
import type { LlmClientLike } from './client'
import { fallbackParse } from './fallbackParse'
import { RECORD_EXPENSE_TOOL, TOOL_NAME, buildSystemPrompt } from './prompt'
import {
  MAX_RAW_TEXT_CHARS,
  PARSE_ERROR_COPY,
  ParseError,
  type ParseInput,
  type ParseResult,
} from './types'

export * from './types'

/**
 * paste → `ParsedExpense`. The one module F05 talks to.
 *
 * THE CONTRACT: this never throws for an LLM problem. A timeout, a 500, prose instead of
 * a tool call, output that fails Zod twice — all of it degrades to the deterministic
 * regex fallback with `degraded: true`, and F05 shows a "cek lagi" banner. It throws only
 * when there is genuinely nothing to return: blank input, oversized input, or no priced
 * line found by either path.
 *
 * TIME BUDGET (Vercel Hobby caps a function at 60s):
 *   primary 25s + repair 15s = 40s worst case, under a 45s internal wall-clock deadline,
 *   inside the route's `maxDuration = 60`. The repair is skipped outright if less than 3s
 *   of budget remains, because starting a round-trip we cannot finish is worse than
 *   falling back.
 */

const MAX_TOKENS = 4000
const PRIMARY_TIMEOUT_MS = 25_000
const REPAIR_TIMEOUT_MS = 15_000
const OVERALL_DEADLINE_MS = 45_000
/** Below this, do not start a repair round-trip — we would risk the 60s ceiling. */
const MIN_REPAIR_BUDGET_MS = 3_000

export interface ParseExpenseOptions {
  /**
   * The model id to send. Required, and deliberately not defaulted: the production
   * wrappers pass `LLM_MODEL` from the validated environment, and a silent default is
   * how a typo in `.env.local` becomes a mystery 404 (roadmap §4.8).
   */
  model: string
}

function userTurn(rawText: string): Anthropic.MessageParam {
  return {
    role: 'user',
    content:
      'Extract the expense group from the text between the markers. ' +
      'Call record_expense exactly once.\n\n' +
      '<paste>\n' +
      rawText +
      '\n</paste>',
  }
}

function baseBody(
  model: string,
  system: string,
  messages: Anthropic.MessageParam[],
): Anthropic.MessageCreateParamsNonStreaming {
  // Exactly the portable Messages API surface, and nothing Claude-specific. The
  // "sends exactly the allowed request surface" test asserts these six keys and no more.
  return {
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    tools: [RECORD_EXPENSE_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  }
}

function findToolUse(msg: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of msg.content) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME) return block
  }
  return null
}

/** Compact, model-readable summary of what Zod rejected. */
function describeZodIssues(err: unknown): string {
  const issues = (err as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return String(err)
  return issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
}

const REPAIR_PREAMBLE =
  'Your record_expense call did not validate. Fix ONLY the listed problems and call ' +
  'record_expense again with the corrected data. Remember: amount_idr is a whole-rupiah ' +
  'JSON integer (45000, not "45000" and not 45.0); Rp 38.500 is 38500 because "." is the ' +
  'thousands separator; occurred_on is YYYY-MM-DD with the Indonesian day/month order; ' +
  'category is one of food, groceries, transport, bills, housing, entertainment, health, ' +
  'other.\n\nValidation errors:\n'

function logLlmFailure(stage: string, cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  // NEVER log rawText — it is the user's financial data. Stage plus reason is enough to
  // debug, and `lib/llm/__tests__/parseExpense.test.ts` asserts the paste never appears.
  console.warn(`[F04 parse] stage=${stage} ${message}`)
}

/**
 * The testable core: the client is injected, so the unit suite runs with a fake and
 * never touches the network (nor `lib/llm/client.ts`, whose `server-only` marker throws
 * outside an RSC graph).
 */
export async function parseExpenseWith(
  client: LlmClientLike,
  input: ParseInput,
  options: ParseExpenseOptions,
): Promise<ParseResult> {
  const rawText = input.rawText
  if (rawText.trim() === '') throw new ParseError('empty_input', PARSE_ERROR_COPY.empty_input)
  if (rawText.length > MAX_RAW_TEXT_CHARS) {
    throw new ParseError('input_too_long', PARSE_ERROR_COPY.input_too_long)
  }

  const deadline = Date.now() + OVERALL_DEADLINE_MS
  const system = buildSystemPrompt(input.todayISO)
  const messages: Anthropic.MessageParam[] = [userTurn(rawText)]
  const remaining = () => Math.max(1, deadline - Date.now())

  let inputTokens = 0
  let outputTokens = 0

  // ---- Attempt 1 -----------------------------------------------------------------
  let first: Anthropic.Message | null = null
  try {
    first = await client.messages.create(baseBody(options.model, system, messages), {
      timeout: Math.min(PRIMARY_TIMEOUT_MS, remaining()),
    })
    inputTokens += first.usage?.input_tokens ?? 0
    outputTokens += first.usage?.output_tokens ?? 0
  } catch (cause) {
    logLlmFailure('primary', cause)
  }

  const firstBlock = first ? findToolUse(first) : null
  // A tool_use cut off at max_tokens is truncated JSON: not worth repairing, since the
  // retry would truncate at the same place. Straight to the fallback.
  const truncated = first?.stop_reason === 'max_tokens'
  if (first && !firstBlock) logLlmFailure('primary-no-tool-use', `stop_reason=${first.stop_reason}`)
  if (truncated) logLlmFailure('primary-truncated', `max_tokens=${MAX_TOKENS}`)

  if (firstBlock && !truncated) {
    const parsed = ParsedExpense.safeParse(firstBlock.input)
    if (parsed.success) {
      return {
        expense: parsed.data,
        source: 'llm',
        degraded: false,
        usage: { inputTokens, outputTokens },
      }
    }

    // ---- Attempt 2: exactly one repair round-trip ---------------------------------
    if (deadline - Date.now() > MIN_REPAIR_BUDGET_MS) {
      const repairMessages: Anthropic.MessageParam[] = [
        ...messages,
        { role: 'assistant', content: [firstBlock] },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: firstBlock.id,
              is_error: true,
              content: REPAIR_PREAMBLE + describeZodIssues(parsed.error),
            },
          ],
        },
      ]

      try {
        const second = await client.messages.create(
          baseBody(options.model, system, repairMessages),
          { timeout: Math.min(REPAIR_TIMEOUT_MS, remaining()) },
        )
        inputTokens += second.usage?.input_tokens ?? 0
        outputTokens += second.usage?.output_tokens ?? 0

        const secondBlock = findToolUse(second)
        if (secondBlock && second.stop_reason !== 'max_tokens') {
          const repaired = ParsedExpense.safeParse(secondBlock.input)
          if (repaired.success) {
            return {
              expense: repaired.data,
              source: 'llm_repair',
              degraded: true,
              usage: { inputTokens, outputTokens },
            }
          }
          logLlmFailure('repair-invalid', describeZodIssues(repaired.error))
        }
      } catch (cause) {
        logLlmFailure('repair', cause)
      }
    } else {
      logLlmFailure('repair-skipped', 'not enough wall-clock budget left')
    }
  }

  // ---- Attempt 3: deterministic fallback. The user is never hard-blocked. ----------
  const fb = fallbackParse(input)
  if (fb) {
    const checked = ParsedExpense.safeParse(fb)
    if (checked.success) {
      return {
        expense: checked.data,
        source: 'fallback',
        degraded: true,
        usage: inputTokens || outputTokens ? { inputTokens, outputTokens } : null,
      }
    }
    // Would be a bug in fallbackParse, not in the model. Its own suite asserts every
    // fixture round-trips through Zod.
    logLlmFailure('fallback-invalid', describeZodIssues(checked.error))
  }

  throw new ParseError('no_items_found', PARSE_ERROR_COPY.no_items_found)
}

/**
 * Resolves the production client lazily.
 *
 * `./client` imports `server-only` and `@/lib/env`; both throw when evaluated outside a
 * React Server Components graph. Importing it at module scope here would therefore make
 * `parseExpense.ts` — and anything that imports it, including F05's tests — unloadable
 * under Vitest. `await import()` keeps the module graph honest at build time (the client
 * is still server-only) while leaving the parser testable. Node caches the module, so
 * only the first call pays anything.
 */
async function productionClient(): Promise<{ client: LlmClientLike; model: string }> {
  const { llm, LLM_MODEL } = await import('./client')
  return { client: llm, model: LLM_MODEL }
}

/** The signature F05 imports. Returns the boundary type and nothing else. */
export async function parseExpense(input: ParseInput): Promise<ParsedExpense> {
  const { client, model } = await productionClient()
  const { expense } = await parseExpenseWith(client, input, { model })
  return expense
}

/** Same work, but reports whether the LLM actually succeeded. Used by `/api/parse`. */
export async function parseExpenseWithMeta(input: ParseInput): Promise<ParseResult> {
  const { client, model } = await productionClient()
  return parseExpenseWith(client, input, { model })
}
