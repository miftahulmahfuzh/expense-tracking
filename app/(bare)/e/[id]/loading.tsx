/**
 * The detail skeleton: header, title, date, three item rows, total. Same shape as the real
 * screen so the content does not jump when it arrives.
 */
export default function DetailLoading() {
  return (
    <main aria-busy="true" className="px-safe">
      <div className="flex items-center gap-2 pt-safe-header pb-3">
        <span className="skeleton -ml-2.5 size-touch rounded-field" />
        <span className="skeleton h-3 w-16" />
      </div>

      <span className="skeleton h-3 w-12" />
      <span className="skeleton mt-2 h-control w-full rounded-field" />

      <span className="skeleton mt-4 h-3 w-16" />
      <span className="skeleton mt-2 h-control w-full rounded-field" />

      <span className="skeleton mt-6 h-3 w-10" />
      <div className="mt-2 rounded-card border border-rule bg-card px-4 py-0.5">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex min-h-row items-center gap-2.5 py-2">
            <span className="skeleton size-4 shrink-0" />
            <span className="skeleton h-4 flex-1" />
            <span className="skeleton h-4 w-20" />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-baseline justify-between border-t border-rule pt-3.5">
        <span className="skeleton h-3 w-12" />
        <span className="skeleton h-5 w-28" />
      </div>

      <span className="sr-only">Memuat pengeluaran…</span>
    </main>
  )
}
