/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F06 Task 12 — POST /api/photos/upload.
 *
 *  This route mints signed tokens that let a browser write into our blob store.
 *  proxy.ts does not cover it (R-5, and its matcher lists only page routes), so the
 *  check inside onBeforeGenerateToken is the ONLY thing between the open internet
 *  and a writable store. What is tested here is therefore mostly refusal, and in
 *  every case refusal BEFORE a token exists.
 *
 *  `@vercel/blob/client` is mocked so that handleUpload hands the callbacks back to
 *  the test instead of talking to Vercel. That is deliberate: the interesting logic
 *  is entirely inside the two callbacks this route supplies — auth, pathname shape,
 *  clientPayload validation, ownership, and the constraints baked into the token.
 *
 *  `@/auth` is mocked rather than requireUserId, so F02's real boundary code runs.
 *  `@/lib/db` is the probe client, so F03's real assertGroupOwned runs.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// blobEnv() is called on the first line of the handler; without this it throws before
// any of the logic under test runs.
process.env.BLOB_READ_WRITE_TOKEN ??= 'vercel_blob_rw_unit_test_not_a_real_token'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: authMock }))

vi.mock('@/lib/db', () => import('../../../../../tests/support/probeDb'))

type TokenOptions = {
  allowedContentTypes?: string[]
  maximumSizeInBytes?: number
  addRandomSuffix?: boolean
  allowOverwrite?: boolean
  cacheControlMaxAge?: number
  validUntil?: number
  tokenPayload?: string | null
}
type HandleUploadArgs = {
  onBeforeGenerateToken: (
    pathname: string,
    clientPayload: string | null,
    multipart: boolean,
  ) => Promise<TokenOptions>
  onUploadCompleted?: (body: {
    blob: { url: string; pathname: string }
    tokenPayload?: string | null
  }) => Promise<void>
}

const handleUpload = vi.hoisted(() => vi.fn())
vi.mock('@vercel/blob/client', () => ({ handleUpload }))

const { POST } = await import('../route')
const { calls, queueRows, reset } = await import('../../../../../tests/support/probeDb')

const VALID_PATHNAME = 'photos/Uk-igSGzS6rpPd1sRM9iz.jpg'
const GROUP = 'grp000000001'
const USER = 'usr000000001'

/** Drives the route as if the SDK were asking for a client token. */
function mintToken(pathname = VALID_PATHNAME, clientPayload: string | null = '{}') {
  let captured: TokenOptions | undefined
  handleUpload.mockImplementation(async (args: HandleUploadArgs) => {
    captured = await args.onBeforeGenerateToken(pathname, clientPayload, false)
    return { type: 'blob.generate-client-token', clientToken: 'fake-client-token' }
  })
  return {
    run: () => POST(req({ type: 'blob.generate-client-token' })),
    options: () => captured,
  }
}

/** Drives the route as if Vercel were reporting a finished upload. */
function completeUpload(tokenPayload: string | null, pathname = 'photos/x-y.jpg') {
  handleUpload.mockImplementation(async (args: HandleUploadArgs) => {
    await args.onUploadCompleted?.({
      blob: { url: `https://s.public.blob.vercel-storage.com/${pathname}`, pathname },
      tokenPayload,
    })
    return { type: 'blob.upload-completed', response: 'ok' }
  })
  return POST(req({ type: 'blob.upload-completed' }))
}

const req = (body: unknown) =>
  new Request('http://localhost/api/photos/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  authMock.mockResolvedValue({ user: { id: USER } })
})

describe('auth', () => {
  it('refuses an unauthenticated caller, and mints nothing', async () => {
    authMock.mockResolvedValue(null)
    const t = mintToken()

    const res = await t.run()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
    expect(t.options()).toBeUndefined()
  })

  it('refuses a session with no user id — the JWT-callback failure mode F02 warns about', async () => {
    // If the jwt/session callbacks stop copying `user.id` through, this is what arrives.
    // It must be a refusal, not an upload attributed to `undefined`.
    authMock.mockResolvedValue({ user: { name: 'Someone' } })
    const res = await mintToken().run()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
  })

  it('checks auth before touching the database', async () => {
    authMock.mockResolvedValue(null)
    await mintToken(VALID_PATHNAME, JSON.stringify({ groupId: GROUP })).run()
    expect(calls).toHaveLength(0)
  })
})

