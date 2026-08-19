/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F06 Task 13 — the three photo Server Actions.
 *
 *  A Server Action argument is attacker-controlled and proxy.ts does not cover
 *  Server Functions (R-5), so each action is its own boundary. Three properties are
 *  worth a regression test:
 *
 *   1. requireUserId() runs FIRST — before validation, before any query.
 *   2. deletePhoto removes the ROW BEFORE the BYTES (§10). Reversed, a failure
 *      leaves a row pointing at a 404 on a public share page.
 *   3. discardStagedPhotos refuses any pathname a row references. It cannot be
 *      scoped by userId — an unreferenced blob has no owner to join to — so
 *      unreferenced-ness IS the authorisation, and that check is the whole guard.
 *
 *  `@/auth` is mocked so F02's real requireUserId runs; `@/lib/db` is the probe
 *  client so F03's real ownership SQL runs; only `del()` and revalidatePath, which
 *  reach outside the process, are stubbed.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.BLOB_READ_WRITE_TOKEN ??= 'vercel_blob_rw_unit_test_not_a_real_token'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: authMock }))

vi.mock('@/lib/db', () => import('../../../tests/support/probeDb'))

/** Records WHEN del() ran, relative to the statements the probe client has seen. */
const del = vi.hoisted(() => vi.fn())
vi.mock('@vercel/blob', () => ({ del }))

const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath }))

/** redirect() throws NEXT_REDIRECT; a bare throw is enough to observe the bounce. */
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

const { attachPhoto, deletePhoto, discardStagedPhotos } = await import('../photos')
const { calls, queueRows, reset } = await import('../../../tests/support/probeDb')

const USER = 'usr000000001'
const GROUP = 'grp000000001'
const PHOTO = 'pht000000001'
const PATHNAME = 'photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg'
const BLOB_URL = `https://s.public.blob.vercel-storage.com/${PATHNAME}`

const attachInput = {
  groupId: GROUP,
  blobUrl: BLOB_URL,
  blobPathname: PATHNAME,
  width: 1200,
  height: 1600,
  sizeBytes: 241_000,
}

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  authMock.mockResolvedValue({ user: { id: USER } })
})

