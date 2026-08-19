// Placeholder landing page. F02 owns this route (reconciliation R-6) and replaces this
// with the signed-out landing + Google button and the signed-in redirect to /m/<YYYY-MM>.
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">expensetracking.online</h1>
      <p className="text-sm opacity-60">Foundation is up. F02 lands sign-in here.</p>
    </main>
  )
}
