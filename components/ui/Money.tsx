import { cn } from '@/lib/cn'
import { formatIdrDigits } from '@/lib/format'

export type MoneySize = 'hero' | 'lg' | 'md' | 'sm'
export type MoneyTone = 'default' | 'muted' | 'danger' | 'success'

export interface MoneyProps {
  /** Whole rupiah. A negative value renders a real minus sign; use `signed` for deltas. */
  value: number
  /** hero = 44px month total · lg = 24px draft total · md = 17px expense total · sm = 15px item */
  size?: MoneySize
  tone?: MoneyTone
  /** Show the "Rp" prefix. Off inside a column that already has a Rp header. */
  showPrefix?: boolean
  /** Force a leading + on positives (F08's month-over-month delta). */
  signed?: boolean
  className?: string
}

/*
 * WEIGHT IS THE HIERARCHY. One typeface at four sizes, each carrying its own weight in the
 * scale — 900 for the hero and the draft total, 800 for a group total, 600 for a line item.
 * That step is what makes a total read heavier than the rows under it without getting
 * bigger, and it replaces the two mono weights the previous system loaded to do the job.
 */
const SIZE: Record<MoneySize, string> = {
  hero: 'text-money-xl',
  lg: 'text-money-lg',
  md: 'text-money-md',
  sm: 'text-money-sm',
}

const TONE: Record<MoneyTone, string> = {
  default: 'text-ink',
  muted: 'text-ink-2',
  /** Spending more than last month. The darkened twin: this is type, not a fill. */
  danger: 'text-red-ink',
  /** Spending less. Green is not in this palette, so "better" is the category green. */
  success: 'text-green-ink',
}

/**
 * The read-only amount, and the ONLY thing allowed to typeset money.
 *
 * Always `tabular`, so a column of these aligns digit-for-digit. That matters more here
 * than it did under the old mono family: Archivo is proportional, so `font-variant-numeric`
 * is the only thing holding the column together, and routing every amount through one
 * component is what stops a feature opting out of it by accident.
 */
export function Money({
  value,
  size = 'sm',
  tone = 'default',
  showPrefix = true,
  signed = false,
  className,
}: MoneyProps) {
  const negative = value < 0
  // U+2212 MINUS SIGN, not a hyphen: in tabular mono it has the same advance as a digit,
  // so a negative row still lines up with the positive ones.
  const sign = negative ? '−' : signed ? '+' : ''
  const magnitude = Number.isFinite(value) ? Math.round(Math.abs(value)) : 0
  const digits = formatIdrDigits(magnitude)

  return (
    <span className={cn('tabular whitespace-nowrap', SIZE[size], TONE[tone], className)}>
      <span aria-hidden="true">
        {sign}
        {showPrefix ? `Rp ${digits}` : digits}
      </span>
      {/*
       * A screen reader reads "Rp 266.350" as "R P two six six point three five zero" — the
       * dots are thousands separators, not decimals, so the spoken number comes out wrong by
       * three orders of magnitude. A visually-hidden twin carries the plain integer plus the
       * word. Done with a real element rather than aria-label because aria-label on a
       * generic <span> has no defined effect and several screen readers drop it.
       */}
      <span className="sr-only">
        {negative ? 'minus ' : ''}
        {magnitude} rupiah
      </span>
    </span>
  )
}
