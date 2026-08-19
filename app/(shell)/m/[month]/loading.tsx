/**
 * The month skeleton. It is the shape of the answer, not a spinner (design R-36 / F10's
 * `.skeleton`).
 *
 * This file is also what makes month paging feel instant: `<Link>`'s default `prefetch`
 * ("auto") prefetches a dynamic route down to its nearest loading boundary, so tapping a
 * chevron paints this immediately and then streams the real rows in. Deleting it would leave
 * the chevrons with nothing to prefetch and the screen blank until the query returns.
 */
export default function MonthLoading() {
  return (
    <main aria-busy="true">
      <div className="border-b border-rule pt-safe-header px-safe pb-4">
        <div className="flex items-center justify-between">
          <span className="skeleton size-touch rounded-field" />
          <span className="skeleton h-3 w-28" />
          <span className="skeleton size-touch rounded-field" />
        </div>
        <span className="skeleton mt-4 h-9 w-52" />
        <span className="skeleton mt-2.5 h-3 w-32" />
      </div>

      <div className="pt-6 px-safe">
        <span className="skeleton h-3 w-40" />
        <div className="mt-2 rounded-card border border-rule bg-card">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex min-h-row-lg items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="skeleton h-4 w-40" />
                <span className="skeleton mt-2 h-3 w-20" />
              </div>
              <span className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Memuat catatan…</span>
    </main>
  )
}
