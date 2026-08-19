import { CategoryCode, Money } from '@/components/ui'
import { categoryFill } from '@/lib/categories'
import { formatIdr } from '@/lib/format'
import type { BreakdownRow } from '@/lib/stats/series'

/**
 * A HORIZONTAL BAR LIST — deliberately not a donut.
 *
 * Ruling R-3 and design R-39 arrived at this independently. The 8-category palette FAILS the
 * dataviz all-pairs CVD gate, and against F10's real surfaces it fails on the *adjacent*
 * pairlist too (worst pair ΔE 1.8 deutan in dark; normal-vision floor 6.6 against a required
 * 15). In a donut, colour is the ONLY identity channel, so those failures are user-visible
 * information loss — and the normal-vision failure means full-colour readers are affected as
 * well. Here every row states its own identity in text: two-letter code, Indonesian label,
 * rupiah, percent. Colour is a redundant recognition cue that matches the chip the user taps
 * on /new and /e/[id]. That is precisely the condition F10's R-50 waiver is written against,
 * and it is what keeps the waiver from lapsing.
 *
 * No Recharts here at all — plain flex divs. That keeps ~100 KB out of the bundle, makes the
 * whole card zero-JS server HTML, and lets the fills read the `--color-cat-*` tokens by NAME
 * so a light/dark flip repaints with no re-render and no flash. F08 never writes a category
 * hex.
 */
export default function CategoryBreakdown({
  rows,
  totalIdr,
}: {
  rows: BreakdownRow[]
  totalIdr: number
}) {
  return (
    <section
      className="rounded-card border border-rule bg-card p-4"
      aria-labelledby="stats-cat-title"
    >
      <h2 className="eyebrow" id="stats-cat-title">
        Rincian kategori
      </h2>

      {rows.length === 0 ? (
        <p className="mt-2.5 text-body text-ink-2">Belum ada pengeluaran di bulan ini.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3.5">
          {rows.map((r) => (
            <div key={r.category} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                {/* Carries the colour AND the identity: the visible glyph is the code, the
                    full label rides along for screen readers. Never colour-only. */}
                <CategoryCode category={r.category} className="w-6 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-chip">{r.label}</span>
                <Money value={r.amountIdr} size="sm" />
                <span className="min-w-9 shrink-0 text-right font-mono tabular text-meta text-ink-3">
                  {r.pct}%
                </span>
              </div>

              {/*
               * Width is share of TOTAL, not share of the max, so the row lengths genuinely
               * read as part-to-whole while still sharing one aligned left baseline for
               * comparison — which is the whole reason the dataviz form table sends magnitude
               * comparison to bars rather than to arcs.
               *
               * role="img" + aria-label rather than nothing: the bar is a second rendering of
               * numbers already stated above it, so a screen reader gets the summary once and
               * does not have to walk two divs to learn there is no more information here.
               */}
              <div
                className="h-2 overflow-visible rounded-full bg-rule"
                role="img"
                aria-label={`${r.label}: ${formatIdr(r.amountIdr)}, ${r.pct} persen`}
              >
                <div
                  className="h-full rounded-r-full"
                  style={{
                    // Clamped: a rounding artefact must never paint past the track.
                    width: `${Math.min(100, (r.amountIdr / Math.max(totalIdr, 1)) * 100)}%`,
                    // The token NAME from F03's CategoryMeta.color — never a hex.
                    background: categoryFill(r.category),
                    // A 0.4% category must stay visible rather than vanishing entirely.
                    minWidth: '3px',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
