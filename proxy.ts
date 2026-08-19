import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from './auth.config'

/**
 * `proxy.ts`, not `middleware.ts` — reconciliation R-1. Next 16 deprecated and renamed the
 * file convention; the exported function is `proxy`, and the `runtime` config option is not
 * available here at all (setting it throws). Proxy runs on the Node.js runtime.
 *
 * WHAT THIS IS: a UX redirect. Signed-out humans who type a protected URL land on the sign-in
 * page instead of a flash of empty chrome, and they land back where they were headed.
 *
 * WHAT THIS IS NOT: the security boundary — reconciliation R-5, quoting the Next 16 docs:
 * "Server Functions are not separate routes... a Proxy matcher that excludes a path will also
 * skip Proxy coverage on that path." Server Actions POST to the page they are used on, so the
 * matcher below governs them only incidentally, and a refactor that moves an action to a
 * different route silently removes that coverage. Authorization lives in `requireUserId()`
 * plus the `userId` filter inside every query. Full stop.
 */

// A second, adapter-free Auth.js instance. It exists only to decrypt and verify the session
// cookie; importing `@/auth` here instead would pull the Drizzle adapter, the schema module
// and the Neon client into a file that runs on every matched request.
const { auth: withAuth } = NextAuth(authConfig)

export const proxy = withAuth((req) => {
  if (req.auth?.user?.id) return // signed in — carry on

  const signInUrl = new URL('/', req.nextUrl.origin)
  const intended = req.nextUrl.pathname + req.nextUrl.search
  if (intended && intended !== '/') signInUrl.searchParams.set('next', intended)
  return NextResponse.redirect(signInUrl)
})

/**
 * POSITIVE matcher. We enumerate what is protected rather than using a negative lookahead,
 * which makes the exclusions structural rather than incidental:
 *
 *   NOT matched: /s/:token*    public share pages (roadmap D4, §4.6) — MUST stay open.
 *                              INVARIANT B: never add this path here.
 *   NOT matched: /api/auth/*   the sign-in flow itself; matching it would loop
 *   NOT matched: /api/health   the liveness probe must answer, not redirect
 *   NOT matched: /             the sign-in page
 *   NOT matched: /_next/*, icons, manifest — free, no exclusion needed
 *
 * Adding a protected route means adding a line here. Adding a public route means doing
 * nothing, which is the safer default in this app because every page also enforces auth
 * itself via `requireUserId()`.
 *
 * Matcher values are statically analysed at build time: no variables, no imported constants,
 * no template literals.
 */
export const config = {
  // `/m/:path*` also matches bare `/m`. That is fine and deliberate — whatever F07 decides
  // `/m` does, it should be behind auth either way.
  matcher: ['/new', '/m/:path*', '/e/:path*', '/stats'],
}