describe('pathname validation', () => {
  it.each([
    ['path traversal', 'photos/../../etc/passwd.jpg'],
    ['a foreign prefix', 'avatars/Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['no prefix at all', 'Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['a nested directory', 'photos/a/Uk-igSGzS6rpPd1sRM9iz.jpg'],
    ['a non-jpg extension', 'photos/Uk-igSGzS6rpPd1sRM9iz.svg'],
    ['a double extension', 'photos/Uk-igSGzS6rpPd1sRM9iz.jpg.html'],
    ['a short id', 'photos/abc.jpg'],
  ])('refuses %s', async (_label, pathname) => {
    const t = mintToken(pathname)
    const res = await t.run()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid pathname' })
    expect(t.options()).toBeUndefined()
  })

  it('accepts the pathname newPhotoPathname() produces', async () => {
    const { newPhotoPathname } = await import('@/lib/photos/pathname')
    const t = mintToken(newPhotoPathname())
    expect((await t.run()).status).toBe(200)
    expect(t.options()).toBeDefined()
  })
})

describe('clientPayload', () => {
  it('accepts an absent groupId (a /new draft) without touching the database', async () => {
    const t = mintToken(VALID_PATHNAME, '{}')

    expect((await t.run()).status).toBe(200)
    expect(calls).toHaveLength(0)
    expect(JSON.parse(t.options()!.tokenPayload!)).toEqual({ userId: USER, groupId: null })
  })

  it('tolerates a null clientPayload', async () => {
    const t = mintToken(VALID_PATHNAME, null)
    expect((await t.run()).status).toBe(200)
  })

  it('refuses a malformed groupId rather than passing it to a query', async () => {
    const t = mintToken(VALID_PATHNAME, JSON.stringify({ groupId: 'not-a-valid-id!!' }))
    expect((await t.run()).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('refuses a groupId of the wrong type', async () => {
    const t = mintToken(VALID_PATHNAME, JSON.stringify({ groupId: 12 }))
    expect((await t.run()).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('refuses unparseable JSON', async () => {
    const t = mintToken(VALID_PATHNAME, 'not json at all')
    expect((await t.run()).status).toBe(400)
  })
})

describe('ownership of an existing group', () => {
  it('proves ownership before minting, scoped by user_id', async () => {
    queueRows([[1]]) // assertGroupOwned: owned
    const t = mintToken(VALID_PATHNAME, JSON.stringify({ groupId: GROUP }))

    expect((await t.run()).status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual([GROUP, USER, 1])
    expect(JSON.parse(t.options()!.tokenPayload!)).toEqual({ userId: USER, groupId: GROUP })
  })

  it('refuses a group the caller does not own, and mints nothing', async () => {
    queueRows([]) // not owned (or does not exist — same answer)
    const t = mintToken(VALID_PATHNAME, JSON.stringify({ groupId: GROUP }))

    const res = await t.run()

    expect(res.status).toBe(400)
    expect(t.options()).toBeUndefined()
  })

  it('does not echo the group id back in the error', async () => {
    // Otherwise the endpoint answers "which ids exist" for anyone with a session.
    queueRows([])
    const res = await mintToken(VALID_PATHNAME, JSON.stringify({ groupId: GROUP })).run()
    expect(JSON.stringify(await res.json())).not.toContain(GROUP)
  })
})

describe('the constraints baked into the token', () => {
  it('allows image/jpeg only, caps the size, and randomises the pathname', async () => {
    const { ALLOWED_UPLOAD_CONTENT_TYPES, BLOB_CACHE_MAX_AGE, MAX_UPLOAD_BYTES } =
      await import('@/lib/photos/constants')
    const t = mintToken()
    await t.run()
    const o = t.options()!

    // image/jpeg only: compressForUpload transcodes everything, so anything else is
    // either a bypass attempt or a bug.
    expect(o.allowedContentTypes).toEqual([...ALLOWED_UPLOAD_CONTENT_TYPES])
    expect(o.maximumSizeInBytes).toBe(MAX_UPLOAD_BYTES)
    expect(o.addRandomSuffix).toBe(true)
    // With addRandomSuffix a collision is already impossible; allowOverwrite:false means
    // even a replayed token cannot clobber an existing blob.
    expect(o.allowOverwrite).toBe(false)
    expect(o.cacheControlMaxAge).toBe(BLOB_CACHE_MAX_AGE)
  })

  it('expires the token in ~10 minutes, not the SDK default hour', async () => {
    const { UPLOAD_TOKEN_TTL_MS } = await import('@/lib/photos/constants')
    const before = Date.now()
    const t = mintToken()
    await t.run()

    const validUntil = t.options()!.validUntil!
    expect(validUntil).toBeGreaterThanOrEqual(before + UPLOAD_TOKEN_TTL_MS)
    expect(validUntil).toBeLessThanOrEqual(Date.now() + UPLOAD_TOKEN_TTL_MS)
  })

  it('never puts a userId or groupId in the pathname the client asked for (D-F)', async () => {
    const t = mintToken()
    await t.run()
    // The token carries identity; the public, pasteable pathname does not.
    expect(VALID_PATHNAME).not.toContain(USER)
    expect(t.options()!.tokenPayload).toContain(USER)
  })
})

describe('onUploadCompleted — the production-only safety net (D-B)', () => {
  it('attaches the blob to the group named in the signed token', async () => {
    queueRows([[1]]) // assertGroupOwned
    queueRows([]) // no existing row
    queueRows([[0]]) // next sort_order
    queueRows([]) // insert

    const res = await completeUpload(JSON.stringify({ userId: USER, groupId: GROUP }))

    expect(res.status).toBe(200)
    expect(calls.some((c) => /insert into "expense_photos"/i.test(c.sql))).toBe(true)
  })

  it('writes NULL dimensions, because the webhook never sees the image', async () => {
    queueRows([[1]])
    queueRows([])
    queueRows([[0]])
    queueRows([])

    await completeUpload(JSON.stringify({ userId: USER, groupId: GROUP }))

    const insert = calls.find((c) => /insert into "expense_photos"/i.test(c.sql))!
    expect(insert.params.slice(4, 7)).toEqual([null, null, null])
  })

  it('does nothing for a staged upload with no group yet', async () => {
    const res = await completeUpload(JSON.stringify({ userId: USER, groupId: null }))
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('ignores a malformed tokenPayload without asking Vercel to retry', async () => {
    // A bad payload will be just as bad on the fifth attempt, so this must NOT 400.
    const res = await completeUpload(JSON.stringify({ nonsense: true }))
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('does not trust the webhook: ownership is re-proved before the write', async () => {
    // The token is signed, but a signed token for a group that has since been deleted or
    // transferred must not produce a row.
    queueRows([]) // assertGroupOwned finds nothing
    const res = await completeUpload(JSON.stringify({ userId: USER, groupId: GROUP }))

    // Non-200 on purpose: this is the retry signal for what is usually a transient blip,
    // and upsertPhotoForUser is idempotent so a retry is harmless.
    expect(res.status).toBe(400)
    expect(calls.some((c) => /insert into/i.test(c.sql))).toBe(false)
  })
})

describe('the request envelope', () => {
  it('400s on a body that is not JSON, without reaching the SDK', async () => {
    const res = await POST(
      new Request('http://localhost/api/photos/upload', { method: 'POST', body: 'not json' }),
    )
    expect(res.status).toBe(400)
    expect(handleUpload).not.toHaveBeenCalled()
  })
})
