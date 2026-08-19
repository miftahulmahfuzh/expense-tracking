'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { fallbackParse } from '@/lib/llm/fallbackParse'
import { MAX_RAW_TEXT_CHARS, PARSE_ERROR_COPY, type ParseSource } from '@/lib/llm/types'
import { ParsedExpense } from '@/lib/schema/expense'

import { CLIENT_COPY } from './copy'
import type { ParseFailure } from './draft'

/**
 * The one network call /new makes before saving.
 *
 * Built against F04's published wire contract: 200 returns the envelope
 * `{ ok: true, expense, source, degraded }`, and every failure returns
 * `{ ok: false, error: { code, message } }` where `message` is Indonesian copy F04
 * guarantees is safe to render verbatim. So this hook authors copy only for the handful of
 * failures the browser detects on its own, and renders F04's for everything else.
 *
 * THE INVARIANT THIS FILE PROTECTS: a parse failure is a degraded success. Except for
 * `unauthorized`, `input_too_long` and `rate_limited` — where the user must do something
 * before a table would help — every outcome carries a `fallback` the caller can put on
 * screen. Never a dead end.
 */

/**
 * F04's route declares maxDuration 60 with its own 45 s internal deadline. We stop waiting
 * at 35 s: past that the user has given up, and we have a local fallback to offer instead of
 * a spinner.
 */
const CLIENT_TIMEOUT_MS = 35_000

/** When to admit it is taking a while. Below this, saying so is just noise. */
export const SLOW_HINT_MS = 8_000

export type ParseOutcome =
  | { ok: true; parsed: ParsedExpense; source: ParseSource; degraded: boolean }
  | { ok: false; failure: ParseFailure; fallback: ParsedExpense | null }

type ApiOk = { ok: true; expense: unknown; source: ParseSource; degraded: boolean }
type ApiErr = { ok: false; error: { code: string; message: string } }

/** The codes F04 documents. Anything else is treated as a server error. */
const KNOWN_CODES = new Set<ParseFailure['code']>([
  'unauthorized',
  'bad_request',
  'empty_input',
  'input_too_long',
  'no_items_found',
  'rate_limited',
  'server_error',
])

/**
 * Best-effort local rescue, and the whole reason the offline path is not a dead end: with no
 * network there is no server to ask for a fallback. F04 keeps `fallbackParse` pure and free
 * of `server-only` precisely so it can run in the browser — a standing constraint on its
 * future edits, asserted by scripts/f05-preflight.sh.
 *
 * The result is re-validated with the same Zod schema the wire path uses, because a local
 * parser that returns a subtly wrong shape would fail later, inside the save, where the only
 * message available is generic.
 */
function localFallback(rawText: string, todayISO: string): ParsedExpense | null {
  try {
    const parsed = fallbackParse({ rawText, todayISO })
    if (!parsed) return null
    const check = ParsedExpense.safeParse(parsed)
    return check.success ? check.data : null
  } catch {
    return null
  }
}

export function useParse() {
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  /*
   * A ticking elapsed time, so the slow hint can appear without the caller polling.
   *
   * The counter is reset in `run()` — an event handler — rather than in this effect's body.
   * Setting state synchronously inside an effect triggers a cascading render, and the lint
   * rule that catches it is right: subscribing here and publishing from the interval
   * callback is what an effect is for.
   */
  useEffect(() => {
    if (!running) return
    const startedAt = Date.now()
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 500)
    return () => window.clearInterval(id)
  }, [running])

  // Abort in flight on unmount, or the response lands on a dead component.
  useEffect(() => () => abortRef.current?.abort(), [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
  }, [])

  const run = useCallback(async (rawText: string, todayISO: string): Promise<ParseOutcome> => {
    /*
     * The length cap is checked here, not only server-side. F04's route answers 413 for
     * anything over MAX_RAW_TEXT_CHARS (R-69 settled the number at 8.000 and amended F03a's
     * schema to match), so sending it anyway spends a round trip to be told something we
     * already know. F04's own PARSE_ERROR_COPY is reused rather than re-worded — one
     * vocabulary, one place.
     */
    if (rawText.length > MAX_RAW_TEXT_CHARS) {
      return {
        ok: false,
        failure: { code: 'input_too_long', message: PARSE_ERROR_COPY.input_too_long },
        fallback: null, // shortening the text comes first; a table would not help
      }
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        ok: false,
        failure: { code: 'offline', message: CLIENT_COPY.offline },
        fallback: localFallback(rawText, todayISO),
      }
    }

    const controller = new AbortController()
    abortRef.current = controller
    const timer = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
    setElapsedMs(0)
    setRunning(true)

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, todayISO }),
        signal: controller.signal,
      })

      // `.catch(() => null)` because a proxy error page or a truncated response is not JSON,
      // and a throw here would surface as the catch block's generic message with no code.
      const body = (await response.json().catch(() => null)) as ApiOk | ApiErr | null

      if (!response.ok || !body || body.ok !== true) {
        const raw = (body as ApiErr | null)?.error
        const code =
          raw && KNOWN_CODES.has(raw.code as ParseFailure['code'])
            ? (raw.code as ParseFailure['code'])
            : 'server_error'
        return {
          ok: false,
          // F04's message is user-facing Indonesian by contract. Our own copy substitutes in
          // only when the body could not be read at all.
          failure: { code, message: raw?.message || CLIENT_COPY.server_error },
          /*
           * unauthorized must NOT drop the user into a table: their session is gone, so
           * Simpan would fail too, and filling in a form first would waste the work. Same
           * for the two the user can fix by changing the input.
           */
          fallback:
            code === 'unauthorized' || code === 'input_too_long' || code === 'rate_limited'
              ? null
              : localFallback(rawText, todayISO),
        }
      }

      const check = ParsedExpense.safeParse(body.expense)
      if (!check.success) {
        return {
          ok: false,
          failure: { code: 'invalid_response', message: CLIENT_COPY.invalid_response },
          fallback: localFallback(rawText, todayISO),
        }
      }
      return { ok: true, parsed: check.data, source: body.source, degraded: body.degraded }
    } catch (error) {
      // An abort is either our own timeout or an unmount; offline is a fetch TypeError.
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const code: ParseFailure['code'] = aborted ? 'timeout' : offline ? 'offline' : 'server_error'
      return {
        ok: false,
        // Never built out of the exception: an internal string must not reach the screen.
        failure: { code, message: CLIENT_COPY[code] },
        fallback: localFallback(rawText, todayISO),
      }
    } finally {
      window.clearTimeout(timer)
      abortRef.current = null
      setRunning(false)
    }
  }, [])

  return { run, cancel, running, elapsedMs }
}
