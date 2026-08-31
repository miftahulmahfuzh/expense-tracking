'use client'

import * as React from 'react'

// Sibling import rather than through the barrel, exactly as `Sheet.tsx` does it:
// `index.ts` re-exports this file, so reaching the glyph through it would be a cycle.
import { CloseIcon } from './Icon'
import { cn } from '@/lib/cn'

export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastOptions {
  action?: ToastAction
  /** ms; default 5000. F07's undo needs the full window to be usable. */
  duration?: number
  tone?: 'neutral' | 'danger'
}

export interface ToastApi {
  show: (message: string, options?: ToastOptions) => void
  dismiss: () => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

interface ToastState extends ToastOptions {
  id: number
  message: string
}

/**
 * One toast at a time, mounted once in the root layout.
 *
 * A queue would be a lie on a 414px screen — the second message would be invisible anyway,
 * so a new toast replaces the current one rather than waiting behind it. The known
 * consequence, confirmed against F07: two destructive actions in quick succession lose the
 * first undo. That is the right trade against a stack of overlays covering the tab bar.
 *
 * The toast is a YELLOW STICKER — the same highlighter that marks the month pill and the
 * active tab, at full width. It does not flip with the theme: yellow on black type is
 * impossible to miss for the four seconds it lives, in either scheme, and a toast that
 * matched the page would be a message you could scroll past. It is also where destructive
 * actions get an "Urungkan" instead of a confirm dialog — undo after the fact beats a modal
 * before it, on every tap that is usually correct.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<ToastState | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = React.useRef(0)

  const dismiss = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = React.useCallback<ToastApi['show']>((message, options) => {
    if (timer.current) clearTimeout(timer.current)
    // A counter, not Date.now(): two toasts inside the same millisecond would share a key
    // and React would reuse the element, skipping the entry animation.
    seq.current += 1
    const id = seq.current
    setToast({ id, message, ...options })
    timer.current = setTimeout(() => setToast(null), options?.duration ?? 5000)
  }, [])

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const api = React.useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
       * A sibling of the app rather than a portal into document.body. The provider sits in
       * the root layout, so this div is already a direct child of <body> with no transformed
       * ancestor to break `position: fixed` — a portal would buy nothing and cost an
       * is-mounted flag to keep it out of the server render.
       *
       * The live region is rendered ALWAYS, empty when there is no toast. Screen readers
       * announce changes inside a region they were already watching; a region that appears
       * at the same moment as its message is frequently missed.
       */}
      <div
        role="status"
        aria-live="polite"
        // --toast-bottom is set in globals.css and lifts above the tab bar via :has(), so
        // this needs no measuring and no knowledge of which route it is on.
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
        style={{ bottom: 'var(--toast-bottom)' }}
      >
        {toast && (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-app items-center gap-3',
              'rounded-field bg-yellow py-3 pr-2 pl-4',
              'motion-safe:animate-[toast-in_220ms_var(--ease-out-soft)]',
            )}
          >
            <p
              className={cn(
                // The surface is yellow in both schemes, so the message is always the
                // design's near-black — never `ink`, which inverts to white in dark mode
                // and would vanish. `danger` reaches for the darkened red twin, which
                // clears 4.5:1 on yellow; the brand `--red` does not.
                'min-w-0 flex-1 text-chip',
                toast.tone === 'danger' ? 'text-[#8a1410]' : 'text-[#0d0d0d]',
              )}
            >
              {toast.message}
            </p>
            {/*
             * F16 — THE DISMISS CONTROL IS CONDITIONAL, AND ON THE ACTION RATHER THAN ON A PROP.
             *
             * Only a toast carrying an action is long-lived (`UNDO_DURATION_MS` is 7s against the
             * 5s default) and only there is dismissing a DECISION: it closes the undo window
             * early and means "I did mean to delete that". Every other toast in this app is a
             * statement that expires by itself, and a dismiss control on it would spend 32px of a
             * 382px row to save two seconds. `Sheet` makes the same call from the other
             * direction — its `showCloseButton` defaults to false.
             */}
            {toast.action && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onAction()
                    dismiss()
                  }}
                  className="min-h-touch shrink-0 press px-3 text-chip font-black text-[#0d0d0d] underline underline-offset-[3px]"
                >
                  {toast.action.label}
                </button>
                {/*
                 * `shrink-0` is F15's lesson applied before it can bite: the message is the only
                 * `min-w-0 flex-1` child, so it absorbs all the pressure by wrapping and neither
                 * control can be pushed off the sticker by a long item name.
                 *
                 * `touch-target grid size-8`, NOT `Sheet`'s painted `size-touch`: the hit area
                 * still reaches the 44px floor, but it costs 32px of a contested row instead of
                 * 44. The colour is the literal near-black and never `text-ink*` — the sticker is
                 * yellow in both schemes, so an inverting token would make this disappear in dark
                 * mode. It stays near-black on a `danger` toast too: this is chrome, not the
                 * message.
                 *
                 * No negative margin pulling it toward the label. 29px from the label's last
                 * glyph looks loose in a screenshot and is right under a thumb — the two HIT
                 * areas end up 6px apart (measured, F16 §4) — because a mistap here loses the
                 * undo for good where a mistap the other way costs nothing.
                 */}
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Tutup"
                  className="touch-target grid size-8 shrink-0 press place-items-center text-[#0d0d0d]"
                >
                  <CloseIcon />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
