'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createShareLink } from '@/app/actions/share'
import { Button, Input, LoadingDots, Sheet, ShareIcon, useToast } from '@/components/ui'
import { formatJakartaLong } from '@/lib/format'
import { copyText } from '@/lib/share/clipboard'
import { shareUrl } from '@/lib/share/config'

import {
  CLOSE_CTA,
  MANUAL_COPY_BODY,
  MANUAL_COPY_TITLE,
  SHARE_COPIED_TOAST,
  SHARE_CTA,
  SHARE_FAILED,
} from './copy'

export type ShareButtonProps = {
  groupId: string
  /** Group title — the share sheet's title and the first half of its text line. */
  title: string
  /** 'YYYY-MM-DD'. Only used to compose the share sheet's text line. */
  occurredOn: string
  /**
   * Absolute origin, resolved server-side by `shareOrigin()`. NOT read from the browser:
   * `window.location.origin` on a preview deployment would hand a friend a `*.vercel.app`
   * URL that dies at the next push. F09 Open question 6.
   */
  origin: string
  /**
   * The group's existing token, or null. Comes from `getGroupDetail().shareToken` (R-12) —
   * F07 already fetched it, so this component issues no query of its own and the very first
   * tap after a reload is already synchronous.
   */
  initialToken: string | null
}

/*
 * THE SHARE GLYPH MOVED (F12) to `components/ui/Icon.tsx` as `ShareIcon`, which wraps
 * lucide's `Share` — the same drawing: a tray with an arrow leaving through the top, iOS's
 * own mark, the icon already sitting in Safari's toolbar two centimetres below this button.
 * NOT lucide's `Share2`, which is the three-node graph that means share on Android and
 * nothing at all in Safari.
 *
 * What was here before was that shape hand-drawn in three paths, under a docblock arguing
 * that "this repo has no icon dependency, and adding one for two glyphs would import a
 * library to use a fraction of it". F12 took the app to twelve glyphs and flipped that
 * arithmetic; the stroke half of the argument — 24 viewBox, 2.5 stroke, square caps, mitred
 * joins, 22px rendered — is now enforced by `Icon.tsx` on every glyph rather than restated
 * per file.
 *
 * WHY A PICTURE IS ALLOWED TO REPLACE THE WORD HERE, when `copy.ts`'s whole premise is that
 * the words are canonical: the header had one text action and now has two, and two words —
 * `Bagikan` and `Hapus pengeluaran` — do not fit beside a label on a 414px band without one
 * of them wrapping or dropping below the design's type floor. The word survives as the
 * `aria-label`, so nothing that reads the page rather than looking at it lost anything.
 */

/** WebKit reports a dismissed share sheet as AbortError. That is a user choice, not a failure. */
function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * The **Bagikan** action in `/e/[id]`'s header. One tap → the native share sheet. F09 §2.3.
 *
 * NOW AN ICON, and no longer alone up there. Design R-38 specified a text button and R-124
 * put `Hapus pengeluaran` at the far end of the page instead of beside it, on the reading
 * that the header gets exactly ONE action. Both are superseded: the header carries share
 * and delete as two 44px icon buttons. `ExpenseEditor`'s header docblock is where that
 * decision and its cost are written down — read it before adding a third.
 *
 * ═══ TWO BROWSER CONSTRAINTS SHAPE EVERYTHING BELOW ═══
 *
 * 1. TRANSIENT ACTIVATION. `navigator.share()` must be called while the user gesture is
 *    still live, and WebKit's activation window is consumed by awaiting an unrelated
 *    promise. The naive `onClick={async () => { const t = await mint(); navigator.share() }}`
 *    works on a fast connection and throws `NotAllowedError` on a slow one — i.e. it fails
 *    exactly when the user is out at dinner on cellular, which is the whole use case.
 *    The fix is WARMING: the mint starts on `pointerdown`, which fires before `click`, so by
 *    the time the click handler runs the token is normally already resolved and `share()` is
 *    called with the gesture intact. After the first mint the token is in state and every
 *    later tap is synchronous by construction.
 *
 * 2. FEATURE DETECTION IS NOT SSR-SAFE. Branching what is RENDERED on `navigator.share`
 *    existing would produce a hydration mismatch — which is why the glyph and the
 *    `aria-label` are the same on the server, on a desktop browser and on an iPhone. The
 *    branch lives entirely inside the handler, and the icon is if anything more honest than
 *    the word was: a tray with an arrow is what BOTH outcomes do.
 *
 * ═══ AND THE ERROR TAXONOMY, MOST OF WHICH ARE NOT ERRORS ═══
 *
 *   AbortError      the user swiped the sheet away → do NOTHING. No toast, no log, no state
 *                   change. Getting this wrong means a scary red message every time someone
 *                   changes their mind, and it is the single most-missed detail in Web Share
 *                   integrations.
 *   NotAllowedError activation expired or a permissions policy blocks it → clipboard
 *   TypeError/undef desktop browser or a non-secure context → clipboard
 *   clipboard fails iOS clipboard needs activation too → show the URL, selected, to long-press
 *   action throws   not the owner, or the DB is down → one honest toast
 */
