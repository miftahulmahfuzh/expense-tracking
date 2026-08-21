'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

/*
 * Body scroll lock, reference-counted so a nested sheet closing does not unlock the page
 * while its parent is still open.
 */
let lockCount = 0

function lockBody() {
  if (lockCount++ === 0) document.body.style.overflow = 'hidden'
}

function unlockBody() {
  if (--lockCount <= 0) {
    lockCount = 0
    document.body.style.overflow = ''
  }
}

export interface SheetProps {
  /** Parent owns the state. There is no internal toggle — see the note below. */
  open: boolean
  /** Fires for Escape, a scrim tap, and the ✕ if one is shown. */
  onClose: () => void
  /** Required: it is the accessible name. Use `hideTitle` to hide it visually. */
  title: string
  hideTitle?: boolean
  /** Optional one-line explanation under the title. */
  description?: string
  /** Pinned below the scrolling body, padded clear of the home indicator. */
  footer?: React.ReactNode
  /**
   * Default `false`. The design specifies no close button — the grabber plus a scrim tap
   * is the iOS convention, and a ✕ competes with the sheet's own primary action for the
   * top-right of a 414px screen. Escape and the scrim always work regardless.
   */
  showCloseButton?: boolean
  /** Applied to the panel. */
  className?: string
  children: React.ReactNode
}

/**
 * The app's one overlay pattern: category picking and item editing both live in it.
 *
 * Built on a native `<dialog>` + `.showModal()`, which buys focus trapping, Escape
 * handling, top-layer stacking and background inertness from the platform instead of 200
 * lines of custom trap logic — simpler *and* more correct. The CSS in globals.css supplies
 * the motion; this file supplies only state plumbing and geometry.
 *
 * It earns its layer from the scrim behind it, not from a shadow and not from a border —
 * 16px corners on a white block against a darkened page is the whole elevation.
 *
 * Four things here are load-bearing and easy to break:
 *
 *  - **`open` is a prop, never internal state.** Every consumer already has the state —
 *    which item is being edited, which chip was tapped. Two sources of truth is the cause
 *    of every sheet bug worth having.
 *  - **`onCancel` must `preventDefault()`.** Otherwise Escape closes the dialog underneath
 *    React, `open` stays `true`, and the sheet can never be reopened. Open → Escape → open
 *    again is the regression test.
 *  - **The safe-area padding is on the footer, not the panel.** The home indicator sits
 *    under the bottom ~34px; a button flush to the panel edge is physically unreachable.
 *  - **`scroll-pane` is on the body, not the panel.** The panel is a flex column with a
 *    fixed head and foot; only the middle scrolls, and its overscroll is contained so the
 *    page behind never rubber-bands.
 *
 * Known limitation: iOS Safari's background-scroll suppression for a modal dialog plus
 * `overflow: hidden` on `body` is good but not perfect — a very long page can still shift a
 * few pixels. The `position: fixed` body-lock alternative causes a scroll-position jump,
 * which is worse. Accept the imperfection.
 */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  footer,
  showCloseButton = false,
  className,
  children,
}: SheetProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()
  const descId = React.useId()

  /*
   * A PASSIVE effect, deliberately. 1d57431 made this a layout one to save the frame between
   * commit and paint, on the theory that the sheet was arriving late; it was not — it was
   * painting a whole panel-height off (see the `overflow: clip` note in globals.css), and the
   * timing change fixed nothing. A layout effect also runs while the click that opened the
   * sheet is still being dispatched, which lands the new dialog under the finger that opened
   * it. Passive costs a frame and asks no questions.
   */
  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
      lockBody()
      // Land focus on the panel, not on whichever control happens to be first, so a screen
      // reader announces the sheet before its contents.
      panelRef.current?.focus()
      return () => unlockBody()
    }

    if (dialog.open) dialog.close()
    return undefined
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (open) onClose()
      }}
      // On a modal <dialog> the ::backdrop's event target is the dialog element itself, so
      // this identity test is exact: a tap inside the panel can never match.
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div ref={panelRef} tabIndex={-1} className={cn('sheet-panel focus:outline-none', className)}>
        {/* Grabber: 44×5, a visual affordance only. Drag-to-dismiss is deferred to v0.2 —
            iOS users will try to drag it, and accepting that small dishonesty keeps ~120
            lines of pointer-event handling out of v0.1.0. */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-3.5" aria-hidden="true">
          <div className="h-[5px] w-11 rounded-full bg-rule-strong" />
        </div>

        <div className="flex shrink-0 items-start gap-3 px-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={cn('text-sheet', hideTitle && 'sr-only')}>
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1.5 text-body text-ink-2">
                {description}
              </p>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="-mt-3 -mr-2.5 grid size-touch shrink-0 press place-items-center text-ink-3"
            >
              <span aria-hidden="true" className="text-[22px] leading-none font-extrabold">
                ×
              </span>
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 scroll-pane px-4 pt-3.5">{children}</div>

        {/* `pb-2`, no safe inset — the 8px edge rule (globals.css). A docked sheet owns the
            bottom edge exactly like `/new`'s footer does, and its button's 44px tap target
            supplies the remaining slack that puts the label 22px up. */}
        <div className="shrink-0 px-4 pt-2 pb-2">{footer}</div>
      </div>
    </dialog>
  )
}
