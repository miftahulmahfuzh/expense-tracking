/**
 * The detail skeleton: header, title, date, three item rows, total. Same shape as the real
 * screen so the content does not jump when it arrives.
 */
export default function DetailLoading() {
  return (
    <main aria-busy="true">
      <div className="flex items-center gap-2 border-b border-rule bg-card pt-safe-header px-safe pb-2">
        <span className="skeleton -ml-2.5 size-touch rounded-field" />
        <span className="skeleton mx-auto h-3 w-16" />
        <span className="skeleton size-touch rounded-field" />
      </div>

      <div className="pt-4 px-safe">
        <span className="skeleton h-3 w-12" />
        <span className="skeleton mt-2 h-control w-full rounded-field" />

        <span className="skeleton mt-4 h-3 w-16" />
        <span className="skeleton mt-2 h-control w-full rounded-field" />

        <span className="skeleton mt-6 h-3 w-10" />
        <div className="mt-2 rounded-card bg-card px-4 py-0.5">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex min-h-row items-center gap-2.5 py-2">
              <span className="skeleton size-disc shrink-0 rounded-full" />
              <span className="skeleton h-4 flex-1" />
              <span className="skeleton h-4 w-20" />
            </div>
          ))}
        </div>

        <div className="mt-3.5 flex items-baseline justify-between rounded-card bg-card px-4 py-3">
          <span className="skeleton h-3 w-12" />
          <span className="skeleton h-6 w-28" />
        </div>
      </div>

      <span className="sr-only">Memuat pengeluaran…</span>
    </main>
  )
}
