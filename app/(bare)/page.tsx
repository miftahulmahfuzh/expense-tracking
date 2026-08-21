import { redirect } from 'next/navigation'
import { CutoutArt } from '@/components/CutoutArt'
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
    /*
     * THE PINK PLATE. The one screen that is not `paper` — a full-bleed background moment,
     * with its own two cut-outs on top of it (the shell's five are underneath and covered).
     * `-mt-*` is not needed: `(bare)`'s wrapper adds no padding of its own, so `min-h-dvh`
     * fills the column exactly. `pb-5.5` is a floor rather than a measured last row — the
     * poster is vertically centred, so on any real phone the privacy line is nowhere near the
     * edge; it is there so a very short viewport cannot push it under the home indicator.
     *
     * LEFT-ALIGNED, not centred. The design stacks the mark, the wordmark and the yellow
     * tagline hard against a 32px left margin — the same edge the button and the domain line
     * hang off — so the whole screen reads as one poster column.
     */
    <main className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-pink px-8 pb-5.5">
      <CutoutArt variant="signin" />

      <div className="relative z-10 flex flex-col items-start">
        <span
          aria-hidden="true"
          className="grid size-18 place-items-center rounded-full bg-red text-[34px] leading-none font-black text-red-fg"
        >
          Rp
        </span>

        {/* `text-hero` is 54px/900 at -0.035em. The break is authored, not wrapped: the
            wordmark is two lines at every width the app is ever shown at. */}
        <h1 className="mt-7 text-hero">
          Expense
          <br />
          Tracking
        </h1>

        <p className="mt-3.5 sticker-lg">Catat Sekali Tempel</p>

        {params.error ? (
          <p role="alert" className="mt-7 text-meta text-red-ink">
            Gagal masuk. Coba lagi ya.
          </p>
        ) : null}

        <form
          action={signInWithGoogleAction}
          className={params.error ? 'mt-6 w-full' : 'mt-13 w-full'}
        >
          <input type="hidden" name="next" value={next} />
          <Button
            type="submit"
            variant="secondary"
            fullWidth
            leadingIcon={<span className="text-[19px] font-black">G</span>}
          >
            Lanjut dengan Google
          </Button>
        </form>

        {/*
         * The domain, set as the design's tiny wide-tracked caption. `ink-3` on pink measures
         * 3.87:1, which is fine for this line and this line only: it is the one piece of text
         * on the screen that carries no information the user needs — the wordmark above it
         * already says what the app is, and the privacy line below it is `ink-2`.
         */}
        <p className="mt-4.5 text-label text-ink-3">expensetracking.online</p>
        <p className="mt-2 text-meta text-ink-2">Datamu privat. Cuma kamu yang lihat.</p>
      </div>
    </main>
  )
}
