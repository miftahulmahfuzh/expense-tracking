'use client'

import { useState, useTransition } from 'react'

import { revokeShareLink } from '@/app/actions/share'
import { Button, Card, Sheet, useToast } from '@/components/ui'
import { shareUrl } from '@/lib/share/config'

import {
  REVOKE_CONFIRM_BODY,
  REVOKE_CONFIRM_NO,
  REVOKE_CONFIRM_PHOTOS,
  REVOKE_CONFIRM_TITLE,
  REVOKE_CONFIRM_YES,
  REVOKE_CTA,
  REVOKE_FAILED,
  REVOKED_TOAST,
  REVOKING,
  SHARE_PANEL_ACTIVE,
  SHARE_PANEL_HEADING,
} from './copy'

export type ShareLinkPanelProps = {
  groupId: string
  /** `getGroupDetail().shareToken` (R-12). Null ⇒ this renders nothing at all. */
  token: string | null
  /** Absolute origin from `shareOrigin()`, so the URL shown is the one a friend received. */
  origin: string
}

/**
 * The live-link status and its revoke control, on `/e/[id]` above `Hapus pengeluaran`.
 *
 * WHY IT IS NOT IN THE HEADER with the Bagikan button. Design R-38 gives the pushed-view
 * header exactly one action, and this is not an action the user came here to take — it is
 * the answer to "is this thing still public?", which is a piece of *status*. It also has to
 * be legible at rest: the panel is present on first paint whenever a link exists, so nobody
 * has to remember that they shared something. It sits above the delete button rather than
 * below it so the page still ends on its most destructive control, with a gap between the
 * two red affordances.
 *
 * THE STATE MODEL. `token` is a server prop, not mirrored into state (the R-92 / R-105 rule:
 * no `useState` copy of server data, no prop-echoing effect). Revoking runs inside a
 * transition; the action's `revalidateGroup` re-renders the page with `shareToken: null` and
 * the panel disappears. A FAILED revoke settles the transition with the prop unchanged, so
 * the panel simply stays — the snap-back is free and there is nothing to roll back by hand.
 */
export function ShareLinkPanel({ groupId, token, origin }: ShareLinkPanelProps) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [revoking, startRevoke] = useTransition()

  if (!token) return null

  function onRevoke() {
    startRevoke(async () => {
      try {
        await revokeShareLink(groupId)
        setConfirming(false)
        toast.show(REVOKED_TOAST)
      } catch {
        toast.show(REVOKE_FAILED, { tone: 'danger' })
      }
    })
  }

  return (
    <section>
      <h2 className="mb-2 eyebrow">{SHARE_PANEL_HEADING}</h2>

      <Card>
        <p className="text-body text-ink-2">{SHARE_PANEL_ACTIVE}</p>

        {/* The URL itself, mono and truncated. Not selectable-by-design and not a link:
            tapping it would navigate the owner out of their own page, and the way to send
            it is the Bagikan button in the header. It is here so the user can SEE which
            link is live. */}
        <p className="mt-2 truncate font-mono text-meta text-ink-3">{shareUrl(origin, token)}</p>

        <Button
          variant="destructive"
          size="md"
          fullWidth
          className="mt-3"
          disabled={revoking}
          onClick={() => setConfirming(true)}
        >
          {REVOKE_CTA}
        </Button>
      </Card>

      {/*
       * A confirm, not an undo — the app's one other confirm (DeleteExpenseSheet) exists for
       * the same reason. Undo is the better pattern when the damage is local and reversible;
       * here the damage lands on someone else's phone the instant it happens, and re-sharing
       * mints a different token rather than restoring the old one. There is nothing to undo.
       */}
      <Sheet
        open={confirming}
        onClose={() => {
          if (!revoking) setConfirming(false)
        }}
        title={REVOKE_CONFIRM_TITLE}
        description={REVOKE_CONFIRM_BODY}
        footer={
          <>
            <Button variant="destructive" fullWidth loading={revoking} onClick={onRevoke}>
              {revoking ? REVOKING : REVOKE_CONFIRM_YES}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              className="mt-2"
              disabled={revoking}
              onClick={() => setConfirming(false)}
            >
              {REVOKE_CONFIRM_NO}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2">{REVOKE_CONFIRM_PHOTOS}</p>
      </Sheet>
    </section>
  )
}
