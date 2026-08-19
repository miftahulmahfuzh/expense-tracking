/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F06 Task 10 — REGRESSION GUARD ON PHOTO MUTATIONS.
 *
 *  expense_photos carries no user_id: it reaches its owner through group_id
 *  (roadmap §4.4, F03 plan §9). So every statement here must either be preceded by
 *  assertGroupOwned or carry the correlated EXISTS inside itself. If one of these
 *  tests fails, the failure mode is "any signed-in user can attach photos to, or
 *  delete photos from, anyone else's expenses".
 *
 *  Written the way tests/db.*.test.ts are: the SHIPPED functions run against a fake
 *  Neon client and the assertions are over the SQL and parameters actually emitted.
 *  Rebuilding the query inside the test would only prove the test agrees with itself
 *  — which is what let R-54 ship a query that returned Rp 0 for every group.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => import('./support/probeDb'))

import { NotFoundError } from '@/lib/db/queries'
import {
  deleteOwnedPhoto,
  listOwnedGroupPathnames,
  pathnamesInUse,
  upsertPhotoForUser,
} from '@/lib/db/photos'

import { calls, normalise, queueRows, reset } from './support/probeDb'

beforeEach(reset)
afterEach(reset)

const GROUP = 'grp000000001'
const USER = 'usr000000001'
const PATHNAME = 'photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg'
const URL_ = `https://x.public.blob.vercel-storage.com/${PATHNAME}`

const base = {
  userId: USER,
  groupId: GROUP,
  blobUrl: URL_,
  blobPathname: PATHNAME,
  width: 1200,
  height: 1600,
  sizeBytes: 241_000,
}

describe('upsertPhotoForUser — ownership comes first', () => {
  it('proves group ownership BEFORE any write, and stops there when it fails', async () => {
    queueRows([]) // assertGroupOwned finds no owned group

    await expect(upsertPhotoForUser(base)).rejects.toThrow(NotFoundError)

    // Exactly one statement ran: the ownership probe. No SELECT of existing photos, and
    // above all no INSERT.
    expect(calls).toHaveLength(1)
    expect(normalise(calls[0]!.sql)).toContain('from "expense_groups"')
    expect(calls.some((c) => /insert into/i.test(c.sql))).toBe(false)
  })

  it('scopes the ownership probe by BOTH id and user_id', async () => {
    queueRows([]) // not owned
    await expect(upsertPhotoForUser(base)).rejects.toThrow(NotFoundError)

    const flat = normalise(calls[0]!.sql)
    expect(flat).toContain('"expense_groups"."id" = $')
    expect(flat).toContain('"expense_groups"."user_id" = $')
    // The trailing 1 is .limit(1), parameterised. Worth pinning: R-54 recorded that a
    // limit inside a SELECT-LIST subquery binds FIRST, and it is easy to assume that
    // holds everywhere. In a plain statement it binds last, after the WHERE.
    expect(calls[0]!.params).toEqual([GROUP, USER, 1])
  })
})

