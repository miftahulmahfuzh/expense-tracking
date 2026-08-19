import { DrizzleAdapter } from '@auth/drizzle-adapter'
import NextAuth from 'next-auth'
import { db } from '@/lib/db'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'
import { authEnv } from '@/lib/env'
import { authConfig } from './auth.config'

/**
 * The Node-runtime Auth.js instance, and the only module anything should import when it needs
 * `auth()`, `signIn()`, `signOut()` or the route handlers.
 *
 * `proxy.ts` must NOT import this file — see auth.config.ts for why the split exists and what
 * it does and does not buy.
 *
 * ADAPTER + JWT, together on purpose. The adapter still writes `user` and `account` rows, so
 * `expense_groups.user_id -> user.id` is a real foreign key and deleting a user cascades their
 * expenses away for free (roadmap §4.2). No `session` rows are ever written, because the
 * session lives in the cookie. The `session` table stays defined and empty — do not drop it;
 * `@auth/drizzle-adapter` requires all four tables to satisfy its type.
 */

// Loud boot validation of AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_URL
// (roadmap §4.8: missing var = loud crash, never a silent undefined). lib/env.ts leaves these
// to a lazy `authEnv()` call precisely so that F02 could pick this spot: module scope of the
// one file the whole auth surface passes through. auth.config.ts cannot do it — it must stay
// free of `server-only`, which lib/env.ts imports.
authEnv()

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
})
