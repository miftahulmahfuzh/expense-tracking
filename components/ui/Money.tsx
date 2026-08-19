import { cn } from '@/lib/cn'
import { formatIdrDigits } from '@/lib/format'

export type MoneySize = 'hero' | 'lg' | 'md' | 'sm'
export type MoneyTone = 'default' | 'muted' | 'danger' | 'success'

export interface MoneyProps {
  /** Whole rupiah. A negative value renders a real minus sign; use `signed` for deltas. */
  value: number
  /** hero = 40px month total · lg = 22px draft total · md = 17px expense total · sm = 14px item */
  size?: MoneySize
  tone?: MoneyTone
  /** Show the "Rp" prefix. Off inside a column that already has a Rp header. */
  showPrefix?: boolean
  /** Force a leading + on positives (F08's month-over-month delta). */
  signed?: boolean
  className?: string
}

/*
 * Mono at every size, because money is bookkeeping. The half-step from 400 to 500 on the
 * two mid sizes is what makes a group total read heavier than the date above it without
 * getting bigger — the whole reason two mono weights are loaded.
 */
const SIZE: Record<MoneySize, string> = {
  hero: 'text-money-xl',
  lg: 'text-money-lg font-medium',
  md: 'text-money-md font-medium',
  sm: 'text-money-sm',
}

const TONE: Record<MoneyTone, string> = {
  default: 'text-ink',
  muted: 'text-ink-2',
  /** Spending more than last month. */
  danger: 'text-red',
  /** Spending less. The accent is the only place green appears in the app. */
  success: 'text-accent',
}

/**
 * The read-only amount, and the ONLY thing allowed to typeset money.
 *
 * Always mono and always `tabular`, so a column of these aligns digit-for-digit — that
 * alignment is the app's signature, and routing every amount through one component is what
 * stops a feature opting out of it by accident.
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
    <span className={cn('font-mono tabular whitespace-nowrap', SIZE[size], TONE[tone], className)}>
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
