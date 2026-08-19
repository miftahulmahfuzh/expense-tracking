'use client'

/** Placeholder — replaced once the reducer, persistence and save paths land. */
export function AddExpenseClient({
  userId,
  todayISO,
  backHref,
}: {
  userId: string
  todayISO: string
  backHref: string
}) {
  return (
    <div className="px-gutter pt-safe-header text-body">
      {userId} · {todayISO} · {backHref}
    </div>
  )
}
