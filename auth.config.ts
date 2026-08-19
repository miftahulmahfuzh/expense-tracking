import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * The adapter-free half of the Auth.js configuration: providers, callbacks, pages, session.
 *
 * WHY THE SPLIT (reconciliation R-1 rewrote F02's original rationale, and the rewrite is the
 * point of this comment). The plan justified splitting the config with an Edge-runtime
 * constraint: `proxy.ts` — `middleware.ts` before Next 16 renamed it — used to run on Edge,
 * where dragging in `@auth/drizzle-adapter` and `@neondatabase/serverless` was at best slow
 * and at worst impossible. **That constraint no longer exists.** Next 16 proxy defaults to
 * the Node.js runtime, and the `runtime` config option throws if you set it at all.
 *
 * The split survives for a smaller reason that is still a real one: `proxy.ts` runs on every
 * matched request, and there is no sense loading the Drizzle adapter, the whole schema module
 * and a database client into it just to decrypt a cookie. It is now a bundle-size and
 * cold-start choice, not a correctness one — so if a future change makes the split
 * inconvenient, weigh it as such rather than assuming something breaks.
 *
 * STILL A HARD RULE, for a different reason: nothing here may import `lib/env.ts`. That module
 * opens with `import 'server-only'`, which throws outside a React Server Component graph, and
 * `proxy.ts` is not one. `auth.ts` performs the loud env validation instead.
 */
export const authConfig = {
  providers: [
    Google({
      // Auth.js v5 would infer these from AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET. Passing them
      // explicitly makes a missing value fail somewhere greppable instead of surfacing as an
      // opaque OAuth error three redirects later.
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // `select_account` shows the account chooser without re-prompting for consent every
          // time. We deliberately do NOT take Auth.js's default `access_type=offline` +
          // `prompt=consent`: that mints a Google refresh token we would store in
          // `accounts.refresh_token` and never use, because we call zero Google APIs after
          // sign-in. Not storing a credential we do not need is strictly better, and it
          // sidesteps the 7-day refresh-token expiry that applies while the OAuth app is in
          // "Testing" publishing status.
          prompt: 'select_account',
          access_type: 'online',
          response_type: 'code',
        },
      },
      // One provider, so there is no legitimate cross-provider linking scenario. Never turn
      // this on: it lets whoever controls an email address at another provider take over an
      // existing account.
      allowDangerousEmailAccountLinking: false,
    }),
  ],

  /**
   * JWT, not database sessions — docs/plans/F02-auth.md §2.
   *
   * `requireUserId()` runs at the top of every Server Action and every protected page render
   * (roadmap §4.4). With `strategy: 'database'` that is one mandatory Neon round trip on the
   * hot path of literally every interaction, bought in exchange for instant server-side
   * revocation, which this app has no product requirement for — there is no admin panel and no
   * session list. A stateless cookie makes the check a decrypt.
   *
   * Known consequence: signing out clears a cookie, it does not invalidate anything
   * server-side. A stolen cookie is valid until `maxAge` elapses. Break-glass is to rotate
   * `AUTH_SECRET`, which signs everyone out at once.
   */
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // rewrite the cookie at most once a day
  },

  // `/` is our sign-in page (roadmap §4.6). Without this Auth.js bounces unauthenticated
  // users to its own generic /api/auth/signin page, which is not a screen this app designed.
  pages: {
    signIn: '/',
    error: '/',
    signOut: '/',
  },

  callbacks: {
    /**
     * Runs on sign-in (with `user`) and on every later token read (without it). Because the
     * adapter is installed in `auth.ts`, `user` here is the ADAPTER user, so `user.id` is the
     * real `user.id` primary key that `expense_groups.user_id` references.
     *
     * Auth.js already sets `token.sub` by default; writing it explicitly makes the contract
     * legible and immune to an upstream default changing under a beta dependency.
     */
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      return token
    },

    /**
     * Runs on every `auth()` call. With `strategy: 'jwt'` there is no adapter lookup here, so
     * if we do not copy the id across, `session.user.id` is undefined and every feature that
     * scopes by userId silently breaks.
     */
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },

  /**
   * Roadmap D3: any Google account may sign in. No allowlist, no `signIn` callback gate.
   * Safety comes from per-userId scoping — docs/plans/F02-auth.md §1 INVARIANT A.
   */

  /**
   * Permission to trust `X-Forwarded-Host` / `X-Forwarded-Proto` when deriving the origin.
   * Auth.js enables this automatically when it detects `VERCEL`; stating it removes a class of
   * "works on Vercel, 500s anywhere else" bug. It is only safe because Vercel terminates TLS
   * and rewrites those headers itself, and because Google will still only redirect to a URI we
   * pre-registered. Do not copy this into an app served from a proxy you do not control.
   */
  trustHost: true,
} satisfies NextAuthConfig
