'use client'

/**
 * F08 — the 12-month column chart. THE ONLY FILE IN THE APP THAT IMPORTS RECHARTS.
 *
 * Loaded exclusively through `next/dynamic({ ssr: false })` from MonthlyChart.tsx, so
 * recharts + its d3 dependencies (~100 KB gz) land in a route-level lazy chunk that a user
 * who never opens the Statistik tab never downloads. scripts/f08-audit.sh asserts this file
 * is the sole importer; adding a second one silently promotes recharts into the shared
 * chunk and every route pays for it.
 *
 * NAMED IMPORTS ONLY. recharts@3 is ESM with sideEffects:false, so Pie, Radar, Sankey,
 * Treemap, Scatter and Funnel tree-shake out.
 *
 * WHY A COLUMN CHART AND NOT A LINE: a month is a discrete completed bucket, not a sample
 * of a continuous process. A line's slope between April and May asserts a value on
 * 2026-04-15 that does not exist, and a line dropping to zero implies a descent *through*
 * an empty month rather than an empty month. The reader's question ("was August worse than
 * July?") is a magnitude comparison against a common baseline, which is the bar row of the
 * dataviz form table. The bar is also the hit target — see handleClick.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatIdrAxis } from '@/lib/stats/format'
import type { MonthPoint } from '@/lib/stats/series'

type Props = {
  series: MonthPoint[]
  selectedMonth: string
  onPick: (month: string) => void
}

export default function MonthlyChartInner({ series, selectedMonth, onPick }: Props) {
  const selectedIndex = series.findIndex((p) => p.month === selectedMonth)

  /**
   * THE BAND, NOT THE BAR, IS THE HIT TARGET.
   *
   * A 14px bar is far under the ~24px minimum the dataviz interaction rules ask for, and on
   * a phone a 14px column is a genuine mis-tap generator. BarChart's own onClick reports the
   * ACTIVE CATEGORY for wherever inside the plot area the pointer landed, which makes each
   * ~26px-wide × full-height band the target — roughly 26 × 196 px per month. No overlay
   * bars, no invisible hit rects, no extra machinery.
   */
  const handleClick = (state: unknown) => {
    const s = state as
      { activeLabel?: string; activePayload?: Array<{ payload?: MonthPoint }> } | undefined
    const month = s?.activeLabel ?? s?.activePayload?.[0]?.payload?.month
    if (typeof month === 'string' && month.length === 7) onPick(month)
  }

  return (
    <ResponsiveContainer width="100%" height={196}>
      <BarChart
        data={series}
        margin={{ top: 20, right: 2, bottom: 0, left: 0 }}
        onClick={handleClick}
        /* recharts@3's keyboard layer: arrow keys walk the bands, Enter activates. The
           chart's information is reachable without a pointer. */
        accessibilityLayer
      >
        <CartesianGrid vertical={false} className="chart-grid" />

        <YAxis
          /*
           * 52, not 40. The compact axis labels are up to five glyphs ('850rb' measures 41px
           * in the mono face) and Recharts lays a tick out RIGHT-aligned against the axis
           * edge, so anything wider than `width` overhangs the SVG's left boundary and is
           * clipped there. At 40 the mid tick rendered as '50rb' — the leading 8 cut off —
           * which does not look broken, it looks like a number. A chart that misstates its
           * own scale by 17x is the exact failure scripts/f08-audit.sh exists to catch, and
           * it is invisible in every screenshot until you check the value against the data.
           * Any month total in the 100rb-999rb band produces a five-glyph mid tick, which is
           * this app's ordinary range rather than an edge case.
           */
          width={52}
          tickCount={3}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatIdrAxis}
          className="chart-axis"
        />

        <XAxis
          dataKey="month"
          interval={0}
          tickLine={false}
          height={26}
          className="chart-axis"
          tick={(props) => <MonthTick {...props} series={series} selectedIndex={selectedIndex} />}
        />

        {/*
          Present ONLY to keep Recharts' active-index machinery running so onClick can report
          activeLabel. It renders NOTHING: there is no hover on a phone, and the dataviz rule
          is that a tooltip may never be the only way to read a value. The persistent readout
          above the chart and the <details> table below it carry every number.
        */}
        <Tooltip content={() => null} cursor={false} isAnimationActive={false} />

        <Bar
          dataKey="totalIdr"
          barSize={14}
          radius={[4, 4, 0, 0]} /* 4px rounded data-end, square on the baseline */
          minPointSize={0} /* a zero month is drawn as zero. No sympathy sliver. */
          isAnimationActive={false}
        >
          {series.map((p) => (
            <Cell
              key={p.month}
              className={p.isPartial ? 'chart-bar--partial' : 'chart-bar--complete'}
            />
          ))}
          {/* Direct-label the SELECTED bar only — never a number on every point. */}
          <LabelList
            dataKey="totalIdr"
            content={(props) => (
              <SelectedCap {...(props as CapProps)} selectedIndex={selectedIndex} />
            )}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── custom x tick: emphasis without inventing a hue ───────────────────────── */

type TickProps = {
  /* recharts@3 types the tick origin as `string | number` (an SVG coordinate may be a
     percentage), so it is widened here and coerced below rather than cast away. */
  x?: string | number
  y?: string | number
  payload?: { value?: string }
  series: MonthPoint[]
  selectedIndex: number
}

function MonthTick({ x = 0, y = 0, payload, series, selectedIndex }: TickProps) {
  const idx = series.findIndex((p) => p.month === payload?.value)
  const point = series[idx]
  if (!point) return null

  const isSelected = idx === selectedIndex

  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text
        dy={12}
        textAnchor="middle"
        className={isSelected ? 'chart-tick chart-tick--sel' : 'chart-tick'}
      >
        {point.label}
        {/* The in-progress month's second, non-colour channel. */}
        {point.isPartial ? ' •' : ''}
      </text>
      {isSelected ? <line x1={-9} x2={9} y1={17} y2={17} className="chart-tick__rule" /> : null}
    </g>
  )
}

/* ── selected-bar cap label ────────────────────────────────────────────────── */

type CapProps = {
  x?: number
  y?: number
  width?: number
  value?: number
  index?: number
  selectedIndex: number
}

function SelectedCap({ x = 0, y = 0, width = 0, value = 0, index, selectedIndex }: CapProps) {
  if (index !== selectedIndex || !value) return null
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" className="chart-caplabel">
      {formatIdrAxis(value)}
    </text>
  )
}
