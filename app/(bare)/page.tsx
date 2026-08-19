/**
 * `/` — the sign-in landing.
 *
 * OWNERSHIP: F02 owns this route (reconciliation R-6): it is the only feature that reads the
 * session to decide between rendering this landing and redirecting to `/m/<currentMonthKey>`.
 * F10 supplies the presentational half, which is what is here — the design's sign-in screen
 * composition, with the copy fixed by design R-40. F02 adds the session check and attaches
 * the real Google action to the button slot marked below; it must render into THIS file
 * rather than creating a second `/`, or Next fails the build on a duplicate route.
 *
 * F10 moved the file from `app/page.tsx` into the `(bare)` route group so it gets the
 * centred mobile column without the tab bar. The route is unchanged: a route group never
 * appears in a URL.
 */
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-10 text-center">
      <p className="font-mono text-label tracking-[0.24em] text-ink-3 uppercase">
        expensetracking.online
      </p>

      <h1 className="mt-3.5 mb-3 text-hero">Expense Tracking</h1>

      <p className="text-input text-pretty text-ink-2">Catat pengeluaran dengan sekali tempel.</p>

      {/*
       * F02's button slot. The design specifies a full-width 52px secondary button reading
       * "Lanjut dengan Google", with a 17px serif "G" as its leading icon:
       *
       *   <form action={signInWithGoogle}>
       *     <Button type="submit" variant="secondary" fullWidth
       *             leadingIcon={<span className="font-serif text-input font-semibold">G</span>}>
       *       Lanjut dengan Google
       *     </Button>
       *   </form>
       *
       * Deliberately not rendered yet: a sign-in button that cannot sign you in is worse
       * than no button.
       */}
      <p className="mt-11 font-mono text-meta text-ink-3">Sign-in mendarat di sini — F02.</p>
    </main>
  )
}
