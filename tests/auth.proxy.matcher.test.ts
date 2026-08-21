import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, vi } from 'vitest'

/**
 * The proxy matcher is the one line in F02 that can silently break a security-adjacent
 * property by *widening*: add `/s/:path*` to it and every public share link starts redirecting
 * signed-out visitors to a sign-in page, which is the whole feature gone (roadmap D4,
 * docs/plans/F02-auth.md §1 INVARIANT B). Nothing else in the test suite would notice.
 *
 * `unstable_doesMiddlewareMatch` is Next's own matcher compiler, so this asserts against the
 * real path-to-regexp semantics rather than a reimplementation of them. The Next 16.3.1 docs
 * call it `unstable_doesProxyMatch`; the shipped build has not renamed it yet, so the old name
 * is what actually exists. It is experimental — if it disappears, replace the call, do not
 * delete the assertions.
 *
 * The dynamic imports below are load-bearing. `next/experimental/testing/server` pulls in
 * Next's AsyncLocalStorage shim, which throws at *import* time unless `globalThis
 * .AsyncLocalStorage` already exists — Next's own runtimes install it as a global, plain Node
 * does not. A static `import` would be hoisted above the assignment and the file would fail to
 * collect.
 */
;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage

/**
 * `proxy.ts` only needs to be importable here for its `config` export; the handler half is
 * exercised for real by the dev-server checks in docs/plans/F02-auth.md §8. Stubbing
 * `next-auth` keeps that import from resolving Auth.js's own `next/server` specifier, which
 * Vitest's Node resolution cannot follow the way the Next bundler can.
 */
vi.mock('next-auth', () => ({ default: () => ({ auth: (fn: unknown) => fn }) }))

const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server')
const { config } = await import('@/proxy')

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })

describe('proxy matcher', () => {
  it('protects every authed route in roadmap §4.6', () => {
    expect(matches('/new')).toBe(true)
    expect(matches('/stats')).toBe(true)
    expect(matches('/m/2026-08')).toBe(true)
    expect(matches('/e/abc123def456')).toBe(true)
  })

  it('protects bare /m, whatever F07 decides it does', () => {
    expect(matches('/m')).toBe(true)
  })

  it('LEAVES /s/[token] PUBLIC — INVARIANT B, do not weaken this', () => {
    expect(matches('/s/abc123def456')).toBe(false)
    expect(matches('/s')).toBe(false)
  })

  it('LEAVES /f/[token] PUBLIC — F12, same invariant, same force', () => {
    // Adding this path would redirect every recipient of a shared receipt to a sign-in page for
    // an account they do not have. Nothing else in the suite would notice: the owner's own
    // browser is signed in, so it would keep working for the one person who cannot see the bug.
    expect(matches('/f/abc123def456')).toBe(false)
    expect(matches('/f')).toBe(false)
  })

  it('leaves the sign-in page and the Auth.js flow alone', () => {
    // Matching `/` would bounce the sign-in page to itself; matching `/api/auth/*` would break
    // the callback that completes the sign-in.
    expect(matches('/')).toBe(false)
    expect(matches('/api/auth/signin/google')).toBe(false)
    expect(matches('/api/auth/callback/google')).toBe(false)
    expect(matches('/api/auth/session')).toBe(false)
  })

  it('leaves the unauthenticated liveness probe answering', () => {
    // app/api/health/route.ts says so in a comment. This is that comment, enforced.
    expect(matches('/api/health')).toBe(false)
  })

  it('does not match routes that merely start with a protected prefix', () => {
    // `/new` is exact, not a prefix: a future `/newsletter` must not inherit the guard by
    // accident, in either direction.
    expect(matches('/newsletter')).toBe(false)
    expect(matches('/statsy')).toBe(false)
  })
})
