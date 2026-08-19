/**
 * The loading state is the shape of the answer, not a spinner — the hero card, then the
 * chart frame. Sized to match the real render so the swap does not jump.
 *
 * R-98 applies but is inert here: a `loading.tsx` is the Suspense boundary that turns a
 * later `notFound()` into a soft 200. `/stats` never calls `notFound()` — an invalid `?m=`
 * clamps to the current month rather than 404ing — so there is no status code to lose. And
 * R-101's default `prefetch` on the Statistik tab prefetches down to exactly this boundary,
 * which is what makes the tab feel instant.
 */
export default function StatsLoading() {
  return (
    <main className="flex flex-col gap-3 pt-safe-header px-safe pb-2" aria-busy="true">
      <section className="rounded-card border border-rule bg-card p-4">
        <span className="skeleton h-3 w-24" />
        <span className="skeleton mt-3.5 h-10 w-52" />
        <span className="skeleton mt-3 h-3.5 w-40" />
      </section>
      <section className="rounded-card border border-rule bg-card p-4">
        <span className="skeleton h-3 w-32" />
        <span className="skeleton mt-3 h-[196px] w-full" />
      </section>
    </main>
  )
}
