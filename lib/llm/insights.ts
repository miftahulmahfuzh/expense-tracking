import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import type { WindowItemRow } from '@/lib/db/queries'
import type { InsightWindows } from '@/lib/insights/freshness'

import type { LlmClientLike } from './client'
import {
  buildInsightPrompt,
  formatInsightRows,
  INSIGHT_TOOL_NAME,
  RECORD_INSIGHT_TOOL,
} from './insightPrompt'

/**
 * item rows → three Indonesian summaries — F12 §7.1.
 *
 * Built to `parseExpense.ts`'s pattern rather than a new one: the portable Messages surface
 * only, ONE forced tool for structured output, Zod as the enforcement layer, an injectable
 * client so the unit suite never touches the network.
 *
 * ═══ THE CONTRACT DIFFERS FROM THE PARSER'S IN EXACTLY ONE WAY: THERE IS NO FALLBACK. ═══
 *
 * `fallbackParse.ts` exists because a regex can approximate a parse — the amounts are in the
 * text and a deterministic reading of them is worse but usable. NOTHING approximates prose.
 * A hand-written "pengeluaran Anda naik 12%" would be a sentence this app invented and
 * presented as analysis.
 *
 * So this returns `null` on any failure and the caller renders an honest empty state with a
 * retry. It writes no row, so the next page view tries again. It never throws for an LLM
 * problem — a summary is not worth a 500 on a page whose chart, total and breakdown are all
 * fine.
 *
 * NO REPAIR ROUND-TRIP either, and that is the other difference. The parser repairs because a
 * malformed `amount_idr` is a specific, nameable mistake worth pointing out. Three free-text
 * paragraphs either validate or the model has ignored the tool entirely, and re-asking costs a
 * second full request to fix nothing.
 */

/**
 * Milliseconds. Below the parser's 25s because there is no repair leg behind it and no user
 * blocked on it — the page has already painted, this only fills a Suspense boundary.
 */
export const INSIGHT_TIMEOUT_MS = 25_000

/** Three paragraphs of Indonesian. ~250 output tokens each at the top end. */
const MAX_TOKENS = 1600

/**
 * The boundary type. Snake_case at the wire, camelCase past it — the same convention
 * `ParsedExpense` follows, so the tool schema can read naturally in the prompt's own language
 * while the app's types read like the app.
 */
const InsightPayload = z.object({
  minggu: z.string().trim().min(1).max(1200),
  bulan: z.string().trim().min(1).max(1200),
  dua_bulan: z.string().trim().min(1).max(1200),
})

export interface InsightTexts {
  weekText: string
  monthText: string
  twoMonthText: string
}

export interface InsightUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export interface InsightResult {
  texts: InsightTexts
  usage: InsightUsage
}

export interface WriteInsightOptions {
  /**
   * The model id. Required and deliberately not defaulted: the production wrapper passes
   * `LLM_MODEL` from the validated environment, and a silent default is how a typo in
   * `.env.local` becomes a mystery 404 (roadmap §4.8).
   */
  model: string
}

function logFailure(stage: string, cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  /*
   * NEVER log the rows — they are the user's financial data, item names included. Stage plus
   * reason is enough to debug, and it is the same rule `parseExpense` states about `rawText`.
   */
  console.warn(`[F12 insight] stage=${stage} ${message}`)
}

function findToolUse(msg: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of msg.content) {
    if (block.type === 'tool_use' && block.name === INSIGHT_TOOL_NAME) return block
  }
  return null
}

/**
 * The testable core: the client is injected, so the unit suite runs with a fake and never
 * touches the network — nor `lib/llm/client.ts`, whose `server-only` marker is aliased away
 * under Vitest but whose env validation would still fire.
 */
export async function writeInsightsWith(
  client: LlmClientLike,
  windows: InsightWindows,
  rows: ReadonlyArray<WindowItemRow>,
  options: WriteInsightOptions,
): Promise<InsightResult | null> {
  /*
   * A user with no expenses in the window gets no summary and no model call. The empty state on
   * the page is a better answer than three paragraphs about nothing, and this is also what stops
   * a brand-new account paying for a request on its first visit to /stats.
   */
  if (rows.length === 0) return null

  const body: Anthropic.MessageCreateParamsNonStreaming = {
    // Exactly the portable Messages API surface and nothing Claude-specific: no `thinking`, no
    // `output_config`, no `speed`, no `betas`, no `cache_control`. GLM-5.2 is not a Claude model
    // and those either 400 or — worse — are silently ignored. F04 §0.1.
    model: options.model,
    max_tokens: MAX_TOKENS,
    system: buildInsightPrompt(windows),
    messages: [
      {
        role: 'user',
        content:
          `Berikut catatan pengeluaran ${windows.windowStartISO} sampai ${windows.todayISO}. ` +
          `Panggil ${INSIGHT_TOOL_NAME} tepat satu kali.\n\n<data>\n` +
          formatInsightRows(rows) +
          '\n</data>',
      },
    ],
    tools: [RECORD_INSIGHT_TOOL],
    // FORCED. Structured output on a portable endpoint comes from one required tool, not from a
    // response-format parameter this server does not implement.
    tool_choice: { type: 'tool', name: INSIGHT_TOOL_NAME },
  }

  let message: Anthropic.Message
  try {
    message = await client.messages.create(body, { timeout: INSIGHT_TIMEOUT_MS })
  } catch (cause) {
    logFailure('request', cause)
    return null
  }

  const block = findToolUse(message)
  if (!block) {
    logFailure('no-tool-use', `stop_reason=${message.stop_reason}`)
    return null
  }
  if (message.stop_reason === 'max_tokens') {
    // Truncated JSON. Not repairable: a retry truncates in the same place.
    logFailure('truncated', `max_tokens=${MAX_TOKENS}`)
    return null
  }

  const parsed = InsightPayload.safeParse(block.input)
  if (!parsed.success) {
    logFailure('invalid', parsed.error.issues.map((i) => i.path.join('.')).join(', '))
    return null
  }

  return {
    texts: {
      weekText: parsed.data.minggu,
      monthText: parsed.data.bulan,
      twoMonthText: parsed.data.dua_bulan,
    },
    /*
     * z.ai caches the prompt automatically and reports the cached portion in
     * `cache_read_input_tokens`, leaving `input_tokens` as the UNCACHED REMAINDER. Reporting
     * `input_tokens` alone understates a warm request by ~70x (lib/llm/COST.md), so both are
     * carried and total input is the sum.
     */
    usage: {
      inputTokens: message.usage?.input_tokens ?? 0,
      cachedInputTokens: message.usage?.cache_read_input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    },
  }
}

/**
 * Resolves the production client lazily, for the reason `parseExpense` documents: nothing that
 * merely imports this module should construct an API client or trigger env validation as a side
 * effect. Node caches the module, so only the first call pays anything.
 */
export async function writeInsights(
  windows: InsightWindows,
  rows: ReadonlyArray<WindowItemRow>,
): Promise<(InsightResult & { model: string }) | null> {
  const { llm, LLM_MODEL } = await import('./client')
  const result = await writeInsightsWith(llm, windows, rows, { model: LLM_MODEL })
  return result && { ...result, model: LLM_MODEL }
}
