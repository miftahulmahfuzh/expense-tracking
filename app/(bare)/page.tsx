import { redirect } from 'next/navigation'
import { Button } from '@/components/ui'
import { signInWithGoogleAction } from '@/lib/auth/actions'
import { getUserId } from '@/lib/auth/requireUserId'
import { safeNext } from '@/lib/auth/safeNext'
import { currentMonthKey } from '@/lib/format'

/**
 * `/` — the sign-in landing.
 *
 * OWNERSHIP: F02 owns this route (reconciliation R-6): it is the only feature that reads the
 * session to decide between rendering this landing and redirecting to `/m/<currentMonthKey>`.
 * F10 supplied the presentational half — the design's sign-in composition, with the copy fixed
 * by design R-40 — and F02 has now attached the session check and the real Google action.
 *
 * The file sits in the `(bare)` route group so it gets the centred mobile column without the
 * tab bar. The route is unchanged: a route group never appears in a URL.
 *
 * There is no sign-up flow and there never will be. With Google OAuth the first sign-in *is*
 * the sign-up — the Drizzle adapter inserts the `user` row on the way through.
 *
 * No `export const metadata` here on purpose: the root layout already defaults the title to
 * "Expense Tracking", and setting it again would run it through the `%s · Expense Tracking`
 * template and render "Expense Tracking · Expense Tracking".
 */
export default async function Page({ searchParams }: PageProps<'/'>) {
  const [userId, params] = await Promise.all([getUserId(), searchParams])

  // `next` is where proxy.ts wanted to send them. Honour it for an already-signed-in visitor
  // too — landing on the month view after asking for /stats is a small lie the app can avoid.
  const next = safeNext(params.next)

  if (userId) {
    redirect(next === '/' ? `/m/${currentMonthKey()}` : next)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-gutter text-center">
      <div className="px-4">
        <p className="font-mono text-label tracking-[0.24em] text-ink-3 uppercase">
          expensetracking.online
        </p>

        <h1 className="mt-3.5 mb-3 text-hero">Expense Tracking</h1>

        <p className="text-input text-pretty text-ink-2">Catat pengeluaran dengan sekali tempel.</p>
      </div>

      {params.error ? (
        <p role="alert" className="mt-9 px-4 font-mono text-meta text-red">
          Gagal masuk. Coba lagi ya.
        </p>
      ) : null}

      <form
        action={signInWithGoogleAction}
        className={params.error ? 'mt-5 w-full' : 'mt-11 w-full'}
      >
        <input type="hidden" name="next" value={next} />
        <Button
          type="submit"
          variant="secondary"
          fullWidth
          leadingIcon={<span className="font-serif text-input font-semibold">G</span>}
        >
          Lanjut dengan Google
        </Button>
      </form>

      <p className="mt-5 font-mono text-meta text-ink-3">Datamu privat. Cuma kamu yang lihat.</p>
    </main>
  )
}
