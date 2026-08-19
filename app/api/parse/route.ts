import { z } from 'zod'
import { UnauthorizedError, requireUserIdApi } from '@/lib/auth/requireUserId'
import { parseExpenseWithMeta } from '@/lib/llm/parseExpense'
import { MAX_RAW_TEXT_CHARS, isParseError } from '@/lib/llm/types'

/**
 * POST /api/parse — roadmap §4.5. Body `{ rawText, todayISO }` → `ParsedExpense`.
 *
 * A Route Handler rather than a Server Action because F05 calls it from a client
 * component with a loading state and needs a status code it can branch on (roadmap D6
 * lists this as one of the three sanctioned handlers).
 */

// Explicit, though 'nodejs' is the Next 16 default: this route loads the Anthropic SDK
// and server-only env, and must never be flipped to the Edge runtime.
export const runtime = 'nodejs'
// Vercel Hobby's ceiling. parseExpense's own wall-clock deadline is 45s, so this is
// headroom, not a target. No `dynamic` export: a POST handler is never prerendered, and
// Next 16 dropped `dynamic` from the route-segment config table.
export const maxDuration = 60

/**
 * Deliberately NOT `ParseRequest` from `lib/schema/expense.ts`, which trims and requires
 * min(1). This route must tell "you sent nothing" (400 `empty_input`, keep the textarea
 * focused) apart from "your request is malformed" (400 `bad_request`, refresh the page)
 * and from "too long" (413), and a schema that rejects all three identically cannot. The
 * 8.000-char cap is the same constant in both places.
 */
const Body = z.object({
  rawText: z.string().max(MAX_RAW_TEXT_CHARS),
  todayISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** Every message here is rendered verbatim in the UI. Indonesian-flavoured, no jargon. */
const COPY = {
  unauthorized: 'Sesi kamu habis. Login lagi ya.',
  bad_request: 'Ada yang salah sama datanya. Coba refresh halamannya.',
  empty_input: 'Teksnya masih kosong. Tulis dulu pengeluarannya ya.',
  input_too_long:
    'Teksnya kepanjangan (maks 8.000 karakter). Potong dulu, atau bagi jadi dua catatan.',
  rate_limited: 'Kebanyakan request. Tunggu sebentar terus coba lagi ya.',
  server_error: 'Lagi ada gangguan di server. Coba lagi sebentar lagi.',
} as const

/**
 * One error envelope for all six failure codes: `{ ok: false, error: { code, message } }`.
 *
 * F02 also publishes `unauthorizedJson()`, whose body is `{ error: 'Unauthorized' }`. It is
 * NOT used here on purpose: F05 branches on `body.error.code` and renders
 * `body.error.message`, and a route that answers 401 in one shape and its other six
 * statuses in another forces every caller to special-case exactly the path it is least
 * likely to exercise in development. The status code is identical either way.
 */
function fail(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ ok: false, error: { code, message } }, { status, headers })
}

/**
 * Abuse control. Roadmap D3 lets ANY Google account sign in, so this route is an
 * authenticated but open door onto metered LLM spend: one signed-in stranger with a shell
 * loop can burn the z.ai budget.
 *
 * v0.1.0's defence, in layers:
 *   1. Auth required (below).
 *   2. The hard 8.000-char input cap — bounds the cost of any single call.
 *   3. max_tokens 4000 in parseExpense — bounds output cost.
 *   4. This burst limiter.
 *
 * It is BEST EFFORT ONLY, and reconciliation R-30 accepted that consciously. Serverless
 * instances share no memory, so an attacker spread across N warm instances gets N× the
 * allowance. It stops an accidental render loop and a casual curl loop; it does not stop
 * a determined attacker. The durable fix is a per-user daily counter (plan OQ-5), which
 * needs either a schema delta or a KV dependency. Do not mistake this for a security
 * control.
 */
const WINDOW_MS = 60_000
const BURST = 10

const globalForHits = globalThis as unknown as { __parseHits?: Map<string, number[]> }
const hits = (globalForHits.__parseHits ??= new Map<string, number[]>())

function overBurst(userId: string): boolean {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(userId, recent)
  if (hits.size > 5000) hits.clear() // crude unbounded-growth guard
  return recent.length > BURST
}

export async function POST(request: Request): Promise<Response> {
  // Line 1, always (F02 INVARIANT A). `requireUserIdApi` throws instead of redirecting —
  // `requireUserId()` would answer a fetch() with a 307 to an HTML page.
  let userId: string
  try {
    userId = await requireUserIdApi()
  } catch (e) {
    if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', COPY.unauthorized)
    throw e
  }

  // Before body parsing, so a burst of huge bodies is cheap to refuse. After auth, so an
  // unauthenticated flood cannot exhaust a real user's allowance.
  if (overBurst(userId)) {
    return fail(429, 'rate_limited', COPY.rate_limited, { 'retry-after': '60' })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return fail(400, 'bad_request', COPY.bad_request)
  }

  const body = Body.safeParse(json)
  if (!body.success) {
    // Zod's `.max()` rejects before we can distinguish "too long" from "wrong shape", so
    // the raw JSON is re-read here to answer 413 rather than a misleading 400.
    const rawText = (json as { rawText?: unknown } | null)?.rawText
    const tooLong = typeof rawText === 'string' && rawText.length > MAX_RAW_TEXT_CHARS
    return tooLong
      ? fail(413, 'input_too_long', COPY.input_too_long)
      : fail(400, 'bad_request', COPY.bad_request)
  }

  if (body.data.rawText.trim() === '') {
    return fail(400, 'empty_input', COPY.empty_input)
  }

  try {
    const result = await parseExpenseWithMeta(body.data)
    // `usage` is deliberately omitted — token counts are our business, not the client's.
    return Response.json({
      ok: true,
      expense: result.expense,
      source: result.source,
      degraded: result.degraded,
    })
  } catch (e) {
    if (isParseError(e)) {
      const status = e.reason === 'input_too_long' ? 413 : e.reason === 'empty_input' ? 400 : 422
      return fail(status, e.reason, e.userMessage)
    }
    // Never surface the raw message: it can carry the base URL or fragments of the key.
    console.error('[F04 /api/parse] unexpected', e)
    return fail(500, 'server_error', COPY.server_error)
  }
}
