/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F09 — createShareLink / revokeShareLink.
 *
 *  Every other action in this app can, at worst, corrupt the caller's own data. This one
 *  PUBLISHES a group to the open internet, and roadmap D3 lets any Google account sign in —
 *  so "a stranger with a session guessing a group id" is squarely in the threat model. R-5
 *  makes the action itself the boundary: `proxy.ts` does not cover Server Functions, and it
 *  deliberately does not match `/s` at all.
 *
 *  Five properties, each silent if it regresses:
 *
 *   1. requireUserId() runs FIRST — before validation, before any statement.
 *   2. Ownership is proven against expense_groups.user_id BEFORE any write, and a group that
 *      belongs to someone else is indistinguishable from one that does not exist.
 *   3. MINTING IS IDEMPOTENT. A second Bagikan returns the SAME token and writes nothing.
 *      This is the assertion that matters most, because the failure is invisible in normal
 *      use: a fresh token silently breaks the link the user sent yesterday.
 *   4. A conflicting insert is disambiguated by re-reading on group_id — a concurrent mint
 *      is a success (return its token), a PK collision is a retry.
 *   5. Revoke DELETEs and is idempotent, and both actions bust /e/<id>.
 *
 *  `@/auth` is mocked so F02's real requireUserId runs; `@/lib/db` is the probe client so
 *  F03's real ownership SQL runs and every emitted statement is observable.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: authMock }))

vi.mock('@/lib/db', () => import('../../../tests/support/probeDb'))

const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath }))

/** redirect() throws NEXT_REDIRECT; a bare throw is enough to observe the bounce. */
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

const { createShareLink, revokeShareLink } = await import('../share')
const { NotFoundError } = await import('@/lib/db/queries')
const { isValidId } = await import('@/lib/id')
const { calls, normalise, queueRows, reset } = await import('../../../tests/support/probeDb')

const USER = 'usr000000001'
const GROUP = 'grp000000001'
const DAY = '2026-08-18'
const TOKEN = 'V1StGXR8_Z5j'

/** What getOwnedGroupAnchor selects, in key order. */
const anchorRow = [[GROUP, DAY]]

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  authMock.mockResolvedValue({ user: { id: USER } })
})

