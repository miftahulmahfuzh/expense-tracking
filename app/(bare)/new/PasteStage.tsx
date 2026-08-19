'use client'

import { useEffect, useRef } from 'react'

import { Button, Field, TextArea } from '@/components/ui'
import { signInWithGoogleAction } from '@/lib/auth/actions'

import {
  MANUAL_CTA,
  PARSE_BUSY,
  PARSE_CTA,
  PLACEHOLDER,
  RESTORED_DISCARD,
  RESTORED_NOTICE,
  SIGN_IN_AGAIN,
  SLOW_HINT,
  SUBHEADING,
} from './copy'
import { ReviewSkeleton } from './ReviewSkeleton'
import { StickyBar } from './StickyBar'
import { estimateRows, type ParseStatus } from './draft'

/**
 * Stage 1: paste.
 *
 * One big textarea whose placeholder IS the canonical example, so the format teaches itself
 * without a help text nobody reads. The sticky Rapikan sits above the keyboard (see
 * useVisualViewport), and "isi manual" underneath it is the escape hatch for the day the LLM
 * is having a bad time — or for someone who would simply rather type.
 */
export function PasteStage({
  rawText,
  parse,
  elapsedMs,
  slowAfterMs,
  restoredNotice,
  onRawChange,
  onParse,
  onManual,
  onDiscardRestored,
}: {
  rawText: string
  parse: ParseStatus
  elapsedMs: number
  slowAfterMs: number
  restoredNotice: boolean
  onRawChange: (value: string) => void
  onParse: () => void
  onManual: () => void
  onDiscardRestored: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const loading = parse.kind === 'loading'
  const failure = parse.kind === 'error' ? parse.failure : null

  useEffect(() => {
    /*
     * Caret only. iOS will not raise the keyboard without a user gesture and we neither
     * fight that nor fake it. Skipped entirely when a draft was restored: focusing then
     * would open the keyboard on a desktop browser and push the restore notice — the one
     * thing the user needs to read — off the top of the fold.
     */
    if (!restoredNotice && rawText.length === 0) textareaRef.current?.focus()
    // Mount only: re-running this on every keystroke would fight the user's own focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canParse = rawText.trim().length > 0 && !loading

  return (
    <>
      <div className="flex-1 px-safe">
        <p className="mb-3 text-body text-ink-2">{SUBHEADING}</p>

        {restoredNotice ? (
          <div className="mb-3 flex items-center gap-3 rounded-card border border-rule bg-paper-2 px-3 py-2">
            {/* A one-line notice rather than a silent restore: quietly refilling a screen
                with a stale draft is more confusing than saying so. */}
            <span className="flex-1 text-body">{RESTORED_NOTICE}</span>
            <button
              type="button"
              onClick={onDiscardRestored}
              className="min-h-touch press px-2 font-mono text-action text-ink-2 uppercase"
            >
              {RESTORED_DISCARD}
            </button>
          </div>
        ) : null}

        {failure ? (
          <div role="alert" className="mb-3 rounded-card border border-red bg-red-soft px-3 py-2.5">
            {/* F04 guarantees this message is Indonesian and safe to render verbatim, and
                F05 never builds a message out of an exception — so no internal string can
                reach this element. */}
            <p className="text-body">{failure.message}</p>

            {failure.code === 'unauthorized' ? (
              /*
               * F02's own Server Action, exactly as `/` uses it — not a link to
               * /api/auth/signin. That keeps `signIn` (which is server-only) away from this
               * client boundary, routes through safeNext, and comes back to /new afterwards,
               * where the draft is still in localStorage waiting.
               */
              <form action={signInWithGoogleAction} className="mt-2.5">
                <input type="hidden" name="next" value="/new" />
                <Button type="submit" variant="secondary" size="md">
                  {SIGN_IN_AGAIN}
                </Button>
              </form>
            ) : null}

            {failure.code === 'input_too_long' ? (
              // A live count, because "too long" without a number is not actionable.
              <p className="mt-1.5 font-mono tabular text-meta text-ink-2">
                {rawText.length.toLocaleString('id-ID')} karakter
              </p>
            ) : null}
          </div>
        ) : null}

        <Field label="Teks pengeluaran" hideLabel>
          <TextArea
            id="raw-text"
            ref={textareaRef}
            value={rawText}
            onChange={(event) => onRawChange(event.target.value)}
            disabled={loading}
            rows={10}
            placeholder={PLACEHOLDER}
            // Off across the board: this is pasted bookkeeping, not prose, and iOS
            // autocapitalising "roti buaya" into "Roti Buaya" is a small daily annoyance.
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // No enterKeyHint: Enter must insert a newline here, not submit.
            className="font-mono"
          />
        </Field>

        {/* Announced once, politely. The skeleton itself is aria-hidden, so this is the only
            thing a screen reader hears — rather than eight empty rows. */}
        <p role="status" aria-live="polite" className="sr-only">
          {loading ? 'Sedang merapikan teks.' : ''}
        </p>

        {loading ? (
          <div className="mt-5">
            {elapsedMs > slowAfterMs ? (
              <p className="mb-2 font-mono text-meta text-ink-3" aria-live="polite">
                {SLOW_HINT}
              </p>
            ) : null}
            <ReviewSkeleton rows={estimateRows(rawText)} />
          </div>
        ) : null}

        <div className="h-6" />
      </div>

      <StickyBar>
        <Button type="button" fullWidth onClick={onParse} disabled={!canParse} loading={loading}>
          {loading ? PARSE_BUSY : PARSE_CTA}
        </Button>
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onManual}
            className="min-h-touch press px-3 font-mono text-action text-ink-3 uppercase"
          >
            {MANUAL_CTA}
          </button>
        </div>
      </StickyBar>
    </>
  )
}
