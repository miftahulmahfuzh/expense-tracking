import { INSIGHT_HEADINGS } from './insightCopy'

/**
 * The Suspense fallback for the three summaries — F12 §7.5.
 *
 * THE HEADINGS ARE REAL AND THE PARAGRAPHS ARE BARS. globals.css states the principle for the
 * whole app — "The loading state is the shape of the answer, not a spinner" — and here the shape
 * is known exactly: three cards, each a label over two or three lines of prose. Rendering the
 * headings means the page does not reflow when the text arrives, and the reader can already see
 * WHAT is coming while it does.
 *
 * `.skeleton` carries the pulse and the `--rule` fill (globals.css), including the
 * `prefers-reduced-motion` behaviour, so nothing about the animation is decided here.
 */
export default function InsightSkeleton() {
  return (
    <>
      {[INSIGHT_HEADINGS.week, INSIGHT_HEADINGS.month, INSIGHT_HEADINGS.twoMonth].map(
        (heading, i) => (
          <section key={heading} className="glass rounded-card p-4" aria-hidden="true">
            <h2 className="eyebrow">{heading}</h2>
            <div className="mt-3 space-y-2">
              <span className="skeleton h-3.5 w-full" />
              <span className="skeleton h-3.5 w-full" />
              {/* The last line of a paragraph is short. Three different widths so the three
                  cards do not read as one repeating pattern. */}
              <span className="skeleton h-3.5" style={{ width: `${[62, 74, 55][i]}%` }} />
            </div>
          </section>
        ),
      )}
    </>
  )
}
