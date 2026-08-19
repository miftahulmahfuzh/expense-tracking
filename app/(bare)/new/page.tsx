import type { Metadata } from 'next'

import { requireUserId } from '@/lib/auth/requireUserId'
import { currentMonthKey, todayJakartaISO } from '@/lib/format'

import { AddExpenseClient } from './AddExpenseClient'

/**
 * `/new` — the one screen the product exists for. Paste free text, tap Rapikan, review an
 * editable table, attach photos, tap Simpan.
 *
 * ROUTE GROUP. This sits in `(bare)`, not `(shell)`, so no tab bar stacks on top of its
 * full-width Simpan button (reconciliation R-25 and R-51). The consequence R-51 spells out
 * is that the screen must supply its own way back, which it does — see NewHeader.
 */
export const metadata: Metadata = { title: 'Tambah pengeluaran' }

export default async function NewExpensePage() {
  /*
   * proxy.ts already redirects an unauthenticated visitor away from /new, but R-5 is
   * explicit that the proxy is a UX redirect and this call is the boundary. It is a cookie
   * decrypt with zero round trips, so there is no reason not to.
   */
  const userId = await requireUserId()

  /*
   * Both dates are computed on the SERVER, per request. `todayJakartaISO()` pre-fills the
   * date field and is what the parser anchors relative dates against; computing it in the
   * browser would let a device set to UTC-11 file an expense against yesterday (D9).
   *
   * A tab left open across Jakarta midnight will pre-fill yesterday on a NEW draft. That is
   * accepted: the date field is visible and editable, and a client clock ticking in the
   * background to fix it would be a worse trade than an off-by-one a user can see.
   */
  return (
    <AddExpenseClient
      userId={userId}
      todayISO={todayJakartaISO()}
      backHref={`/m/${currentMonthKey()}`}
    />
  )
}
