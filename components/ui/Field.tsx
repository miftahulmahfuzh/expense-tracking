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
            <span className="text-red" aria-hidden="true">
              {' *'}
            </span>
          )}
        </label>

        {children}

        {/* Hint and error never show together: an error supersedes the instruction that
            failed to prevent it. */}
        {hint && !error && (
          <p id={hintId} className="mt-1.5 font-mono text-meta text-ink-3">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1.5 font-mono text-meta text-red">
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
 * `bg-card` assumes the field sits on `paper` — the normal case. Inside a sheet or a card,
 * where the surface is already `card`, pass `className="bg-paper"` to keep the well
 * readable; the caller's className is applied last, so it wins.
 */
export const CONTROL_CLASS =
  'w-full h-control rounded-field border border-rule bg-card px-3.5 ' +
  'text-input text-ink placeholder:text-ink-3 aria-[invalid=true]:border-red'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

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

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * Card-radius rather than field-radius, and padded rather than line-height-centred: a
 * textarea is a surface you write onto, not a slot you fill. F05's paste box is the main
 * consumer and adds `font-mono` — pasted receipt text is bookkeeping.
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
        'w-full rounded-card border border-rule bg-card p-4',
        'text-input leading-relaxed text-ink placeholder:text-ink-3',
        'resize-none aria-[invalid=true]:border-red',
        className,
      )}
      {...rest}
    />
  )
}
