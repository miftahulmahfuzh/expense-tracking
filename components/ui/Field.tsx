'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

interface FieldContextValue {
  inputId: string
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

/** For a custom control that wants `Field`'s wiring but is not `Input`/`TextArea`. */
export function useFieldContext(): FieldContextValue | null {
  return React.useContext(FieldContext)
}

export interface FieldProps {
  label: string
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean
  hint?: string
  /** Present = the field is in an error state; the string renders below it. */
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Owns the label / hint / error / `aria-describedby` / `id` wiring so the controls do not
 * have to. `Input`, `TextArea` and `MoneyInput` read it from context, which means a feature
 * cannot accidentally ship an unlabelled input or one whose error text is invisible to a
 * screen reader — and, more to the point, cannot ship a 14px one.
 */
export function Field({
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const base = React.useId()
  const inputId = `${base}-input`
  const hintId = hint ? `${base}-hint` : undefined
  const errorId = error ? `${base}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const value = React.useMemo<FieldContextValue>(
    () => ({ inputId, describedBy, invalid: Boolean(error) }),
    [inputId, describedBy, error],
  )

  return (
    <FieldContext.Provider value={value}>
      <div className={className}>
        <label htmlFor={inputId} className={cn('mb-1.5 block eyebrow', hideLabel && 'sr-only')}>
          {label}
          {required && (
            <span className="text-red-ink" aria-hidden="true">
              {' *'}
            </span>
          )}
        </label>

        {children}

        {/* Hint and error never show together: an error supersedes the instruction that
            failed to prevent it. */}
        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-meta text-ink-3">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1.5 text-meta text-red-ink">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

/* ---- shared control chrome ---------------------------------------------- */

/**
 * The input shell, exported so a custom control (a date picker, a read-only display that
 * must line up with a real field) can borrow it.
 *
 * `glass` (R-137) assumes the field sits on `paper` — the normal case. Inside a sheet, pass
 * `className="bg-paper"` to keep the well readable; the caller's className is applied last,
 * so it wins. That inversion IS the design's rule — a field is always the surface its
 * container is not — and the canvas keeps it exactly there, drawing the picker cells and the
 * sheet's secondary buttons on opaque `paper` inside a frosted panel.
 *
 * Inside a CARD it needs no override any more, and that is a small gift from the frost: glass
 * over glass composites lighter than the glass under it, so the well separates from the card
 * on its own. Over a sheet panel the two measure #dddcdb and #f5f5f5.
 *
 * NO BORDER UNTIL IT IS WRONG. A field is a flat block, and the only line it ever draws is
 * the red one an error puts around it — "errors turn the border red, no icons needed"
 * (01 Components). The border is reserved as `transparent` rather than added on error so
 * the field does not grow by 2px the moment it fails validation.
 *
 * KNOWN DEVIATION, and the one place this integration chose the design over the previous
 * system: a borderless field is 1.23:1 against the page, below WCAG 1.4.11's 3:1 for the
 * boundary that identifies a control. See docs/design/DESIGN_INTEGRATION.md — the one-line
 * revert is `border-transparent` → `border-rule-strong` here and in `TextArea`.
 */
export const CONTROL_CLASS =
  'w-full h-control rounded-field border border-transparent glass px-3.5 ' +
  'text-input text-ink placeholder:text-ink-3 aria-[invalid=true]:border-red-ink'

/**
 * `ref` is typed explicitly (F05 contract delta 8). React 19 passes `ref` to a function
 * component as an ordinary prop, so it would already reach the `<input>` through the spread
 * at runtime — but `InputHTMLAttributes` does not declare it, so the call site would not
 * compile. F05's focus manager moves focus to a new row's name field after `+ Tambah item`
 * and to the paste textarea on mount; widening the type is the alternative to F05 hand-
 * rolling a bare `<input className={CONTROL_CLASS}>` and losing this file's label wiring.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}

export function Input({ className, id, ...rest }: InputProps) {
  const field = useFieldContext()
  return (
    <input
      id={id ?? field?.inputId}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field?.invalid || undefined)}
      className={cn(CONTROL_CLASS, className)}
      {...rest}
    />
  )
}

/** Same reasoning as `InputProps.ref` above. */
export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>
}

/**
 * Padded rather than line-height-centred: a textarea is a surface you write onto, not a
 * slot you fill. F05's paste box is the main consumer, and it is the biggest frosted block in
 * the app — pasted receipt text at 500 with generous leading, so a wall of lines still
 * reads as a list. At 294px tall it is also the one place a creature can sit behind a whole
 * paragraph, which is the best argument in the app for R-137 and the worst case its contrast
 * floor is set by.
 */
export function TextArea({ className, id, rows = 6, ...rest }: TextAreaProps) {
  const field = useFieldContext()
  return (
    <textarea
      id={id ?? field?.inputId}
      rows={rows}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field?.invalid || undefined)}
      className={cn(
        'glass w-full rounded-card border border-transparent p-4',
        'text-input leading-[1.6] font-medium text-ink placeholder:text-ink-3',
        'resize-none aria-[invalid=true]:border-red-ink',
        className,
      )}
      {...rest}
    />
  )
}
