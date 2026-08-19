/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F07 — updateExpenseMeta / deleteExpense, the editing half of expenses.ts.
 *
 *  createExpense (F05) is covered in ./expenses.test.ts. This file covers the two
 *  properties that are unique to editing, and both of them are things nothing in the
 *  UI would ever show you going wrong:
 *
 *   1. DUAL-MONTH REVALIDATION. Moving an expense from August to July has to bust BOTH
 *      month pages. Bust only the new one and August keeps reporting a total that
 *      includes an expense that is no longer in it — forever, since nothing else will
 *      ever invalidate that path.
 *   2. THE BLOB SWEEP (R-18). expense_photos rows cascade with the group; the BYTES do
 *      not. The pathnames have to be collected BEFORE the delete, because afterwards
 *      nothing in the database points at them and even the sweeper cannot tell them
 *      from a live photo. R-18 calls this load-bearing: it is the fastest way to
 *      silently consume the 1 GB free tier.
 *
 *  Plus the usual boundary: requireUserId() first, Zod before any statement, every
 *  mutation scoped by user_id, and a cross-user id indistinguishable from a missing one.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: authMock }))

vi.mock('@/lib/db', () => import('../../../tests/support/probeDb'))

const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath }))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

/** The real one talks to Vercel Blob. What matters here is WHAT it is handed, and WHEN. */
const deleteBlobsQuietly = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/blob/delete', () => ({ deleteBlobsQuietly }))

const { deleteExpense, updateExpenseMeta } = await import('../expenses')
const { NotFoundError } = await import('@/lib/db/queries')
const { calls, normalise, queueRows, reset } = await import('../../../tests/support/probeDb')

const USER = 'usr000000001'
const GROUP = 'grp000000001'
const DAY = '2026-08-18'

/** getOwnedGroupAnchor selects { groupId, occurredOn }. */
const anchorRow = [[GROUP, DAY]]

const PATHNAMES = [
  'photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg',
  'photos/Ak-igSGzS6rpPd1sRM9iz-bLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg',
]

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  authMock.mockResolvedValue({ user: { id: USER } })
})

