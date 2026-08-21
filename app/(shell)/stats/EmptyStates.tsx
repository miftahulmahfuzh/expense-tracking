import { ButtonLink, EmptyState, INK_STICKER, Money } from '@/components/ui'
import { monthLabel, type MonthKey } from '@/lib/format'

/**
 * 0 active months — a brand-new account with nothing saved. No chart at all, and therefore
 * no recharts chunk: `MonthlyChart` is not rendered, so the dynamic import never runs.
 */
export function NoDataState() {
  return (
    <EmptyState
      title="Belum ada data"
      description="Simpan pengeluaran pertamamu, statistik langsung muncul di sini."
      action={<ButtonLink href="/new">+ Tambah pengeluaran</ButtonLink>}
    />
  )
}

/**
 * Exactly 1 active month — the new user with one group and three items.
 *
 * A 12-column chart with 11 zero bars, or even a 3-column chart with 2 zero bars, LOOKS
 * BROKEN, and the dataviz form heuristic is explicit that a single value is a stat tile and
 * never a one-bar bar chart. So: no chart. The number IS the chart. The 12-month view
 * appears the moment a second month has spend, and the copy says so, so the absence never
 * reads as a bug. Recharts is not downloaded here either.
 */
export function SingleMonthState({ month, totalIdr }: { month: MonthKey; totalIdr: number }) {
  return (
    <section className="glass rounded-card p-4">
      <h2 className="sticker" style={INK_STICKER}>
        Tren Bulanan
      </h2>
      <p className="mt-2">
        <Money value={totalIdr} size="lg" />
      </p>
      <p className="mt-1.5 text-body text-ink-2">
        Total {monthLabel(month)}. Grafik perbandingan muncul begitu ada bulan kedua.
      </p>
    </section>
  )
}
