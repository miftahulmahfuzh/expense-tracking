/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F05 — createExpense, the one write /new makes.
 *
 *  Five properties are worth pinning, because each of them is a silent failure if
 *  it regresses:
 *
 *   1. requireUserId() runs FIRST — before validation, before any statement. R-5
 *      makes this the security boundary, not proxy.ts.
 *   2. user_id comes from the SESSION. A userId in the payload must not reach the
 *      insert; that would be the whole ownership model, bypassed by one field.
 *   3. ONE batch. Group + items + photos in a single transaction (R-4): a partial
 *      commit is an expense whose total is wrong, or a gallery missing the photo
 *      the user watched upload.
 *   4. sort_order follows the reviewed order, for items and photos both.
 *   5. The caps are the tightened ones — 10 photos, not F03a's 20 — and a
 *      pathname that is not the shape Vercel stores is refused.
 *
 *  `@/auth` is mocked so F02's real requireUserId runs; `@/lib/db` is the probe
 *  client so the real emitted SQL is observable; only revalidatePath is stubbed.
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

const { createExpense } = await import('../expenses')
const { calls, normalise, reset } = await import('../../../tests/support/probeDb')

const USER = 'usr000000001'
const PATHNAME = 'photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg'
const OTHER_PATHNAME = 'photos/Ak-igSGzS6rpPd1sRM9iz-bLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg'
const blobUrl = (p: string) => `https://s.public.blob.vercel-storage.com/${p}`

/** The roadmap §1 canonical paste, after review. */
const canonical = {
  title: 'bakar duit tuesday',
  occurred_on: '2026-08-18',
  items: [
    { name: 'roti buaya', amount_idr: 38_500, category: 'food' },
    { name: 'ayam sambal hitam', amount_idr: 45_000, category: 'food' },
    { name: 'perumahan laddaland', amount_idr: 49_000, category: 'entertainment' },
  ],
}

const photo = (p: string) => ({
  blobUrl: blobUrl(p),
  blobPathname: p,
  width: 1200,
  height: 1600,
  sizeBytes: 241_000,
})

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  authMock.mockResolvedValue({ user: { id: USER } })
})

describe('createExpense', () => {
  it('inserts group + items in one batch and returns the group id', async () => {
    const { id } = await createExpense(canonical)

    expect(id).toMatch(/^[0-9A-Za-z_-]{12}$/)
    expect(calls).toHaveLength(2)
    expect(normalise(calls[0]!.sql)).toMatch(/^insert into "expense_groups"/)
    expect(normalise(calls[1]!.sql)).toMatch(/^insert into "expense_items"/)
  })

  it('takes user_id from the session and ignores one in the payload', async () => {
    await createExpense({ ...canonical, userId: 'usr_attacker', user_id: 'usr_attacker' })

    expect(calls[0]!.params).toContain(USER)
    expect(calls[0]!.params).not.toContain('usr_attacker')
  })

  it('redirects before touching the database when there is no session', async () => {
    authMock.mockResolvedValue(null)

    await expect(createExpense(canonical)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(calls).toHaveLength(0)
  })

  it('validates before writing, and writes nothing when validation fails', async () => {
    await expect(createExpense({ ...canonical, items: [] })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('numbers item sort_order in the reviewed order', async () => {
    await createExpense(canonical)

    // Three rows, each carrying its index. Params run id, group, name, amount, category,
    // sort_order per row, so the three sort orders are the values 0, 1, 2 in sequence.
    const params = calls[1]!.params
    expect(params.filter((p) => p === 0 || p === 1 || p === 2)).toEqual([0, 1, 2])
    expect(params).toContain('roti buaya')
    expect(params).toContain(38_500)
  })

  it('inserts photo rows in the same batch', async () => {
    await createExpense({ ...canonical, photos: [photo(PATHNAME), photo(OTHER_PATHNAME)] })

    expect(calls).toHaveLength(3)
    expect(normalise(calls[2]!.sql)).toMatch(/^insert into "expense_photos"/)
    expect(calls[2]!.params).toContain(PATHNAME)
    expect(calls[2]!.params).toContain(OTHER_PATHNAME)
  })

  it('emits no photo statement when there are no photos', async () => {
    await createExpense({ ...canonical, photos: [] })
    expect(calls).toHaveLength(2)
  })

  it('dedupes a blob that appears twice, so two rows never point at one blob', async () => {
    await createExpense({ ...canonical, photos: [photo(PATHNAME), photo(PATHNAME)] })

    const pathnames = calls[2]!.params.filter((p) => p === PATHNAME)
    expect(pathnames).toHaveLength(1)
  })

  it('refuses a blobPathname that is not the shape Vercel stores', async () => {
    await expect(
      createExpense({
        ...canonical,
        photos: [{ ...photo(PATHNAME), blobPathname: '../../etc/passwd' }],
      }),
    ).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('caps photos at MAX_PHOTOS_PER_GROUP rather than F03a s 20', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) =>
      photo(`photos/Uk-igSGzS6rpPd1sRM9i${i}-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg`),
    )

    await expect(createExpense({ ...canonical, photos: eleven })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('revalidates the month the expense landed in, not the current month', async () => {
    await createExpense({ ...canonical, occurred_on: '2026-02-11' })
    expect(revalidatePath).toHaveBeenCalledWith('/m/2026-02')
  })

  it('stores note and rawText when present, null when absent', async () => {
    await createExpense({ ...canonical, note: 'pakai gopay', rawText: 'roti buaya 38500' })
    expect(calls[0]!.params).toContain('pakai gopay')
    expect(calls[0]!.params).toContain('roti buaya 38500')

    reset()
    await createExpense(canonical)
    expect(calls[0]!.params).toContain(null)
  })
})
