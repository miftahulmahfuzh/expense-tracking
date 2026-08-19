'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

import { Money } from '@/components/ui'
import { monthMedium } from '@/lib/stats/format'
import type { MonthPoint } from '@/lib/stats/series'

/**
 * `ssr: false` is illegal inside a Server Component in Next 16 / React 19 — it throws at
 * build. So the dynamic() call lives here, in a file that already carries 'use client'.
 * This wrapper is deliberately tiny (selection state, the router, a <details> table); all
 * the chart weight is behind the import below.
 */
const MonthlyChartInner = dynamic(() => import('./MonthlyChartInner'), {
  ssr: false,
  // Same min-height as the chart, so the lazy chunk arriving causes zero layout shift.
  loading: () => <div className="skeleton chart-frame" aria-hidden="true" />,
})

type Props = {
  series: MonthPoint[]
  selectedMonth: string
}

export default function MonthlyChart({ series, selectedMonth }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  /*
   * OPTIMISTIC SELECTION. The readout and the cap label move on the first frame after the
   * tap, while the server re-renders the cards below.
   *
   * `useOptimistic`, not `useState` + a resync effect. The plan's version was
   * `useEffect(() => setPicked(selectedMonth), [selectedMonth])`, which the React Compiler
   * lint rejects outright (react-hooks/set-state-in-effect) and which is the same
   * prop-echo-in-an-effect shape R-105 already ruled against on /e/[id]. useOptimistic
   * reverts to the passed-through prop the moment the transition settles — by which time
   * `selectedMonth` IS the new month — so the resync is the hook's own semantics rather
   * than a second render we have to write. F07's editor uses the same hook for the same
   * reason.
   */
  const [picked, setPicked] = useOptimistic(selectedMonth)

  const point = series.find((p) => p.month === picked) ?? series[series.length - 1]

  /**
   * TWO-STAGE TAP. There is no hover on a phone, so one gesture has to do the work hover
   * normally does:
   *   tap 1 on a month  -> select it: show its value, re-scope the cards below via ?m=
   *   tap 2 on the same -> navigate to /m/[month]
   *
   * The second stage is also reachable in ONE tap from the readout link, so nobody is
   * forced to discover the gesture. `router.replace`, not push, so paging across twelve
   * months does not bury the back button under twelve entries.
   */
  const onPick = (month: string) => {
    if (month === picked) {
      router.push(`/m/${month}`)
      return
    }
    startTransition(() => {
      // Both inside the transition: useOptimistic's setter is only valid in one, and this
      // is also what pairs the optimistic value with the navigation that will confirm it.
      setPicked(month)
      router.replace(`/stats?m=${month}`, { scroll: false })
    })
  }

  const hasPartial = series.some((p) => p.isPartial)

  if (!point) return null

  return (
    <section
      className="rounded-card border border-rule bg-card p-4"
      aria-labelledby="stats-chart-title"
    >
      <h2 className="eyebrow" id="stats-chart-title">
        {series.length} bulan terakhir
      </h2>

      {/*
       * THE PERSISTENT READOUT — this is what replaces the hover tooltip. min-h keeps the
       * line reserved so selecting a month never reflows the card. aria-live announces the
       * new value to a screen reader on selection.
       */}
      <p
        className="mt-2.5 flex min-h-5 flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-meta text-ink-3"
        aria-live="polite"
      >
        <span>{monthMedium(point.month)}</span>
        <Money value={point.totalIdr} size="sm" />
        <Link href={`/m/${point.month}`} className="underline underline-offset-2">
          Lihat bulan →
        </Link>
      </p>

      <div className="chart-frame mt-1.5" data-pending={pending ? 'true' : 'false'}>
        <MonthlyChartInner series={series} selectedMonth={picked} onPick={onPick} />
      </div>

      {hasPartial ? (
        <p className="mt-1.5 font-mono text-meta text-ink-3">
          • Bulan berjalan — belum penuh sebulan.
        </p>
      ) : null}

      {/*
       * THE TABLE VIEW — every chart's accessible twin. The dataviz rule is that no value
       * may be reachable only through an interaction, and this is also the relief that
       * discharges the contrast WARN on the in-progress bar's lighter step.
       */}
      <details className="group mt-2">
        <summary className="cursor-pointer list-none py-2.5 font-mono text-meta text-ink-2 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="group-open:hidden">
            ▸{' '}
          </span>
          <span aria-hidden="true" className="hidden group-open:inline">
            ▾{' '}
          </span>
          Lihat angka
        </summary>
        <table className="w-full border-collapse">
          <caption className="sr-only">Total pengeluaran per bulan</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1.5 text-left eyebrow">
                Bulan
              </th>
              <th scope="col" className="py-1.5 text-right eyebrow">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.month} className="border-t border-rule-2">
                <th scope="row" className="py-1.5 text-left text-body font-normal">
                  <Link href={`/m/${p.month}`} className="underline underline-offset-2">
                    {monthMedium(p.month)}
                  </Link>
                  {p.isPartial ? (
                    <span className="font-mono text-meta text-ink-3"> (berjalan)</span>
                  ) : null}
                </th>
                <td className="py-1.5 text-right">
                  <Money value={p.totalIdr} size="sm" tone="muted" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
