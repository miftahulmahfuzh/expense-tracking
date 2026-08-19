'use client'

import * as React from 'react'
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
 * The toast inverts to ink so it reads as a different layer without a shadow (design R-36),
 * and it is where destructive actions get an "Urungkan" instead of a confirm dialog — undo
 * after the fact beats a modal before it, on every tap that is usually correct.
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
              'rounded-field bg-ink py-3.5 pr-2 pl-4',
              'motion-safe:animate-[toast-in_220ms_var(--ease-out-soft)]',
            )}
          >
            <p
              className={cn(
                'min-w-0 flex-1 text-body',
                // The surface is ink in both schemes, so the message is always `paper`.
                // `danger` warms it with red-soft rather than --red, which would be
                // unreadable on ink in light mode.
                toast.tone === 'danger' ? 'text-red-soft' : 'text-paper',
              )}
            >
              {toast.message}
            </p>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onAction()
                  dismiss()
                }}
                className="min-h-touch shrink-0 press px-3 font-mono text-action text-paper uppercase underline underline-offset-[3px]"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
