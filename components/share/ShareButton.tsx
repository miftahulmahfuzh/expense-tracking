'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createShareLink } from '@/app/actions/share'
import { Button, Input, Sheet, useToast } from '@/components/ui'
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

/** WebKit reports a dismissed share sheet as AbortError. That is a user choice, not a failure. */
function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * The **Bagikan** action in `/e/[id]`'s header (design R-38: back chevron · mono label ·
 * optional action). One tap → the native share sheet. F09 §2.3.
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
 * 2. FEATURE DETECTION IS NOT SSR-SAFE. Branching the rendered label on `navigator.share`
 *    existing would produce a hydration mismatch. The button always says Bagikan; the branch
 *    lives entirely inside the handler.
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
      <Button
        variant="ghost"
        size="md"
        className="-mr-2.5"
        onPointerDown={warm}
        onClick={onShare}
        loading={sharing}
      >
        {SHARE_CTA}
      </Button>

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
          className="font-mono"
        />
      </Sheet>
    </>
  )
}
