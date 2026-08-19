import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `requireUserId()` is the application's actual authorization boundary (reconciliation R-5:
 * the proxy matcher is not one, because Server Actions POST to the page they live on). What
 * matters about it is entirely behavioural and easy to regress in a refactor:
 *
 *   - it returns a bare `string`, so no call site is tempted into a narrowing branch that
 *     "handles" the signed-out case by carrying on unscoped;
 *   - it interrupts by throwing, so nothing after it runs;
 *   - the Route Handler flavour throws a catchable error instead of a redirect, because a 307
 *     to an HTML page is a terrible answer to `fetch()`.
 *
 * `@/auth` is mocked because importing it would pull in `lib/env.ts`, whose `import
 * 'server-only'` throws outside a React Server Components graph — and Vitest is not one.
 */
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: authMock }))

const { UnauthorizedError, getUserId, requireUserId, requireUserIdApi, unauthorizedJson } =
  await import('@/lib/auth/requireUserId')

const SIGNED_IN = { user: { id: 'usr_abc123', name: 'Miftah', email: 'm@example.com' } }

beforeEach(() => {
  authMock.mockReset()
})

describe('getUserId', () => {
  it('returns the id from the session', async () => {
    authMock.mockResolvedValue(SIGNED_IN)
    await expect(getUserId()).resolves.toBe('usr_abc123')
  })

  it('returns null when there is no session at all', async () => {
    authMock.mockResolvedValue(null)
    await expect(getUserId()).resolves.toBeNull()
  })

  it('returns null when a session exists but carries no id', async () => {
    // The shape you get if the `session` callback in auth.config.ts is ever dropped. It must
    // read as signed out, not as a user whose id happens to be undefined.
    authMock.mockResolvedValue({ user: { name: 'Miftah' } })
    await expect(getUserId()).resolves.toBeNull()
  })
})

describe('requireUserId', () => {
  it('returns the id when signed in', async () => {
    authMock.mockResolvedValue(SIGNED_IN)
    await expect(requireUserId()).resolves.toBe('usr_abc123')
  })

  it('interrupts with a redirect to / when signed out', async () => {
    authMock.mockResolvedValue(null)
    // next/navigation's redirect() signals by throwing NEXT_REDIRECT. Asserting that it throws
    // — rather than resolving to null — is the whole safety property: an action that forgets
    // to check the return value still cannot proceed.
    await expect(requireUserId()).rejects.toThrow(/NEXT_REDIRECT/)
  })
})

describe('requireUserIdApi', () => {
  it('returns the id when signed in', async () => {
    authMock.mockResolvedValue(SIGNED_IN)
    await expect(requireUserIdApi()).resolves.toBe('usr_abc123')
  })

  it('throws UnauthorizedError, never a redirect, when signed out', async () => {
    authMock.mockResolvedValue(null)
    await expect(requireUserIdApi()).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(requireUserIdApi()).rejects.toMatchObject({ status: 401 })
  })
})

describe('unauthorizedJson', () => {
  it('is the one 401 body both API routes answer with', async () => {
    const res = unauthorizedJson()
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
