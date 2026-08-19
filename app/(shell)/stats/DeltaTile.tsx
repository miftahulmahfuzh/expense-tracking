import { Money } from '@/components/ui'
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
 * COLOUR JOB = STATUS, not categorical. Spending more is bad, so up wears `--red` and down
 * wears `--accent` — which is also exactly how F10 typed `Money`'s `danger` / `success`
 * tones ("Spending more than last month" / "Spending less"), so this tile is using the
 * design's own vocabulary rather than inventing one. And because status colour may never
 * travel alone, every state ships an arrow glyph AND the Indonesian word AND the basis in
 * words. In a greyscale screenshot nothing is lost.
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

  const glyph = delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'
  const word = delta.direction === 'up' ? 'Naik' : delta.direction === 'down' ? 'Turun' : 'Setara'
  const tone =
    delta.direction === 'up'
      ? 'text-red'
      : delta.direction === 'down'
        ? 'text-accent'
        : 'text-ink-2'

  return (
    <Wrap basis={basisLabel}>
      <span className={cn('font-mono tabular', tone)}>
        <span aria-hidden="true">{glyph} </span>
        {word}
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
      <p className="mt-1 font-mono text-meta text-ink-3">{basis}</p>
    </div>
  )
}
