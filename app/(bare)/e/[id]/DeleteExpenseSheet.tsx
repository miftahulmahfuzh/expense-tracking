'use client'

import { useTransition } from 'react'

import { deleteExpense } from '@/app/actions/expenses'
import { Button, Sheet } from '@/components/ui'

import { CANCEL_CTA, DELETE_CTA, DELETE_GROUP_CONFIRM, DELETE_GROUP_CTA, DELETING } from './copy'

/**
 * The only confirm in the app.
 *
 * Everything else destructive here uses undo instead, which is fewer taps and strictly safer
 * than a modal you learn to dismiss without reading. Deleting a group is the exception because
 * it is genuinely irreversible: the FK cascade takes the items, the photos and the share link,
 * and `deleteExpense` then deletes the photo bytes (R-18) — there is nothing left to restore.
 */
export function DeleteExpenseSheet({
  open,
  groupId,
  title,
  onClose,
}: {
  open: boolean
  groupId: string
  title: string
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <Sheet
      open={open}
      // While the delete is in flight the sheet stops being dismissible: the redirect is
      // already on its way, and closing the sheet would show the user a page about to vanish.
      onClose={() => {
        if (!isPending) onClose()
      }}
      title={DELETE_GROUP_CTA}
      description={DELETE_GROUP_CONFIRM}
      footer={
        <>
          <Button
            variant="destructive"
            fullWidth
            loading={isPending}
            onClick={() => {
              /*
               * NO try/catch, ever. `deleteExpense` ends in a server-side `redirect()`, which
               * signals by THROWING NEXT_REDIRECT (R-17 / CD-2). Catching it here would
               * swallow the navigation and strand the user on a detail page whose group no
               * longer exists — the exact 404 flash the server-side redirect exists to avoid.
               */
              startTransition(async () => {
                await deleteExpense(groupId)
              })
            }}
          >
            {isPending ? DELETING : DELETE_CTA}
          </Button>
          <Button variant="ghost" fullWidth className="mt-2" disabled={isPending} onClick={onClose}>
            {CANCEL_CTA}
          </Button>
        </>
      }
    >
      {/* The group's own title, quoted, so nobody deletes the wrong thing from muscle memory. */}
      <p className="text-item text-ink">“{title}”</p>
    </Sheet>
  )
}
