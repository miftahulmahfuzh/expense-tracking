import { Money, TrendDownIcon, TrendFlatIcon, TrendUpIcon } from '@/components/ui'
import { cn } from '@/lib/cn'
import { monthLabel } from '@/lib/format'
import { formatMtdRange, monthTickLabel } from '@/lib/stats/format'
import type { Delta } from '@/lib/stats/series'

/**
 * A STAT TILE, NOT A CHART. One number and a direction — the dataviz "is it even a chart?"
 * table sends that to a stat tile, and rendering it as a two-bar "this month vs last month"
 * chart would be the one-bar-bar-chart anti-pattern with an extra bar. The sparkline slot is
 * omitted because the 12-month chart directly below already is the sparkline, at full size.
 *
 * COLOUR JOB = STATUS, not categorical. Spending more is bad, so up wears the red and down
 * the green — the same two `Money` types as `danger` / `success`, so this tile uses the
 * system's vocabulary rather than inventing one. Both are the darkened `-ink` twins: this
 * is TYPE on a white card, and the design's fill-strength red measures 3.79:1 there.
 *
 * The design renders this as a filled tile with black type ("03 App Prototype"); here it is
 * a line under the hero total instead, because this screen puts the month switcher, the
 * total and the delta in ONE card rather than in a 2-up tile row. Same reading, same two
 * colours, and it keeps the hero figure the only large number on the page.
 *
 * Because status colour may never travel alone, every state ships an arrow glyph AND the
 * Indonesian word AND the basis in words. In a greyscale screenshot nothing is lost.
 */
export default function DeltaTile({ delta }: { delta: Delta }) {
  const basisLabel =
    delta.basis.mode === 'mtd'
      ? `vs ${formatMtdRange(delta.basis.previousMonth, delta.basis.throughDay)} (periode sama)`
      : `vs ${monthLabel(delta.basis.previousMonth)} penuh`

  if (delta.kind === 'none') {
    return (
      <Wrap basis={basisLabel}>
        <span className="text-ink-2">Belum ada pengeluaran</span>
      </Wrap>
    )
  }

  if (delta.kind === 'first') {
    // previousIdr was 0. A percentage here would be a division by zero, so say the true
    // thing instead of printing "+∞%" or a fake "+100%".
    return (
      <Wrap basis={`${monthTickLabel(delta.basis.previousMonth)} kosong — tidak ada pembanding`}>
        <span className="text-ink-2">Bulan pertama dengan pengeluaran</span>
      </Wrap>
    )
  }

  /*
   * F12: was '↑' / '↓' / '→'. Those are typed characters, so their weight came from whatever
   * Archivo does with U+2191 — visibly lighter than the `font-extrabold` word beside them, and
   * the exact mismatch `Icon.tsx` exists to prevent. `size="inline"` keeps them at 1em of the
   * surrounding run, so the arrow still scales with the sentence it belongs to.
   */
  const Glyph =
    delta.direction === 'up'
      ? TrendUpIcon
      : delta.direction === 'down'
        ? TrendDownIcon
        : TrendFlatIcon
  const word = delta.direction === 'up' ? 'Naik' : delta.direction === 'down' ? 'Turun' : 'Setara'
  const tone =
    delta.direction === 'up'
      ? 'text-red-ink'
      : delta.direction === 'down'
        ? 'text-green-ink'
        : 'text-ink-2'

  return (
    <Wrap basis={basisLabel}>
      <span className={cn('tabular font-extrabold', tone)}>
        <Glyph size="inline" /> {word}
        {delta.direction === 'flat'
          ? ' dengan'
          : ` ${Math.abs(delta.pct).toLocaleString('id-ID')}% dari`}
      </span>{' '}
      <Money value={delta.previousIdr} size="sm" tone="muted" />
    </Wrap>
  )
}

/** The basis is on its own line and is NEVER optional — see computeDelta's docblock. */
function Wrap({ children, basis }: { children: React.ReactNode; basis: string }) {
  return (
    <div className="mt-2">
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-body">{children}</p>
      <p className="mt-1 text-meta text-ink-3">{basis}</p>
    </div>
  )
}