describe('updateExpenseMeta', () => {
  it('proves ownership first, then updates scoped by id AND user_id', async () => {
    queueRows(anchorRow)

    await updateExpenseMeta(GROUP, { title: 'bakar duit tuesday' })

    expect(calls).toHaveLength(2)
    expect(normalise(calls[0]!.sql)).toMatch(/^select .* from "expense_groups"/)

    const updateSql = normalise(calls[1]!.sql)
    expect(updateSql).toMatch(/^update "expense_groups" set/)
    expect(updateSql).toContain('"user_id" = $')
    expect(calls[1]!.params).toContain(USER)
    expect(calls[1]!.params).toContain('bakar duit tuesday')
  })

  it('bumps updated_at on every patch', async () => {
    queueRows(anchorRow)

    await updateExpenseMeta(GROUP, { title: 'x' })

    expect(normalise(calls[1]!.sql)).toContain('"updated_at"')
    // Drizzle's timestamp mapper stringifies the Date before it reaches the driver, so the
    // bound parameter is an ISO instant rather than a Date object.
    expect(
      calls[1]!.params.some((p) => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(p)),
    ).toBe(true)
  })

  it('sends only the fields in the patch', async () => {
    queueRows(anchorRow)

    await updateExpenseMeta(GROUP, { note: 'kantor' })

    const updateSql = normalise(calls[1]!.sql)
    expect(updateSql).toContain('"note"')
    expect(updateSql).not.toContain('"title"')
    expect(updateSql).not.toContain('"occurred_on"')
  })

  it('stores a cleared note as NULL, so "empty" has one representation', async () => {
    queueRows(anchorRow)

    await updateExpenseMeta(GROUP, { note: '' })

    expect(calls[1]!.params).toContain(null)
    expect(calls[1]!.params).not.toContain('')
  })

  it('revalidates ONE month when the date did not change', async () => {
    queueRows(anchorRow)

    await updateExpenseMeta(GROUP, { title: 'x' })

    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      `/e/${GROUP}`,
      '/m/2026-08',
      '/stats',
    ])
  })

  it('revalidates BOTH months when the expense moves between them', async () => {
    queueRows(anchorRow) // the group currently sits in 2026-08

    await updateExpenseMeta(GROUP, { occurredOn: '2026-07-31' })

    const paths = revalidatePath.mock.calls.map(([path]) => path)
    expect(paths).toContain('/m/2026-08') // the month it LEFT
    expect(paths).toContain('/m/2026-07') // the month it JOINED
    expect(paths).toContain(`/e/${GROUP}`)
    expect(paths).toContain('/stats')
    expect(paths).toHaveLength(4)
  })

  it('dedupes when the new date is in the same month', async () => {
    queueRows(anchorRow)

    await updateExpenseMeta(GROUP, { occurredOn: '2026-08-02' })

    const months = revalidatePath.mock.calls
      .map(([path]) => path as string)
      .filter((path) => path.startsWith('/m/'))
    expect(months).toEqual(['/m/2026-08'])
  })

  it('rejects a date that is shaped right but is not a real day', async () => {
    await expect(updateExpenseMeta(GROUP, { occurredOn: '2026-02-30' })).rejects.toThrow()
    await expect(updateExpenseMeta(GROUP, { occurredOn: '2026-13-01' })).rejects.toThrow()
    await expect(updateExpenseMeta(GROUP, { occurredOn: '18/8/2026' })).rejects.toThrow()

    expect(calls).toHaveLength(0)
  })

  it('rejects an empty patch and an empty title', async () => {
    await expect(updateExpenseMeta(GROUP, {})).rejects.toThrow()
    await expect(updateExpenseMeta(GROUP, { title: '   ' })).rejects.toThrow()

    expect(calls).toHaveLength(0)
  })

  it('redirects before touching the database when there is no session', async () => {
    authMock.mockResolvedValue(null)

    await expect(updateExpenseMeta(GROUP, { title: 'x' })).rejects.toThrow('NEXT_REDIRECT:/')
    expect(calls).toHaveLength(0)
  })

  it('writes nothing for a group that is missing OR belongs to someone else', async () => {
    queueRows([])

    await expect(updateExpenseMeta(GROUP, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError)

    expect(calls).toHaveLength(1)
    expect(calls.some((c) => /^update/i.test(normalise(c.sql)))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteExpense', () => {
  function queueDeletable() {
    queueRows(anchorRow) // getOwnedGroupAnchor
    queueRows(PATHNAMES.map((p) => [p])) // listOwnedGroupPathnames
  }

  it('collects the blob pathnames BEFORE the delete, then deletes the bytes AFTER it', async () => {
    queueDeletable()
    let statementsWhenBlobsDeleted = -1
    deleteBlobsQuietly.mockImplementation(async () => {
      statementsWhenBlobsDeleted = calls.length
    })

    await expect(deleteExpense(GROUP)).rejects.toThrow('NEXT_REDIRECT:/m/2026-08')

    expect(calls).toHaveLength(3)
    expect(normalise(calls[0]!.sql)).toMatch(/^select .* from "expense_groups"/)
    expect(normalise(calls[1]!.sql)).toMatch(/^select .* from "expense_photos"/)
    expect(normalise(calls[2]!.sql)).toMatch(/^delete from "expense_groups"/)

    // R-18 in one assertion: the pathname read is statement 2, the row delete is statement 3,
    // and the bytes go only once all three have run.
    expect(statementsWhenBlobsDeleted).toBe(3)
    expect(deleteBlobsQuietly).toHaveBeenCalledWith(PATHNAMES)
  })

  it('reads the pathnames with the ownership EXISTS, never by group id alone', async () => {
    queueDeletable()

    await expect(deleteExpense(GROUP)).rejects.toThrow(/NEXT_REDIRECT/)

    const photoSql = normalise(calls[1]!.sql)
    expect(photoSql).toMatch(/exists/i)
    expect(photoSql).toContain('"expense_groups"."user_id"')
    expect(calls[1]!.params).toContain(USER)
  })

  it('scopes the delete by id AND user_id', async () => {
    queueDeletable()

    await expect(deleteExpense(GROUP)).rejects.toThrow(/NEXT_REDIRECT/)

    const deleteSql = normalise(calls[2]!.sql)
    expect(deleteSql).toContain('"id" = $')
    expect(deleteSql).toContain('"user_id" = $')
    expect(calls[2]!.params).toEqual([GROUP, USER])
  })

  it('redirects to the month the group was in, after revalidating it', async () => {
    queueDeletable()

    await expect(deleteExpense(GROUP)).rejects.toThrow('NEXT_REDIRECT:/m/2026-08')

    expect(revalidatePath).toHaveBeenCalledWith(`/e/${GROUP}`)
    expect(revalidatePath).toHaveBeenCalledWith('/m/2026-08')
    expect(revalidatePath).toHaveBeenCalledWith('/stats')
  })

  it('handles a group with no photos without calling the blob API', async () => {
    queueRows(anchorRow)
    queueRows([]) // no photo rows

    await expect(deleteExpense(GROUP)).rejects.toThrow(/NEXT_REDIRECT/)

    expect(deleteBlobsQuietly).toHaveBeenCalledWith([])
  })

  it('deletes nothing for a group that is missing OR belongs to someone else', async () => {
    queueRows([])

    await expect(deleteExpense(GROUP)).rejects.toBeInstanceOf(NotFoundError)

    expect(calls).toHaveLength(1)
    expect(deleteBlobsQuietly).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('redirects to sign-in before touching the database when there is no session', async () => {
    authMock.mockResolvedValue(null)

    await expect(deleteExpense(GROUP)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(calls).toHaveLength(0)
    expect(deleteBlobsQuietly).not.toHaveBeenCalled()
  })
})