describe('upsertPhotoForUser — insert path', () => {
  it('inserts once, appending at MAX(sort_order)+1', async () => {
    queueRows([[1]]) // assertGroupOwned: owned
    queueRows([]) // no existing row for this pathname
    queueRows([[7]]) // coalesce(max(sort_order), -1) + 1
    queueRows([]) // insert

    const { id, created } = await upsertPhotoForUser(base)

    expect(created).toBe(true)
    expect(id).toMatch(/^[0-9A-Za-z_-]{12}$/) // newPhotoId() — nanoid(12), lib/id.ts

    // MAX+1, never COUNT: a deleted photo leaves a gap, and COUNT would reuse a taken slot.
    const sortSql = normalise(calls[2]!.sql)
    expect(sortSql).toMatch(/coalesce\(max\("sort_order"\), -1\) \+ 1/)
    expect(sortSql).not.toMatch(/count\(/i)

    const insert = calls[3]!
    expect(insert.sql).toMatch(/insert into "expense_photos"/i)
    expect(insert.params).toEqual([id, GROUP, URL_, PATHNAME, 1200, 1600, 241_000, 7])
  })

  it('defaults sort_order to 0 for the first photo in an empty group', async () => {
    queueRows([[1]])
    queueRows([])
    queueRows([[0]]) // coalesce(max(...), -1) + 1 with no rows => 0
    queueRows([])

    await upsertPhotoForUser(base)
    expect(calls[3]!.params.at(-1)).toBe(0)
  })

  it('persists NULL dimensions when the caller has none (the webhook path)', async () => {
    queueRows([[1]])
    queueRows([])
    queueRows([[0]])
    queueRows([])

    await upsertPhotoForUser({
      userId: USER,
      groupId: GROUP,
      blobUrl: URL_,
      blobPathname: PATHNAME,
      width: null,
      height: null,
      sizeBytes: null,
    })

    // §4.2 declares the three nullable precisely so onUploadCompleted, which never sees
    // the image, can still write a row.
    expect(calls[3]!.params.slice(4, 7)).toEqual([null, null, null])
  })
})

describe('upsertPhotoForUser — idempotence (CD-3 / R-20)', () => {
  it('returns the existing id and does NOT insert a second row', async () => {
    queueRows([[1]]) // owned
    queueRows([['pht000000001', 1200, 1600, 241_000]]) // already there, fully populated

    const result = await upsertPhotoForUser(base)

    expect(result).toEqual({ id: 'pht000000001', created: false })
    expect(calls.some((c) => /insert into/i.test(c.sql))).toBe(false)
    expect(calls.some((c) => /update "expense_photos"/i.test(c.sql))).toBe(false)
  })

  it('matches an existing row on (group_id, blob_pathname), not on url', async () => {
    queueRows([[1]])
    queueRows([['pht000000001', 1200, 1600, 241_000]])

    await upsertPhotoForUser(base)

    const lookup = calls[1]!
    expect(normalise(lookup.sql)).toContain('"group_id" = $')
    expect(normalise(lookup.sql)).toContain('"blob_pathname" = $')
    expect(lookup.params).toEqual([GROUP, PATHNAME, 1]) // trailing 1 = .limit(1)
  })

  it('backfills only the columns that are NULL, and only when it has a value', async () => {
    queueRows([[1]])
    queueRows([['pht000000001', null, null, null]]) // webhook wrote it first
    queueRows([]) // the update

    const result = await upsertPhotoForUser(base)

    expect(result).toEqual({ id: 'pht000000001', created: false })
    const update = calls[2]!
    expect(update.sql).toMatch(/update "expense_photos" set/i)
    expect(update.params).toEqual([1200, 1600, 241_000, 'pht000000001'])
  })

  it('leaves a populated column alone rather than overwriting it', async () => {
    queueRows([[1]])
    queueRows([['pht000000001', 1200, 1600, null]]) // only size is missing
    queueRows([])

    await upsertPhotoForUser(base)

    expect(calls[2]!.params).toEqual([241_000, 'pht000000001'])
  })

  it('issues no UPDATE when the existing row has nothing to backfill', async () => {
    queueRows([[1]])
    queueRows([['pht000000001', null, null, null]])

    await upsertPhotoForUser({
      userId: USER,
      groupId: GROUP,
      blobUrl: URL_,
      blobPathname: PATHNAME,
    })

    expect(calls).toHaveLength(2)
  })
})

describe('deleteOwnedPhoto', () => {
  it('deletes and returns in ONE statement carrying the ownership EXISTS', async () => {
    queueRows([['pht000000001', GROUP, PATHNAME]])

    const row = await deleteOwnedPhoto(USER, 'pht000000001')

    expect(row).toEqual({ id: 'pht000000001', groupId: GROUP, blobPathname: PATHNAME })
    expect(calls).toHaveLength(1)

    const flat = normalise(calls[0]!.sql)
    expect(flat).toMatch(/^delete from "expense_photos"/i)
    // The security property: ownership is INSIDE the delete, so there is no window
    // between check and mutation.
    expect(flat).toMatch(/exists/i)
    expect(flat).toContain('"expense_groups"."user_id" = $')
    expect(flat).toContain('"expense_groups"."id" = "expense_photos"."group_id"')
    // RETURNING is what saves the second round trip for the pathname we must del().
    expect(flat).toMatch(/returning/i)
    expect(calls[0]!.params).toEqual(['pht000000001', USER])
  })

  it('returns null for someone elses photo — same answer as "does not exist"', async () => {
    queueRows([]) // the EXISTS matched nothing
    expect(await deleteOwnedPhoto(USER, 'pht000000002')).toBeNull()
  })

  it('is never scoped by id alone', async () => {
    queueRows([])
    await deleteOwnedPhoto(USER, 'pht000000002')
    expect(calls[0]!.params).toContain(USER)
  })
})

describe('listOwnedGroupPathnames — the CD-4 / R-18 input', () => {
  it('filters by group AND by owner, and returns bare pathnames', async () => {
    queueRows([['photos/a-aaaaaaaaaaaaaaaaaaaa.jpg'], ['photos/b-bbbbbbbbbbbbbbbbbbbb.jpg']])

    const out = await listOwnedGroupPathnames(USER, GROUP)

    expect(out).toEqual(['photos/a-aaaaaaaaaaaaaaaaaaaa.jpg', 'photos/b-bbbbbbbbbbbbbbbbbbbb.jpg'])
    const flat = normalise(calls[0]!.sql)
    expect(flat).toMatch(/exists/i)
    expect(flat).toContain('"expense_groups"."user_id" = $')
    // No .limit() here, so no trailing 1: this read wants every photo in the group.
    expect(calls[0]!.params).toEqual([GROUP, USER])
  })
})

describe('pathnamesInUse — the discardStagedPhotos guard', () => {
  it('short-circuits without a round trip on an empty list', async () => {
    expect(await pathnamesInUse([])).toEqual(new Set())
    expect(calls).toHaveLength(0)
  })

  it('asks about every pathname at once and returns the referenced subset', async () => {
    queueRows([['photos/b-bbbbbbbbbbbbbbbbbbbb.jpg']])

    const used = await pathnamesInUse([
      'photos/a-aaaaaaaaaaaaaaaaaaaa.jpg',
      'photos/b-bbbbbbbbbbbbbbbbbbbb.jpg',
    ])

    expect(used).toEqual(new Set(['photos/b-bbbbbbbbbbbbbbbbbbbb.jpg']))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual([
      'photos/a-aaaaaaaaaaaaaaaaaaaa.jpg',
      'photos/b-bbbbbbbbbbbbbbbbbbbb.jpg',
    ])
  })

  it('is deliberately NOT scoped by user — it asks "is this referenced by anyone"', async () => {
    // Scoping it would let one user delete the bytes of another user's in-flight draft,
    // because a blob with no row cannot be joined to an owner at all.
    queueRows([])
    await pathnamesInUse(['photos/a-aaaaaaaaaaaaaaaaaaaa.jpg'])
    expect(calls[0]!.params).not.toContain(USER)
    expect(normalise(calls[0]!.sql)).not.toContain('user_id')
  })
})