describe('attachPhoto', () => {
  it('inserts the row and revalidates the group page', async () => {
    queueRows([[1]]) // assertGroupOwned
    queueRows([]) // no existing row
    queueRows([[0]]) // next sort_order
    queueRows([]) // insert

    const { id } = await attachPhoto(attachInput)

    expect(id).toMatch(/^[0-9A-Za-z_-]{12}$/)
    expect(revalidatePath).toHaveBeenCalledWith(`/e/${GROUP}`)
  })

  it('is idempotent: a second call returns the same id and inserts nothing (CD-3)', async () => {
    queueRows([[1]])
    queueRows([[PHOTO, 1200, 1600, 241_000]]) // already attached

    expect(await attachPhoto(attachInput)).toEqual({ id: PHOTO })
    expect(calls.some((c) => /insert into/i.test(c.sql))).toBe(false)
  })

  it('bounces an unauthenticated caller before validating or querying', async () => {
    authMock.mockResolvedValue(null)

    await expect(attachPhoto(attachInput)).rejects.toThrow(/NEXT_REDIRECT/)
    expect(calls).toHaveLength(0)
  })

  it('bounces before validation, so a signed-out caller learns nothing about the schema', async () => {
    authMock.mockResolvedValue(null)
    await expect(
      attachPhoto({ ...attachInput, blobPathname: 'nonsense' } as never),
    ).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it.each([
    ['a pathname outside photos/', 'avatars/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeA.jpg'],
    ['path traversal', 'photos/../../secrets-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg'],
    [
      'a pathname with no random suffix (so never one Vercel stored)',
      'photos/Uk-igSGzS6rpPd1sRM9iz.jpg',
    ],
    ['a non-jpg', 'photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.svg'],
  ])('refuses %s', async (_label, blobPathname) => {
    await expect(attachPhoto({ ...attachInput, blobPathname })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('refuses a group id that is not the app id shape', async () => {
    await expect(attachPhoto({ ...attachInput, groupId: 'nope' })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('refuses a non-https blobUrl', async () => {
    await expect(attachPhoto({ ...attachInput, blobUrl: 'javascript:alert(1)' })).rejects.toThrow()
  })

  it('accepts null dimensions, so the webhook shape is legal here too', async () => {
    queueRows([[1]])
    queueRows([])
    queueRows([[0]])
    queueRows([])

    await expect(
      attachPhoto({ groupId: GROUP, blobUrl: BLOB_URL, blobPathname: PATHNAME }),
    ).resolves.toMatchObject({ id: expect.any(String) })
  })

  it('rejects a photo the caller does not own, without inserting', async () => {
    queueRows([]) // assertGroupOwned: no
    await expect(attachPhoto(attachInput)).rejects.toThrow(/not found/i)
    expect(calls.some((c) => /insert into/i.test(c.sql))).toBe(false)
  })
})

describe('deletePhoto', () => {
  it('deletes the row FIRST, then the bytes (§10)', async () => {
    queueRows([[PHOTO, GROUP, PATHNAME]]) // the DELETE ... RETURNING
    let statementsWhenBlobDeleted = -1
    del.mockImplementation(async () => {
      statementsWhenBlobDeleted = calls.length
    })

    await deletePhoto(PHOTO)

    // The row delete had already run when del() was called. Reversed, a failing row
    // delete would leave a row pointing at a 404 on a page the user has already shared.
    expect(statementsWhenBlobDeleted).toBe(1)
    expect(calls[0]!.sql).toMatch(/^delete from "expense_photos"/i)
    expect(del).toHaveBeenCalledWith(
      [PATHNAME],
      expect.objectContaining({ token: expect.any(String) }),
    )
    expect(revalidatePath).toHaveBeenCalledWith(`/e/${GROUP}`)
  })

  it('reports success even when del() fails, because the user-visible outcome is correct', async () => {
    queueRows([[PHOTO, GROUP, PATHNAME]])
    del.mockRejectedValue(new Error('blob store unreachable'))

    // The photo IS gone from the gallery and from /s/[token]. ~300 KB leaks until the
    // sweeper runs — an invisible, bounded cost, versus telling the user an operation
    // failed that they can see succeeded.
    await expect(deletePhoto(PHOTO)).resolves.toBeUndefined()
    expect(revalidatePath).toHaveBeenCalledWith(`/e/${GROUP}`)
  })

  it('refuses a photo that is not the callers, and deletes no bytes', async () => {
    queueRows([]) // the ownership EXISTS matched nothing

    await expect(deletePhoto(PHOTO)).rejects.toThrow('Foto tidak ditemukan')
    expect(del).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('gives the same message for "not yours" as for "does not exist"', async () => {
    queueRows([])
    const missing = await deletePhoto('pht999999999').catch((e: Error) => e.message)
    reset()
    queueRows([])
    const notMine = await deletePhoto(PHOTO).catch((e: Error) => e.message)
    expect(missing).toBe(notMine)
  })

  it('bounces an unauthenticated caller', async () => {
    authMock.mockResolvedValue(null)
    await expect(deletePhoto(PHOTO)).rejects.toThrow(/NEXT_REDIRECT/)
    expect(calls).toHaveLength(0)
    expect(del).not.toHaveBeenCalled()
  })
})

describe('discardStagedPhotos', () => {
  const A = 'photos/aaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaaaaaaaaaaaa.jpg'
  const B = 'photos/bbbbbbbbbbbbbbbbbbbbb-bbbbbbbbbbbbbbbbbbbbbb.jpg'

  it('deletes bytes for pathnames no row references', async () => {
    queueRows([]) // pathnamesInUse: none referenced

    await discardStagedPhotos([A, B])

    expect(del).toHaveBeenCalledWith([A, B], expect.objectContaining({ token: expect.any(String) }))
  })

  it('REFUSES a pathname that a row references — the whole authorisation model', async () => {
    // Without this, any signed-in user could pass another user's persisted pathname and
    // delete their photo's bytes, leaving a broken tile on their share page.
    queueRows([[B]]) // B belongs to a real row (possibly someone else's)

    await discardStagedPhotos([A, B])

    expect(del).toHaveBeenCalledWith([A], expect.anything())
  })

  it('deletes nothing when every pathname is referenced', async () => {
    queueRows([[A], [B]])
    await discardStagedPhotos([A, B])
    expect(del).not.toHaveBeenCalled()
  })

  it('is a no-op for an empty list, with no round trip', async () => {
    await discardStagedPhotos([])
    expect(calls).toHaveLength(0)
    expect(del).not.toHaveBeenCalled()
  })

  it('refuses a malformed pathname before any query', async () => {
    await expect(discardStagedPhotos(['photos/../../etc/passwd'])).rejects.toThrow()
    expect(calls).toHaveLength(0)
    expect(del).not.toHaveBeenCalled()
  })

  it('caps the batch, so one call cannot ask about an unbounded list', async () => {
    await expect(discardStagedPhotos(Array.from({ length: 51 }, () => A))).rejects.toThrow()
  })

  it('bounces an unauthenticated caller', async () => {
    authMock.mockResolvedValue(null)
    await expect(discardStagedPhotos([A])).rejects.toThrow(/NEXT_REDIRECT/)
    expect(del).not.toHaveBeenCalled()
  })
})
