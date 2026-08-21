/**
 * The detail skeleton: header, title, date, three item rows, total. Same shape as the real
 * screen so the content does not jump when it arrives — which is why the header here carries
 * TWO action squares and a label hard against the chevron. Both track `ExpenseEditor`'s
 * header exactly; if that grows or loses a control, this is the second place to change.
 *
 * The note is deliberately absent. It is the last block on the real page and it is now one
 * mono row or nothing at all, so drawing a placeholder for it would reserve height that the
 * loaded page often does not use — the opposite of what this file is for.
 */
export default function DetailLoading() {
  return (
    <main aria-busy="true">
      <div className="flex items-center gap-2 border-b border-rule bg-card pt-safe-header px-safe pb-2">
        <span className="skeleton -ml-2.5 size-touch rounded-field" />
        <span className="skeleton h-3 w-16" />
        <span className="-mr-2.5 ml-auto flex items-center gap-0.5">
          <span className="skeleton size-touch rounded-field" />
          <span className="skeleton size-touch rounded-field" />
        </span>
      </div>

      {/* `pt-gutter`, matching the real screen exactly — see the note at `ExpenseEditor`'s
          body div. This was `pt-4` while the real page had NO top padding at all, so the
          handover shifted every block up by 16px; both are now the same token, which is the
          only way this file keeps the promise in its own docblock. */}
      <div className="pt-gutter px-safe">
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