describe('createShareLink — the ownership gate', () => {
  it('redirects before touching the database when there is no session', async () => {
    authMock.mockResolvedValue(null)

    await expect(createShareLink(GROUP)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(calls).toHaveLength(0)
  })

  it('proves ownership against expense_groups.user_id before any write', async () => {
    queueRows(anchorRow) // the anchor
    queueRows([]) // no existing link
    queueRows([[TOKEN]]) // the insert returns

    await createShareLink(GROUP)

    const anchor = calls[0]!
    expect(normalise(anchor.sql)).toMatch(/^select .* from "expense_groups"/)
    expect(anchor.sql).toContain('"user_id"')
    expect(anchor.params).toEqual([GROUP, USER, 1])
    // And it really is first: nothing touched share_links before it.
    expect(calls.findIndex((c) => /share_links/.test(c.sql))).toBeGreaterThan(0)
  })

  it('publishes NOTHING for a group that is missing OR belongs to someone else', async () => {
    queueRows([]) // the anchor finds no row

    await expect(createShareLink(GROUP)).rejects.toBeInstanceOf(NotFoundError)

    // One statement, and it was the ownership probe. No read of share_links either: the
    // action must not become an oracle for "does this group have a link".
    expect(calls).toHaveLength(1)
    expect(calls.some((c) => /share_links/.test(c.sql))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a malformed group id before the session is even spent on a query', async () => {
    for (const bad of ['', 'short', '../../etc/passwd', 'a'.repeat(64), 'has spaces!']) {
      await expect(createShareLink(bad)).rejects.toThrow()
    }
    expect(calls).toHaveLength(0)
  })
})

describe('createShareLink — idempotence', () => {
  it('returns the EXISTING token and writes nothing at all', async () => {
    queueRows(anchorRow)
    queueRows([[TOKEN]]) // share_links already has a row for this group

    const result = await createShareLink(GROUP)

    expect(result).toEqual({ token: TOKEN })
    expect(calls).toHaveLength(2)
    expect(calls.some((c) => /insert into/i.test(c.sql))).toBe(false)
    // No write ⇒ no cache churn either. The common tap costs one indexed lookup.
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('mints on the first tap, scoped to the proven group id', async () => {
    queueRows(anchorRow)
    queueRows([])
    queueRows([[TOKEN]])

    const { token } = await createShareLink(GROUP)

    expect(token).toBe(TOKEN)
    const insert = calls[2]!
    expect(normalise(insert.sql)).toMatch(/^insert into "share_links"/)
    expect(insert.sql).toContain('on conflict do nothing')
    // NO conflict target: the bare form absorbs the primary key AND group_id, and the
    // re-read below is what tells them apart. Targeting group_id would let a token
    // collision escape as an unhandled 23505.
    expect(insert.sql).not.toMatch(/on conflict \(/)
    expect(insert.params).toContain(GROUP)
    // The token written is a freshly minted 12-symbol id; the value returned is whatever
    // RETURNING gave back, which is the row that actually landed.
    expect(insert.params.some((p) => typeof p === 'string' && isValidId(p))).toBe(true)
  })

  it('busts /e/<id> and the group month when it actually minted', async () => {
    queueRows(anchorRow)
    queueRows([])
    queueRows([[TOKEN]])

    await createShareLink(GROUP)

    expect(revalidatePath).toHaveBeenCalledWith(`/e/${GROUP}`)
    expect(revalidatePath).toHaveBeenCalledWith('/m/2026-08')
  })
})

describe('createShareLink — the two ways an insert can conflict', () => {
  it('a concurrent mint is a SUCCESS: return the token that won the race', async () => {
    queueRows(anchorRow)
    queueRows([]) // no link when we looked
    queueRows([]) // insert absorbed by a conflict
    queueRows([['0therT0ken1']]) // re-read: a row for this group now exists

    const { token } = await createShareLink(GROUP)

    // A double-tap or two open tabs must not surface an error the user did not cause,
    // and must not leave two ideas of which URL is live.
    expect(token).toBe('0therT0ken1')
    expect(calls.filter((c) => /insert into/i.test(c.sql))).toHaveLength(1)
  })

  it('a primary-key collision draws a new token and tries again', async () => {
    queueRows(anchorRow)
    queueRows([]) // no existing link
    queueRows([]) // attempt 1: conflict
    queueRows([]) // re-read: still nothing for this group ⇒ it was the PK
    queueRows([[TOKEN]]) // attempt 2 lands

    const { token } = await createShareLink(GROUP)

    expect(token).toBe(TOKEN)
    const inserts = calls.filter((c) => /insert into/i.test(c.sql))
    expect(inserts).toHaveLength(2)
    // A FRESH token, not the one that just collided.
    expect(inserts[0]!.params[0]).not.toBe(inserts[1]!.params[0])
  })

  it('gives up loudly rather than looping forever', async () => {
    queueRows(anchorRow)
    queueRows([])
    for (let i = 0; i < 3; i++) {
      queueRows([]) // insert conflicts
      queueRows([]) // and it was not the group_id constraint
    }

    await expect(createShareLink(GROUP)).rejects.toThrow('Gagal membuat tautan.')
    expect(calls.filter((c) => /insert into/i.test(c.sql))).toHaveLength(3)
  })
})

describe('revokeShareLink', () => {
  it('deletes the row for the proven group, and nothing else', async () => {
    queueRows(anchorRow)
    queueRows([])

    await revokeShareLink(GROUP)

    expect(calls).toHaveLength(2)
    const del = calls[1]!
    expect(normalise(del.sql)).toMatch(/^delete from "share_links"/)
    expect(del.params).toEqual([GROUP])
    // No revoked_at, no soft delete, no expiry: the row is gone and /s 404s (roadmap §4.2).
    expect(del.sql).not.toMatch(/update|revoked/i)
  })

  it('deletes nothing for a group that is missing or belongs to someone else', async () => {
    queueRows([])

    await expect(revokeShareLink(GROUP)).rejects.toBeInstanceOf(NotFoundError)

    expect(calls).toHaveLength(1)
    expect(calls.some((c) => /delete from/i.test(c.sql))).toBe(false)
  })

  it('is idempotent — revoking an unshared group is a no-op, not an error', async () => {
    queueRows(anchorRow)
    queueRows([]) // the delete removes zero rows

    await expect(revokeShareLink(GROUP)).resolves.toBeUndefined()
    expect(revalidatePath).toHaveBeenCalledWith(`/e/${GROUP}`)
  })

  it('redirects before touching the database when there is no session', async () => {
    authMock.mockResolvedValue(null)

    await expect(revokeShareLink(GROUP)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(calls).toHaveLength(0)
  })
})