export function ShareButton({
  groupId,
  title,
  occurredOn,
  origin,
  initialToken,
}: ShareButtonProps) {
  const toast = useToast()
  const router = useRouter()
  const [token, setToken] = useState<string | null>(initialToken)
  const [sharing, setSharing] = useState(false)
  /** Set only when navigator.share AND both clipboard paths failed. */
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [, startRefresh] = useTransition()

  /** The in-flight mint, so pointerdown-warming and the click handler share ONE request. */
  const mintRef = useRef<Promise<string> | null>(null)

  const ensureToken = useCallback((): Promise<string> => {
    if (token) return Promise.resolve(token)
    if (!mintRef.current) {
      mintRef.current = createShareLink(groupId).then(
        ({ token: minted }) => {
          setToken(minted)
          /*
           * The revoke panel lives further down the page and is server-rendered from
           * `shareToken`, so it only knows a link exists once the page re-renders. The
           * action already called `revalidateGroup`, which evicts the entry; this asks the
           * router to pick the new payload up now rather than on the next navigation.
           * Once per group, on the rarest action in the app.
           */
          startRefresh(() => router.refresh())
          return minted
        },
        (err: unknown) => {
          mintRef.current = null // let the next tap retry
          throw err
        },
      )
    }
    return mintRef.current
  }, [groupId, router, token])

  /**
   * Warm on pointerdown — see constraint 1 above. Failures are swallowed here on purpose: the
   * click handler is a few milliseconds behind and is where the user gets told.
   *
   * KNOWN AND ACCEPTED: a pointerdown that never becomes a click — a mis-touch, a drag away —
   * still mints the link, and the status panel below will then say one exists. Nothing is
   * revealed by that: the URL is 72 unguessable bits that were never sent anywhere, the panel
   * is telling the truth, and Batalkan tautan is one tap. The alternative is losing the
   * activation window on exactly the slow connection where the user needs it.
   */
  const warm = useCallback(() => {
    if (token) return
    void ensureToken().catch(() => {})
  }, [ensureToken, token])

  async function onShare() {
    if (sharing) return
    setSharing(true)

    let active = token
    if (!active) {
      try {
        active = await ensureToken()
      } catch {
        toast.show(SHARE_FAILED, { tone: 'danger' })
        setSharing(false)
        return
      }
    }

    const url = shareUrl(origin, active)

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: `${title} — ${formatJakartaLong(occurredOn)}`, url })
        // Shared. The OS already gave feedback; a toast on top of it is noise.
        setSharing(false)
        return
      } catch (err) {
        if (isAbortError(err)) {
          setSharing(false)
          return
        }
        // Anything else falls through to the clipboard.
      }
    }

    if (await copyText(url)) toast.show(SHARE_COPIED_TOAST)
    else setManualUrl(url)

    setSharing(false)
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={warm}
        onClick={onShare}
        disabled={sharing}
        aria-busy={sharing || undefined}
        /*
         * THE LABEL IS NOW THE `aria-label`, and that is the only thing the icon changed
         * about this control's accessibility contract: `Bagikan` is still the accessible
         * name, still the same canonical string from `copy.ts`, and still what voice
         * control matches on. What it is NOT any more is visible — see the glyph's own
         * docblock for why a picture is allowed to carry it here.
         */
        aria-label={SHARE_CTA}
        className="grid size-touch shrink-0 press place-items-center rounded-field text-ink disabled:opacity-50"
      >
        {/* Swapped, not overlaid: an icon button has no label box to preserve, so there is
            nothing to keep from collapsing and the dots can simply take the glyph's place. */}
        {sharing ? <LoadingDots /> : <ShareIcon />}
      </button>

      <Sheet
        open={manualUrl !== null}
        onClose={() => setManualUrl(null)}
        title={MANUAL_COPY_TITLE}
        description={MANUAL_COPY_BODY}
        footer={
          <Button variant="secondary" fullWidth onClick={() => setManualUrl(null)}>
            {CLOSE_CTA}
          </Button>
        }
      >
        {/* Read-only and selected on focus. `Input` carries F10's 17px floor, which is what
            stops Safari zooming the viewport the moment this gets focus. */}
        <Input
          readOnly
          value={manualUrl ?? ''}
          onFocus={(event) => event.currentTarget.select()}
          className="tabular"
        />
      </Sheet>
    </>
  )
}
