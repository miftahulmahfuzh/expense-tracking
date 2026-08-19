# F02 — Auth & Session

**Depends on:** F01 (Next scaffold, `lib/env.ts`, Tailwind, Vercel project), F03 (Drizzle `db` client + Auth.js adapter tables in `lib/db/schema.ts`)
**Unblocks:** F05, F06, F07, F08, F09 — every one of them calls `requireUserId()`.
**Contract sections this plan is bound by:** §3 (pinned versions), §4.2 (Auth.js adapter tables), §4.4 (`requireUserId()` at the top of every action), §4.5 (`/api/auth/[...nextauth]`), §4.6 (page routes + which are protected), §4.8 (env var names).

---

## 0. What this feature is, in one paragraph

Google-only sign-in via Auth.js v5. The Drizzle adapter persists `users` / `accounts` rows so that `expense_groups.user_id` has a real foreign key to point at, but the **session itself is a stateless JWT cookie** so that `requireUserId()` — which runs at the top of every Server Action and every protected page render — costs zero database round trips. Middleware guards `/new`, `/m/*`, `/e/*`, `/stats` and deliberately leaves `/s/*` and `/api/auth/*` open. There is no allowlist: any Google account may sign in, and the app is safe because **every single query is filtered by `userId`**.

---

## 1. The security invariant (read this before writing any other feature)

> **INVARIANT A — Ownership scoping.**
> There is no allowlist. Anyone with a Google account can create an account in this app (roadmap D3). Therefore the *only* thing standing between user A and user B's data is that **every read and every write is filtered by `userId`**.
>
> 1. Every Server Action's first statement is `const userId = await requireUserId()`.
> 2. Every `SELECT` / `UPDATE` / `DELETE` that touches `expense_groups` carries `eq(expenseGroups.userId, userId)` in its `WHERE`.
> 3. Every query on a **child** table (`expense_items`, `expense_photos`, `share_links`) must **join back to `expense_groups` and filter on `user_id` there**. A child row's id is not a capability. `deleteItem(id)` must not be `DELETE FROM expense_items WHERE id = $1`; it must be `DELETE ... WHERE id = $1 AND group_id IN (SELECT id FROM expense_groups WHERE user_id = $2)`.
> 4. An action that finds zero rows after scoping must behave identically to an action on a non-existent id (`notFound()` / no-op). Never leak "this exists but isn't yours" through a distinct error.
> 5. Middleware is a **convenience redirect, not a security boundary.** It only runs on the paths in its matcher and can be bypassed by anything that doesn't traverse it (direct Server Action POSTs, for instance, are matched by the *page* path, not by an action path — do not rely on that). Authorization lives in `requireUserId()` + the `userId` filter, full stop.

> **INVARIANT B — the public exception.**
> `/s/[token]` (F09) is the *only* route that reads data without a `userId`. It is scoped by an unguessable `share_links.token` instead. It must never accept a `groupId` directly, and it must never be added to the middleware matcher.

F03 owns the query-level enforcement; F02 owns the identity that enforcement is keyed on. Both halves are required.

---

## 2. Session strategy decision: **JWT** (not database)

### The tradeoff

| | `strategy: 'database'` | `strategy: 'jwt'` ✅ chosen |
|---|---|---|
| Where the session lives | Row in `sessions`, cookie holds an opaque session token | Signed+encrypted (JWE) cookie, `sessions` table unused |
| Cost of `auth()` | One Neon round trip **per call** | Zero round trips — decrypt a cookie |
| Cost per protected page render | 1 query for the session + N queries for data | N queries for data |
| Cost inside a Server Action | +1 query on **every** action | 0 |
| Works in Edge middleware | ❌ needs the DB adapter in the Edge bundle | ✅ verification is pure crypto |
| Instant server-side revocation | ✅ delete the row | ❌ valid until the cookie expires |
| Session data freshness (e.g. renamed user) | Always fresh | Stale until the JWT rotates |

### Why JWT wins here

`requireUserId()` is called at the top of **every** Server Action (§4.4) and every protected page. With `strategy: 'database'` that is a mandatory extra Neon round trip on the hot path of literally every interaction — on a serverless free tier with cold connections, that is the single most expensive line of code in the app, and it buys us a revocation feature we have no product requirement for (no admin panel, no "sign out all devices", no session list — see §6 Out of scope).

We still keep the Drizzle adapter, because:
- `users.id` must exist as a real row for `expense_groups.user_id → users.id ON DELETE CASCADE` (§4.2) to be a valid FK;
- account linking / provider bookkeeping lives in `accounts`;
- deleting a user cascades their data for free.

**Consequence to accept knowingly:** the `sessions` table will stay empty. Do **not** drop it — `@auth/drizzle-adapter` requires all four tables to satisfy its type and it will still call `createSession`-adjacent code paths in some flows. Leave it defined in `lib/db/schema.ts` exactly as F03 declares it.

**Consequence to accept knowingly (2):** signing out clears a cookie; it does not invalidate anything server-side. If a session cookie is ever stolen it is valid until `maxAge` (30 days) elapses or `AUTH_SECRET` is rotated. Our break-glass procedure is therefore "rotate `AUTH_SECRET`", which signs everyone out at once. That is documented in §6.

### The callback that puts `userId` on the session

With `strategy: 'jwt'` there is **no adapter call on session read**, so `session.user.id` is *not* populated for you — you must carry the id through the token yourself. Two callbacks, in this order:

1. **`jwt({ token, user })`** — the `user` argument is only present on the *first* invocation, right after sign-in, and (because the adapter is installed) it is the **adapter user**, i.e. `user.id` is the real `users.id` primary key from Postgres. Persist it: `token.sub = user.id`. Auth.js already does this by default, but writing it explicitly makes the contract legible and immune to upstream default changes.
2. **`session({ session, token })`** — runs on every `auth()` call. Copy it back out: `session.user.id = token.sub`.

Plus a TypeScript module augmentation so `session.user.id` is typed `string` rather than `string | undefined`, which is what makes `requireUserId()` clean at every call site.

---

## 3. Runtime constraint: Node vs Edge, and the split-config pattern

Next.js middleware runs on the **Edge runtime** by default. `@auth/drizzle-adapter` pulls in `drizzle-orm` and `@neondatabase/serverless`; even where those *can* run on Edge, importing them into `middleware.ts` means the adapter, the whole schema module, and the DB client get bundled into a file that executes on **every matched request**. That is slow to boot, and it drags server-only code (and `lib/env.ts` server secrets) into the Edge bundle.

**The fix is the split-config pattern**, which is the officially documented Auth.js v5 approach:

```
auth.config.ts   ← edge-safe: providers, callbacks, pages, session strategy. NO adapter, NO db import.
      │
      ├── imported by  middleware.ts   →  NextAuth(authConfig)          (Edge, JWT verify only)
      │
      └── imported by  auth.ts         →  NextAuth({ ...authConfig, adapter: DrizzleAdapter(db) })  (Node)
```

This works **only because we chose JWT**: the middleware instance needs nothing but `AUTH_SECRET` to decrypt and verify the cookie. With `strategy: 'database'` the middleware would have to reach the DB and the split would not save you.

`Google` from `next-auth/providers/google` is a pure-config object — safe to import in the Edge config.

**Escape hatch (do not use unless forced):** Next.js ≥15.5 (so also `next@16.3.1`) supports `export const config = { runtime: 'nodejs' }` in `middleware.ts`. If you ever genuinely need the adapter in middleware, that is the lever. We do not need it, and the Edge path is faster — stay on Edge.

---

## 4. File inventory this feature creates

| Path | Purpose |
|---|---|
| `auth.config.ts` | Edge-safe Auth.js config (providers, callbacks, pages, session) |
| `auth.ts` | **Repo root.** `NextAuth()` with the Drizzle adapter. Exports `{ handlers, auth, signIn, signOut }` |
| `app/api/auth/[...nextauth]/route.ts` | Re-exports `handlers` as `GET` / `POST` |
| `middleware.ts` | **Repo root.** Route protection, Edge, positive matcher |
| `lib/auth/requireUserId.ts` | `requireUserId()`, `getUserId()`, `UnauthorizedError`, `unauthorizedJson()` |
| `lib/auth/actions.ts` | `signInWithGoogleAction`, `signOutAction` — Server Actions usable from client components |
| `types/next-auth.d.ts` | Module augmentation: `session.user.id: string` |
| `app/page.tsx` | `/` — signed out: Google button. Signed in: redirect to `/m/<YYYY-MM>` |
| `components/auth/SignOutButton.tsx` | Sign-out affordance, reusable by F07's header |
| `.env.local` (append) | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| `lib/env.ts` (edit, F01-owned) | Add the four `AUTH_*` entries to the Zod schema |

---

## 5. Tasks

### Task 0 — Preconditions check

Run these before touching anything. Every one must pass.

```bash
cd /home/miftah/expense-tracking

# F01 landed?
test -f package.json && test -f tsconfig.json && test -f app/layout.tsx && echo "F01 ok"

# @/* alias points at repo root (not src/)?
grep -n '"@/\*"' tsconfig.json

# F03 landed the db client and the four Auth.js adapter tables?
grep -nE 'export (const|\{).*\bdb\b' lib/db/index.ts
grep -nE 'export const (users|accounts|sessions|verificationTokens)' lib/db/schema.ts

# F01/F03 landed the date helpers the sign-in redirect needs?
grep -nE 'export (const|function) (TZ|todayJakartaISO|monthKey)' lib/format.ts

# pinned versions present?
node -p "const p=require('./package.json');[p.dependencies.next,p.dependencies.react].join(' ')"
```

**Expected:** `F01 ok`, an `"@/*": ["./*"]` mapping, four exported table symbols, three exported format helpers, `16.3.1 19.2.8`.

If `lib/format.ts` does not exist yet, do **not** invent your own timezone logic scattered around. Either wait for F03, or create `lib/format.ts` with only the three §4.7 date exports and let F03 fill in the money helpers. Note it in the commit message.

---

### Task 1 — Install the pinned auth dependencies

```bash
cd /home/miftah/expense-tracking
npm install next-auth@5.0.0-beta.32 @auth/drizzle-adapter@1.11.3 --save-exact
```

**Expected output:** `added 2 packages` (plus `@auth/core` as a transitive dep). Verify the exact pins landed:

```bash
node -p "const p=require('./package.json');JSON.stringify({na:p.dependencies['next-auth'],ad:p.dependencies['@auth/drizzle-adapter']},null,2)"
```

**Expected:**
```json
{
  "na": "5.0.0-beta.32",
  "ad": "1.11.3"
}
```

No caret, no tilde — the roadmap pins these. `next-auth@5` is a beta; a floating range will silently break you.

```bash
git add package.json package-lock.json
git commit -m "F02: pin next-auth@5.0.0-beta.32 and @auth/drizzle-adapter@1.11.3"
```

---

### Task 2 — Generate `AUTH_SECRET`

```bash
cd /home/miftah/expense-tracking
npx auth secret
```

`npx auth secret` is the Auth.js v5 CLI. It generates a cryptographically random 32-byte secret, base64-encodes it, and **appends `AUTH_SECRET=…` to `.env.local` for you**.

**Expected output:**
```
Secret generated. Copied to .env.local
```

If the CLI is unavailable or you would rather do it by hand:

```bash
openssl rand -base64 33
# → e.g. 7mQ0nO3s+K1p8bXe... (44 chars)
```

…then paste it into `.env.local` yourself as `AUTH_SECRET="…"`.

Verify (never print the value into a shared log):

```bash
grep -c '^AUTH_SECRET=' .env.local   # → 1
awk -F= '/^AUTH_SECRET=/{print length($2)}' .env.local   # → 44 or 46 (with quotes)
```

**Do not commit `.env.local`.** Confirm F01 gitignored it:

```bash
git check-ignore -v .env.local   # must print a .gitignore line
```

---

### Task 3 — Obtain the Google credentials

Do **[Getting AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET](#getting-auth_google_id--auth_google_secret--auth_secret)** now — it is a long manual walkthrough in the Google Cloud Console and everything downstream is blocked on it. Come back with a Client ID and Client secret in hand, appended to `.env.local`:

```
AUTH_GOOGLE_ID="1234567890-abcdefghijklmnop.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
```

Sanity check without leaking the secret:

```bash
grep -c '^AUTH_GOOGLE_ID=' .env.local && grep -c '^AUTH_GOOGLE_SECRET=' .env.local   # → 1 and 1
grep '^AUTH_GOOGLE_ID=' .env.local | grep -c 'apps.googleusercontent.com'            # → 1
```

---

### Task 4 — Extend `lib/env.ts` with the auth variables

F01 owns this file. Add the auth block to its Zod schema. The exact surrounding code depends on F01's shape; the entries to add are:

```ts
// inside the existing z.object({ … }) in lib/env.ts
  AUTH_SECRET:        z.string().min(32, 'AUTH_SECRET must be ≥32 chars — run `npx auth secret`'),
  AUTH_GOOGLE_ID:     z.string().min(1).endsWith('.apps.googleusercontent.com'),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  // Production only. Left undefined locally (Auth.js defaults to http://localhost:3000)
  // and on Vercel Preview (host is auto-detected — see §7).
  AUTH_URL:           z.string().url().optional(),
```

Two rules for this file, given §4.8's "missing var = loud crash, never a silent `undefined`":

- `lib/env.ts` must **not** be imported by `auth.config.ts` or `middleware.ts`. It is a Node-side boot guard; keep it out of the Edge bundle. The Edge side reads `process.env.AUTH_SECRET` implicitly through Auth.js itself.
- Import `lib/env.ts` somewhere in the Node boot path (F01 will have wired this, typically `app/layout.tsx` or `lib/db/index.ts`) so a missing var crashes at startup rather than at first sign-in.

```bash
npx tsc --noEmit && git add lib/env.ts && git commit -m "F02: validate AUTH_* env vars in lib/env.ts"
```

---

### Task 5 — TypeScript module augmentation

**File: `types/next-auth.d.ts`** (complete contents)

```ts
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  /**
   * F02 guarantees `session.user.id` is always a non-optional string:
   * the `jwt` callback writes the adapter user's primary key onto `token.sub`,
   * and the `session` callback copies it back onto `session.user.id`.
   * Every feature relies on this — see docs/plans/F02-auth.md §1 INVARIANT A.
   */
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** users.id — set once at sign-in, carried for the life of the cookie. */
    sub?: string
  }
}
```

Make sure `tsconfig.json` picks it up. F01's default `"include"` is usually `["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`, which already covers `types/`. If F01 used an explicit include list, add `"types/**/*.d.ts"`.

```bash
npx tsc --noEmit
git add types/next-auth.d.ts tsconfig.json && git commit -m "F02: augment Session with a non-optional user.id"
```

---

### Task 6 — `auth.config.ts` (the edge-safe half)

**File: `auth.config.ts`** (repo root, complete contents)

```ts
import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * Edge-safe Auth.js configuration.
 *
 * HARD RULE: nothing in this file — or in anything it imports — may touch the
 * database, the Drizzle adapter, `lib/env.ts`, or any Node-only builtin.
 * `middleware.ts` imports this and runs it on the Edge runtime for every
 * matched request. The adapter is bolted on in `auth.ts`, which is Node-only.
 * See docs/plans/F02-auth.md §3.
 */
export const authConfig = {
  providers: [
    Google({
      // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are inferred from env by Auth.js v5,
      // but we pass them explicitly so a typo fails loudly and greppably.
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // `select_account` shows the account chooser without re-prompting for
          // consent on every sign-in. We deliberately do NOT use Auth.js's
          // default `access_type=offline` + `prompt=consent`: that mints a Google
          // refresh token we would store in `accounts.refresh_token` and never
          // use (we call zero Google APIs after sign-in). Not storing a secret we
          // don't need is strictly better, and it sidesteps the 7-day refresh
          // token expiry that applies to apps in "Testing" publishing status.
          prompt: 'select_account',
          access_type: 'online',
          response_type: 'code',
        },
      },
      // Single provider, so there is no cross-provider linking scenario.
      // Never turn this on: it would let an attacker who controls an email
      // address at another provider take over an existing account.
      allowDangerousEmailAccountLinking: false,
    }),
  ],

  // See docs/plans/F02-auth.md §2 for the full JWT-vs-database tradeoff.
  // Short version: requireUserId() runs on every Server Action; a stateless
  // cookie makes that free, and it is what lets middleware run on the Edge.
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,   // rewrite the cookie at most once a day
  },

  // `/` is our sign-in page (§4.6). Without this, Auth.js would bounce
  // unauthenticated users to its own generic /api/auth/signin page.
  pages: {
    signIn: '/',
    error: '/',
    signOut: '/',
  },

  callbacks: {
    /**
     * Runs on sign-in (with `user`) and on every subsequent token read (without).
     * `user` here is the ADAPTER user, so `user.id` is the real `users.id` PK
     * that `expense_groups.user_id` references.
     */
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      return token
    },

    /**
     * Runs on every `auth()` call. With strategy:'jwt' there is no adapter
     * lookup here, so if we don't copy the id across, `session.user.id` is
     * undefined and every downstream feature breaks.
     */
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },

  /**
   * D3: any Google account may sign in. No allowlist, no `signIn` callback
   * gate. Safety comes from per-userId scoping — F02 §1 INVARIANT A.
   */

  // We are deployed behind Vercel's proxy on a single known apex domain, and
  // locally on localhost. Auth.js auto-enables this when it detects VERCEL,
  // but stating it removes a class of "works on Vercel, 500s elsewhere" bugs.
  // Tradeoff: this trusts the X-Forwarded-Host header, which is only safe
  // because Vercel terminates and rewrites it. Do not copy this into an app
  // served from a proxy you do not control.
  trustHost: true,
} satisfies NextAuthConfig
```

```bash
npx tsc --noEmit && git add auth.config.ts && git commit -m "F02: edge-safe auth.config.ts (Google provider, JWT strategy, id callbacks)"
```

---

### Task 7 — `auth.ts` (the Node half, with the adapter)

**File: `auth.ts`** (repo root, complete contents)

```ts
import NextAuth from 'next-auth'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

import { authConfig } from './auth.config'
import { db } from '@/lib/db'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'

/**
 * The Node-runtime Auth.js instance. This is the ONLY module that should be
 * imported when you need `auth()`, `signIn()`, `signOut()` or the route handlers.
 *
 * `middleware.ts` must NOT import this file — it would drag the Drizzle adapter
 * and the Neon client into the Edge bundle. It imports `auth.config.ts` instead.
 *
 * Note the adapter + JWT combination: the adapter still writes `users` and
 * `accounts` rows (so `expense_groups.user_id -> users.id` is a real FK, and so
 * deleting a user cascades their data away), but no `sessions` rows are ever
 * created because the session lives in the cookie. The `sessions` table stays
 * defined and empty — see docs/plans/F02-auth.md §2.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
})
```

If F03 exported the tables under different symbol names (`usersTable` etc.), adjust the import — but do **not** rename F03's exports from here; that is F03's contract.

```bash
npx tsc --noEmit && git add auth.ts && git commit -m "F02: root auth.ts wiring the Drizzle adapter onto the shared config"
```

---

### Task 8 — The Auth.js route handler

**File: `app/api/auth/[...nextauth]/route.ts`** (complete contents)

```ts
import { handlers } from '@/auth'

/**
 * §4.5 — the only Route Handler F02 owns. Serves the whole Auth.js surface:
 *   GET  /api/auth/providers
 *   GET  /api/auth/csrf
 *   GET  /api/auth/session
 *   GET|POST /api/auth/signin/google
 *   GET  /api/auth/callback/google   <- the URI registered in Google Console
 *   POST /api/auth/signout
 *
 * Node runtime (the default) — the adapter needs it.
 */
export const { GET, POST } = handlers
```

Directory name must be exactly `[...nextauth]` (catch-all, lowercase) or the callback path won't exist and Google will hand you `redirect_uri_mismatch`.

```bash
mkdir -p 'app/api/auth/[...nextauth]'
# …write the file…
npx tsc --noEmit
git add 'app/api/auth/[...nextauth]/route.ts' && git commit -m "F02: mount Auth.js handlers at /api/auth/[...nextauth]"
```

**Checkpoint — the handler is live before any UI exists:**

```bash
npm run dev &
sleep 4
curl -s http://localhost:3000/api/auth/providers | head -c 400; echo
curl -s http://localhost:3000/api/auth/session; echo
```

**Expected:**
```json
{"google":{"id":"google","name":"Google","type":"oidc","signinUrl":"http://localhost:3000/api/auth/signin/google","callbackUrl":"http://localhost:3000/api/auth/callback/google"}}
```
and `{}` for the session (signed out — an empty object, not an error).

If `/api/auth/providers` 500s, the usual causes are: `AUTH_SECRET` missing, `AUTH_GOOGLE_ID`/`SECRET` missing, or `lib/db` failing to construct.

---

### Task 9 — `middleware.ts`

**File: `middleware.ts`** (repo root, complete contents)

```ts
import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from './auth.config'

/**
 * A SECOND, adapter-free Auth.js instance that exists only to verify the JWT
 * cookie on the Edge. Importing `@/auth` here instead would pull the Drizzle
 * adapter + Neon client into the Edge bundle. See docs/plans/F02-auth.md §3.
 */
const { auth: withAuth } = NextAuth(authConfig)

export default withAuth((req) => {
  if (req.auth?.user?.id) return // signed in — carry on

  // Bounce to the sign-in page, remembering where they were headed.
  const signInUrl = new URL('/', req.nextUrl.origin)
  const intended = req.nextUrl.pathname + req.nextUrl.search
  if (intended && intended !== '/') signInUrl.searchParams.set('next', intended)
  return NextResponse.redirect(signInUrl)
})

/**
 * POSITIVE matcher — we enumerate exactly what is protected rather than using a
 * negative lookahead. This makes the two exclusions structural rather than
 * incidental:
 *
 *   NOT matched: /s/:token*   public share pages (D4, §4.6) — MUST stay open
 *   NOT matched: /api/auth/*  the sign-in flow itself; matching it would loop
 *   NOT matched: /            the sign-in page
 *   NOT matched: /_next/*, /favicon.ico, static assets — free, no exclusion needed
 *
 * Adding a new protected route means adding a line here. Adding a new PUBLIC
 * route means doing nothing, which is the safer default for this app because
 * pages also enforce auth themselves via requireUserId().
 */
export const config = {
  matcher: ['/new', '/m/:path*', '/e/:path*', '/stats'],
}
```

Notes worth internalising:

- `middleware.ts` lives at the **repo root** (sibling of `app/`), because this project has no `src/` directory. If F01 scaffolded with `src/`, it goes at `src/middleware.ts` and `authConfig` imports become `'./auth.config'` relative to that location.
- The matcher strings are compiled at build time and **cannot be dynamic** — no variables, no imported constants, no template literals.
- `/m/:path*` also matches bare `/m`. Fine: F07 can redirect `/m` → current month, and it should be behind auth either way.
- Middleware is a redirect for humans. It is **not** the authorization check. See §1.5.

```bash
npx tsc --noEmit && git add middleware.ts && git commit -m "F02: edge middleware protecting /new /m /e /stats, leaving /s and /api/auth open"
```

---

### Task 10 — `lib/auth/requireUserId.ts`

This is the single most-imported file F02 publishes. Its ergonomics matter more than its cleverness: it must be one `await`, return a bare `string`, and never force a call site to write a null check.

**File: `lib/auth/requireUserId.ts`** (complete contents)

```ts
import { redirect } from 'next/navigation'

import { auth } from '@/auth'

/**
 * F02's published auth surface. See docs/plans/F02-auth.md §1 (INVARIANT A).
 */

/**
 * The id of the signed-in user, or `null`. Use this only when "signed out" is a
 * legitimate, non-exceptional state you intend to render differently — the
 * landing page, or a component that shows a sign-in prompt.
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

/**
 * THE function every Server Action and every protected Server Component starts
 * with:
 *
 *     export async function deleteExpense(id: string) {
 *       const userId = await requireUserId()
 *       await db.delete(expenseGroups)
 *         .where(and(eq(expenseGroups.id, id), eq(expenseGroups.userId, userId)))
 *     }
 *
 * Returns a plain `string`, never `string | null`, so no call site needs a
 * narrowing branch. When there is no session it calls Next's `redirect('/')`,
 * which THROWS a `NEXT_REDIRECT` control-flow error — so nothing after it runs,
 * and TypeScript's `never` return from `redirect()` proves that to the compiler.
 *
 * TWO RULES FOR CALLERS:
 *
 *  1. Call it FIRST, before reading `formData`, before validating, before any
 *     DB access. It is cheap (a cookie decrypt, zero round trips — that is the
 *     whole reason F02 chose the JWT strategy) so there is no excuse to defer it.
 *
 *  2. NEVER wrap it in a bare try/catch. `redirect()` signals by throwing;
 *     a `catch (e) { return { error: 'oops' } }` around it will swallow the
 *     redirect and turn a sign-in bounce into a confusing error toast. If you
 *     must try/catch a block that contains it, hoist the `requireUserId()` call
 *     above the `try`.
 *
 * SERVER COMPONENTS: safe. The redirect renders the sign-in page.
 * SERVER ACTIONS:    safe. Next serialises the redirect back to the client router.
 * ROUTE HANDLERS:    do NOT use this — a 307 to an HTML page is a terrible
 *                    answer to `fetch()`. Use `getUserId()` + `unauthorizedJson()`.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId()
  if (!userId) redirect('/')
  return userId
}

/** Thrown by `requireUserIdApi()`; catch it at a Route Handler boundary. */
export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Route-handler flavour for `/api/parse` (F04) and `/api/photos/upload` (F06),
 * both of which §4.5 marks auth-required. Throws instead of redirecting.
 */
export async function requireUserIdApi(): Promise<string> {
  const userId = await getUserId()
  if (!userId) throw new UnauthorizedError()
  return userId
}

/** Canonical 401 body, so both API routes answer identically. */
export function unauthorizedJson(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
```

Why `redirect('/')` and not `notFound()` or `throw new Error()`:
- `throw new Error('unauthenticated')` surfaces as Next's generic error boundary — a red screen for what is a completely normal state (cookie expired after 30 days).
- `notFound()` lies about what happened.
- `redirect('/')` lands the user on the Google button, which is what they need. Middleware already covers the *navigation* case; `requireUserId()` covers the *action* and *direct-render* cases and the race where a cookie expires between page load and button press.
- Next 16 also ships an `unauthorized()` interrupt behind the experimental `authInterrupts` flag with an `app/unauthorized.tsx` boundary. It is nicer in principle. It is experimental, and "no feature flags" is a core tenet — **do not use it in v0.1.0.** Revisit when it stabilises (see Open Questions).

```bash
mkdir -p lib/auth
npx tsc --noEmit && git add lib/auth/requireUserId.ts && git commit -m "F02: publish requireUserId/getUserId — the auth entry point every action uses"
```

---

### Task 11 — Sign-in / sign-out Server Actions

Keeping these in their own module means client components (F07's header, for instance) can import and pass them to `<form action={…}>` without needing `signIn`/`signOut` — which are server-only — anywhere near a `'use client'` boundary.

**File: `lib/auth/actions.ts`** (complete contents)

```ts
'use server'

import { signIn, signOut } from '@/auth'

/**
 * Only allow same-origin, path-relative redirect targets. Rejects absolute URLs
 * and protocol-relative `//evil.com` — an open redirect on the sign-in path is
 * a real phishing primitive, and `next` comes straight from the query string.
 */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  if (value.includes('\\')) return '/'
  return value
}

/** Bound to the sign-in form on `/`. Redirects to Google, then back. */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  await signIn('google', { redirectTo: safeNext(formData.get('next')) })
}

/** Bound to the sign-out button. Clears the session cookie, lands on `/`. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' })
}
```

`signIn()` and `signOut()` both throw `NEXT_REDIRECT` internally — the same rule as `requireUserId()` applies: never try/catch them.

```bash
npx tsc --noEmit && git add lib/auth/actions.ts && git commit -m "F02: sign-in/sign-out server actions with open-redirect guard"
```

---

### Task 12 — The sign-in page at `/`

Per §4.6: signed out → landing + Google button. Signed in → redirect to `/m/<current YYYY-MM>`. No email/password, no sign-up flow, no "create account" — with Google OAuth, first sign-in *is* sign-up (the adapter inserts the `users` row).

**File: `app/page.tsx`** (complete contents)

```tsx
import { redirect } from 'next/navigation'

import { signInWithGoogleAction } from '@/lib/auth/actions'
import { getUserId } from '@/lib/auth/requireUserId'
import { monthKey, todayJakartaISO } from '@/lib/format'

export const metadata = {
  title: 'Expense Tracking',
  description: 'Catat pengeluaran dengan sekali paste.',
}

export default async function HomePage({
  searchParams,
}: {
  // Next 15+/16: searchParams is a Promise.
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const userId = await getUserId()
  const { next, error } = await searchParams

  if (userId) {
    redirect(`/m/${monthKey(todayJakartaISO())}`)
  }

  return (
    <main className="flex min-h-[100dvh] flex-col justify-between px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))]">
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-3xl font-semibold tracking-tight">Expense Tracking</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-neutral-500">
          Paste catatan belanjamu apa adanya. Nanti dirapikan otomatis, lengkap
          dengan kategori dan total.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Gagal masuk. Coba lagi ya.
          </p>
        ) : null}

        <form action={signInWithGoogleAction}>
          <input type="hidden" name="next" value={next ?? '/'} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-base font-medium text-neutral-900 shadow-sm active:scale-[0.99] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          >
            <GoogleMark />
            Masuk dengan Google
          </button>
        </form>

        <p className="text-center text-xs text-neutral-400">
          Datamu privat. Cuma kamu yang bisa lihat.
        </p>
      </div>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
```

Styling here is deliberately plain — F10 owns the design system and will replace these classes with `Button` / `Card` primitives. Keep the **structure** (form → hidden `next` → submit button) intact when F10 restyles it. Note the 16px-minimum font size on the button (`text-base`) per F10's iOS rule.

```bash
npx tsc --noEmit && git add app/page.tsx && git commit -m "F02: sign-in landing page at / with a single Google button"
```

---

### Task 13 — Sign-out affordance

**File: `components/auth/SignOutButton.tsx`** (complete contents)

```tsx
import { signOutAction } from '@/lib/auth/actions'

/**
 * Sign-out affordance. F07 drops this into the `/m/[month]` and `/e/[id]`
 * header menu; it is also usable standalone.
 *
 * It is a plain <form> posting to a Server Action, so it works before hydration
 * and needs no client JS at all.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={
          className ??
          'w-full rounded-xl px-4 py-3 text-left text-base text-red-600 active:bg-neutral-100 dark:active:bg-neutral-800'
        }
      >
        Keluar
      </button>
    </form>
  )
}
```

Optionally add a minimal signed-in identity strip that F07 can reuse:

**File: `components/auth/AccountMenu.tsx`** (complete contents)

```tsx
import { auth } from '@/auth'

import { SignOutButton } from './SignOutButton'

/**
 * Minimal "who am I + get me out" block. F07 owns the real header; this exists
 * so F02 is verifiable end-to-end on its own and so there is exactly one place
 * that renders the signed-in identity.
 */
export async function AccountMenu() {
  const session = await auth()
  if (!session?.user) return null

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{session.user.name ?? 'Kamu'}</p>
        <p className="truncate text-xs text-neutral-500">{session.user.email}</p>
      </div>
      <SignOutButton className="shrink-0 rounded-xl border border-neutral-200 px-3 py-2 text-sm text-red-600 dark:border-neutral-700" />
    </div>
  )
}
```

```bash
mkdir -p components/auth
npx tsc --noEmit && git add components/auth && git commit -m "F02: sign-out button and account menu"
```

---

### Task 14 — Build gate

```bash
cd /home/miftah/expense-tracking
npx tsc --noEmit
npm run lint
npm run build
```

**Expected in the `npm run build` output:** a route table containing

```
ƒ /                                      …
ƒ /api/auth/[...nextauth]                …
ƒ Middleware                             ~XX kB
```

Sanity-check that the adapter did **not** leak into the Edge bundle. The middleware chunk should be tens of kB, not hundreds:

```bash
du -sh .next/server/middleware.js 2>/dev/null || ls -la .next/server/ | grep -i middleware
grep -rl 'drizzle-orm\|@neondatabase' .next/server/middleware* 2>/dev/null && echo "LEAK — middleware imported the DB layer" || echo "clean"
```

**Expected:** `clean`. If it says LEAK, something in the `auth.config.ts` import graph reaches the database — most likely you imported `@/auth` instead of `./auth.config` in `middleware.ts`, or added a `lib/env.ts` import to the config.

```bash
git commit --allow-empty -m "F02: build gate green, middleware bundle free of the DB layer"
```

---

## Getting AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET

This whole section is manual work in a browser. Budget 15–20 minutes. You need a Google account (any Gmail works — it does not have to be a Workspace account).

The Google Cloud Console reorganised OAuth settings into a section called **Google Auth Platform**. Older tutorials say "APIs & Services → OAuth consent screen"; that link now lands on the same place. Both names are noted below.

### A. Create the Cloud project

1. Go to **https://console.cloud.google.com/**. Sign in with the Google account that should own this app.
2. Click the **project picker** in the top blue bar (it says "Select a project", or shows a current project name).
3. Click **New project** (top right of the dialog).
4. Fill in:
   - **Project name:** `expense-tracking`
   - **Location / Organization:** leave as **No organization** for a personal account.
5. Click **Create**. Wait ~10 seconds for the notification bell to say it is ready.
6. Use the project picker again to **switch into `expense-tracking`**. Everything below must happen inside this project — check the blue bar shows `expense-tracking` before each step.

> You do **not** need to enable any API. Sign-in with email/profile/openid scopes works without enabling "Google+ API" or "People API". Old tutorials that tell you to enable Google+ API are years out of date.

### B. Configure the OAuth consent screen (Google Auth Platform)

7. Left nav (hamburger, top-left) → **APIs & Services** → **OAuth consent screen**. You will land on **Google Auth Platform → Overview**.
8. Click **Get started**.
9. **App Information**
   - **App name:** `Expense Tracking` — *this is the name users see on the Google consent screen. Make it something you're happy to see there.*
   - **User support email:** pick your own address from the dropdown.
   - **Next**
10. **Audience**
    - Choose **External**. (**Internal** is only selectable on a Google Workspace org and would restrict sign-in to that org — we want any Google account, per D3.)
    - **Next**
11. **Contact Information**
    - **Email addresses:** your own address. Google uses this to notify you about the project.
    - **Next**
12. **Finish** — tick *"I agree to the Google API Services: User Data Policy"* → **Continue** → **Create**.

13. **Branding** (left nav under Google Auth Platform). Optional but do it now so you never see a half-configured consent screen:
    - **App logo:** optional, skip.
    - **Application home page:** `https://expensetracking.online`
    - **Privacy policy link** / **Terms of service link:** optional while you are using only non-sensitive scopes. Leave blank for v0.1.0.
    - **Authorized domains:** add `expensetracking.online` (enter the **registrable domain only** — no `https://`, no `www.`, no path). Required if you filled in any of the link fields above.
    - **Save**

14. **Data Access** (left nav; older UI: the "Scopes" step of the consent screen wizard).
    - Click **Add or remove scopes**.
    - Tick exactly these three:
      - `.../auth/userinfo.email`
      - `.../auth/userinfo.profile`
      - `openid`
    - **Update** → **Save**.
    - These are Google's **non-sensitive** scopes. They require **no verification review**. Do not add anything else — the moment you add a sensitive or restricted scope (Drive, Gmail, Calendar…) you enter a verification process that takes weeks. This app calls zero Google APIs after sign-in; it only needs to know who you are.

### C. Publishing status: Testing vs In production

15. Go to **Audience** in the left nav. Look at **Publishing status**.

**What "Testing" means in practice:**
- Only Google accounts you have explicitly added under **Test users** can sign in. Everyone else gets **`Error 403: access_denied`** with "…has not completed the Google verification process". Cap: **100 test users**.
- Refresh tokens issued to a Testing-status app **expire after 7 days**.

**Does the 7-day refresh-token expiry hurt this app? No — and here's exactly why.**
- We chose **JWT sessions** (§2). Your login lifetime is governed by *our* 30-day session cookie, signed with `AUTH_SECRET`. It has nothing to do with any Google token.
- We call **zero Google APIs** after sign-in. The Google access token is used once, at the callback, to read your email/name/picture. It is then irrelevant.
- We configured `access_type: 'online'` (Task 6), so Google is not even asked for a refresh token. `accounts.refresh_token` will be null. There is nothing to expire.
- Contrast: an app that syncs your Google Calendar every night *would* break every 7 days in Testing mode. That app is not this app.

**But you still must publish**, for a different reason: **D3 says any Google account may sign in.** Testing mode structurally forbids that.

16. Click **Publish app** → read the dialog → **Confirm**.
    - **Publishing status** becomes **In production**.
    - **Verification status** will say something like *"Not required"* or offer "Prepare for verification". Because you only requested non-sensitive scopes, **no review is needed and no unverified-app warning screen is shown to users.** The scary "Google hasn't verified this app — Advanced → Go to … (unsafe)" interstitial only appears for apps requesting *sensitive* or *restricted* scopes.
    - If for any reason you keep it in Testing during development, add your own Google account (and anyone testing with you) under **Test users** → **Add users**.

### D. Create the Web application OAuth client

17. Left nav → **Google Auth Platform → Clients** (older UI: **APIs & Services → Credentials**).
18. **Create client** (older UI: **+ Create credentials → OAuth client ID**).
19. **Application type:** **Web application**. *(Not "Desktop", not "Android", not "iOS" — even though this is a mobile-first web app, it is served from a web server, so it is a Web application.)*
20. **Name:** `expensetracking web` — internal label only, users never see it.

21. **Authorized JavaScript origins** — click **+ Add URI** twice and enter, **exactly**:

```
http://localhost:3000
https://expensetracking.online
```

> Origins are scheme + host + port, with **no trailing slash and no path**. Strictly speaking Auth.js v5 does a server-side authorization-code redirect and never issues a browser-side token request, so these are not *required* — but they cost nothing, they are what every troubleshooting guide asks you to check, and if you ever add Google One Tap you will need them. Add them.

22. **Authorized redirect URIs** — click **+ Add URI** twice and enter, **exactly**:

```
http://localhost:3000/api/auth/callback/google
https://expensetracking.online/api/auth/callback/google
```

> **This is the Auth.js v5 callback path.** The shape is `{origin}{basePath}/callback/{providerId}` where `basePath` defaults to `/api/auth` and the Google provider's id is `google`. It corresponds directly to the `app/api/auth/[...nextauth]/route.ts` file from Task 8.
>
> Matching is **byte-exact**: scheme, host, port, and path all count. `https://` vs `http://`, a trailing slash, `Callback` vs `callback`, or `127.0.0.1` instead of `localhost` all produce **`Error 400: redirect_uri_mismatch`**. Google permits plain `http` **only** for `localhost`.
>
> Google does **not** support wildcards (`https://*.vercel.app/...` is rejected) and does not support raw IP addresses.
>
> If you plan to serve the site at `www.expensetracking.online` as well — or if your DNS/Vercel setup redirects apex → www rather than www → apex — add the www forms too:
> ```
> https://www.expensetracking.online
> https://www.expensetracking.online/api/auth/callback/google
> ```
> The safest configuration is: pick the apex as canonical, make Vercel 308-redirect www → apex, and register only the apex. Verify which direction your redirect actually goes before deciding.

23. Click **Create**. A dialog shows **Your Client ID** and **Your Client Secret**.
24. Copy both immediately into `.env.local` (you can retrieve the ID later from the Clients list; since 2025 the secret is only fully visible right after creation, though you can always download the JSON or add a second secret):

```bash
cd /home/miftah/expense-tracking
cat >> .env.local <<'ENVEOF'
AUTH_GOOGLE_ID="PASTE_CLIENT_ID_HERE.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-PASTE_SECRET_HERE"
ENVEOF
```

25. **Propagation:** Google says changes to a client can take **5 minutes to a few hours** to take effect. If a URI you just added still gives `redirect_uri_mismatch`, re-read it character by character first, then wait and retry before assuming you did it wrong.

### E. Generate `AUTH_SECRET`

```bash
cd /home/miftah/expense-tracking
npx auth secret
```

Generates 32 random bytes, base64-encodes them, and appends `AUTH_SECRET=…` to `.env.local`.

Manual equivalents, if you prefer:

```bash
openssl rand -base64 33
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`AUTH_SECRET` is what encrypts and signs the session JWE cookie. Consequences:
- **Different values in local vs production is correct and expected** — you simply have to sign in again in each environment.
- **Changing it signs every user out instantly.** That is our break-glass revocation mechanism (§2).
- Vercel Preview must use the **same** value as Production if you adopt the redirect-proxy option in §7.

### F. Verify the credentials actually work

```bash
npm run dev
```

Open http://localhost:3000, click **Masuk dengan Google**. You should land on `accounts.google.com`, pick an account, and come back to `/m/2026-08`.

Failure decoder:

| Symptom | Cause | Fix |
|---|---|---|
| `Error 400: redirect_uri_mismatch` | Redirect URI not registered, or not byte-identical | Compare against step 22 exactly; check port is 3000; wait for propagation |
| `Error 401: invalid_client` | Wrong/rotated `AUTH_GOOGLE_SECRET`, or ID and secret from different clients | Re-copy both from the same client in the Clients list |
| `Error 403: access_denied` | App still in **Testing** and your account is not a test user | Publish the app (step 16) or add yourself under Test users |
| "Google hasn't verified this app" warning | A sensitive scope crept into Data Access | Remove everything but email / profile / openid |
| Redirect loops back to `/` forever | Cookie not set — usually `AUTH_SECRET` differs between the process that set it and the one reading it, or you're mixing `localhost` and `127.0.0.1` | One secret, one hostname |
| `MissingSecret` in the server log | `AUTH_SECRET` absent from `.env.local`, or dev server started before you added it | Add it, restart `npm run dev` |

---

## 6. `AUTH_URL`, `trustHost`, and Vercel environment variables

### What each knob does

**`AUTH_SECRET`** — encrypts/signs the session cookie. Required everywhere. No default.

**`AUTH_URL`** — pins the origin Auth.js uses to construct the OAuth `redirect_uri` and its own internal URLs. When unset, Auth.js derives the origin from the incoming request's headers (`Host` / `X-Forwarded-Host` / `X-Forwarded-Proto`) — which is only safe if it is allowed to trust those headers.

**`trustHost`** — the permission to trust those forwarded headers. Auth.js v5 turns it on automatically when it detects `process.env.VERCEL` or `AUTH_TRUST_HOST`, and in development. We also set `trustHost: true` explicitly in `auth.config.ts` (Task 6). The security caveat is real: trusting `X-Forwarded-Host` from an untrusted proxy lets an attacker rewrite the callback origin. It is safe **here** because Vercel terminates TLS and rewrites those headers itself, and because Google will still only redirect to a URI we pre-registered — the registered-redirect-URI list is the actual backstop.

### The configuration

| Environment | `AUTH_SECRET` | `AUTH_GOOGLE_ID` / `_SECRET` | `AUTH_URL` |
|---|---|---|---|
| Local (`.env.local`) | your generated value | from the Console | **unset** — Auth.js defaults to `http://localhost:3000` |
| Vercel **Production** | a *different*, freshly generated value | same client | `https://expensetracking.online` |
| Vercel **Preview** | same as Production *only if* you use the redirect proxy (§7); otherwise its own value | same client | **unset** — see §7 |
| Vercel **Development** | — | — | — |

Why set `AUTH_URL` in Production at all, given `trustHost` would auto-detect? Because auto-detection resolves to *whatever host served the request*, and a Vercel production deployment is reachable at several hosts at once: the apex, possibly `www.`, and always the internal `expense-tracking-<hash>.vercel.app`. Pinning `AUTH_URL` guarantees the `redirect_uri` we send Google is always the single one we registered, so a user who arrives via any of those hosts still completes sign-in. It converts a class of intermittent `redirect_uri_mismatch` into a deterministic pass.

Why **not** set it in Preview? Because pinning it there would send preview sign-ins to the *production* callback, dropping the user into production instead of the preview they were testing.

### Setting them on Vercel

```bash
cd /home/miftah/expense-tracking

# Production
vercel env add AUTH_SECRET production          # paste a NEW secret, not your local one
vercel env add AUTH_GOOGLE_ID production
vercel env add AUTH_GOOGLE_SECRET production
vercel env add AUTH_URL production             # https://expensetracking.online

# Preview (no AUTH_URL)
vercel env add AUTH_SECRET preview
vercel env add AUTH_GOOGLE_ID preview
vercel env add AUTH_GOOGLE_SECRET preview

vercel env ls
```

**Expected from `vercel env ls`:** four rows for `production`, three for `preview`, none for `development` (that is what `.env.local` is for).

Or do it in the dashboard: **Project → Settings → Environment Variables**, adding each with only the relevant environment checkboxes ticked. Any change requires a **redeploy** to take effect — env vars are baked at build/boot, not read live.

### Rotating `AUTH_SECRET` (break-glass revocation)

Because JWT sessions cannot be individually revoked (§2), the whole-fleet sign-out is:

```bash
vercel env rm AUTH_SECRET production
vercel env add AUTH_SECRET production   # paste a fresh `openssl rand -base64 33`
vercel --prod                           # redeploy so the new value is picked up
```

Every existing cookie fails to decrypt and every user is signed out. For a personal app this is an entirely adequate substitute for a session table.

---

## 7. Vercel preview deployments

**The problem:** every preview deployment gets a fresh URL like `https://expense-tracking-9k2mfq1x8-miftah.vercel.app`. Google requires every redirect URI to be registered in advance and **does not accept wildcards**. So OAuth on a raw preview URL fails with `redirect_uri_mismatch` by construction.

Three options, in the order you should consider them:

### Option A — Don't sign in on previews *(chosen for v0.1.0)*

Previews are still useful without auth: `/s/[token]` share pages are public, and static/layout/design work renders fine. Anything behind `requireUserId()` will bounce you to `/`, which is honest and harmless.

**Cost:** zero. **Do this unless a specific preview needs a signed-in session.**

### Option B — One stable preview hostname

Vercel gives every branch a **stable** alias in addition to the per-deployment URL:

```
https://expense-tracking-git-<branch>-<team-slug>.vercel.app
```

That URL does not change between deployments of the same branch, so it *can* be registered. Or, cleaner, assign a real subdomain to a branch: **Project → Settings → Domains → Add** `preview.expensetracking.online`, and set its **Git Branch** to `develop`.

Then add to the Google client:

- Authorized JavaScript origin: `https://preview.expensetracking.online`
- Authorized redirect URI: `https://preview.expensetracking.online/api/auth/callback/google`

and set `AUTH_URL=https://preview.expensetracking.online` scoped to the Preview environment (which pins previews to that one host — meaning *other* branches' previews still cannot sign in; that is the trade).

**Cost:** one DNS record and one extra pair of URIs. Do this the first time you actually need it.

### Option C — Auth.js redirect proxy

Auth.js v5 supports `redirectProxyUrl` (env: `AUTH_REDIRECT_PROXY_URL`). Google redirects to the **production** callback, which then forwards the OAuth response on to whichever preview origin started the flow.

Set on the **Preview** environment only:

```
AUTH_REDIRECT_PROXY_URL=https://expensetracking.online/api/auth
```

Requirements and caveats:
- Preview and Production must share the **same `AUTH_SECRET`** — the proxy hand-off is verified with it.
- Only the production redirect URI needs to be registered with Google. Every preview URL works.
- Production is now processing OAuth callbacks on behalf of arbitrary preview deployments; a compromised preview can obtain a session. Acceptable for a solo project, not for a team with untrusted branches.
- **Vercel Deployment Protection** must be off (or bypassed) for previews, otherwise the forward lands on Vercel's SSO wall instead of your app.

**Cost:** one env var, but the widest blast radius. Only reach for it if you routinely need signed-in previews on many branches.

**Decision for v0.1.0: Option A.** Record it here; upgrade to B if preview testing of `/new` or `/e/[id]` becomes a real need.

---

## 8. Manual verification script

Run every step. Each has an explicit pass condition. Steps 1–6 are automatable; 7–13 need a browser.

### Setup

```bash
cd /home/miftah/expense-tracking
npm run dev
# leave running; use a second terminal for the curl steps
```

### 1. Providers endpoint is live and lists exactly one provider

```bash
curl -s http://localhost:3000/api/auth/providers | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(Object.keys(j), j.google?.callbackUrl)})"
```
**PASS:** `[ 'google' ] http://localhost:3000/api/auth/callback/google`
**FAIL if** any other provider appears, or the callback URL differs from what you registered in the Console.

### 2. Session is empty when signed out

```bash
curl -s http://localhost:3000/api/auth/session
```
**PASS:** `{}` — an empty object, HTTP 200. **FAIL:** a 500, or a body containing a user.

### 3. Protected routes redirect when signed out

```bash
for p in /new /m/2026-08 /e/abc123 /stats; do
  printf '%-14s ' "$p"
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://localhost:3000$p"
done
```
**PASS:**
```
/new           307 http://localhost:3000/?next=%2Fnew
/m/2026-08     307 http://localhost:3000/?next=%2Fm%2F2026-08
/e/abc123      307 http://localhost:3000/?next=%2Fe%2Fabc123
/stats         307 http://localhost:3000/?next=%2Fstats
```
**FAIL:** any `200` — that route rendered without a session.
(If F05/F07/F08 haven't shipped those pages yet you will still get `307` here, because middleware runs *before* routing. That is the point: this test is valid today, before those features exist.)

### 4. `/s/*` stays public — THE critical assertion

```bash
curl -s -o /dev/null -w '%{http_code} [%{redirect_url}]\n' http://localhost:3000/s/aBcDeF123456
```
**PASS:** `404 []` — Next has no `/s/[token]` route yet (F09 owns it), so a 404 is correct, and crucially it is **not** a 307 to `/`. That proves middleware did not intercept the path.
**FAIL:** `307 [http://localhost:3000/?next=%2Fs%2FaBcDeF123456]` — the matcher is wrong; `/s/*` must never appear in `middleware.ts`'s `config.matcher`.
After F09 ships, re-run with a real token and expect `200`.

### 5. `/api/auth/*` is not intercepted

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/auth/csrf
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/auth/signin/google
```
**PASS:** `200` for csrf; `302`/`200` for signin. **FAIL:** a redirect to `/` (infinite sign-in loop — the matcher is catching `/api/auth`).

### 6. `/` renders the button when signed out

```bash
curl -s http://localhost:3000/ | grep -c 'Masuk dengan Google'
```
**PASS:** `1` or more.

### 7. Sign in (browser)

Open http://localhost:3000 → click **Masuk dengan Google**.
**PASS:** Google account chooser appears (not a consent screen every time — we set `prompt=select_account`), you pick an account, and you land on `/m/2026-08` (or whatever the current Jakarta month is).
**FAIL:** any of the errors in the decoder table at the end of the *Getting…* section.

### 8. The user row was actually created

```bash
psql "$DATABASE_URL" -c 'select id, email, name from users;'
psql "$DATABASE_URL" -c 'select "userId", provider, "providerAccountId", refresh_token is null as no_refresh from accounts;'
psql "$DATABASE_URL" -c 'select count(*) as should_be_zero from sessions;'
```
**PASS:** one `users` row with your email; one `accounts` row with `provider = google` and `no_refresh = t` (proving `access_type=online` took effect); `should_be_zero = 0` (proving JWT strategy — no DB session was written).
If you don't have `psql`, use `npm run db:studio` (F01 script) and look at the same three tables.

### 9. The session actually carries `user.id` — THE other critical assertion

In the browser DevTools console, on any page of the app:

```js
await (await fetch('/api/auth/session')).json()
```

**PASS:**
```json
{
  "user": { "name": "…", "email": "…", "image": "…", "id": "cuid-or-uuid-here" },
  "expires": "2026-09-18T…"
}
```
The `id` field **must** be present and **must** equal the `users.id` from step 8. If `id` is missing, the `session` callback in `auth.config.ts` is not running or `token.sub` is empty — nothing downstream will work.

### 10. `next=` round-trips

Sign out first (step 12), then:
```
open http://localhost:3000/e/abc123
```
**PASS:** you are bounced to `/?next=%2Fe%2Fabc123`; after signing in you land on `/e/abc123` (which may itself 404 until F07 ships — that's fine, the *routing* is what's under test).

### 11. Open-redirect guard holds

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/?next=https://evil.example.com'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/?next=//evil.example.com'
```
Then, in the browser, load each of those URLs and click the sign-in button.
**PASS:** after Google, you land on `/` (or the month page) — never on `evil.example.com`. `safeNext()` rejected both.

### 12. Sign out

Click **Keluar** (render `<AccountMenu />` temporarily in a protected page if F07's header isn't built yet).
**PASS:** you land on `/` and see the Google button again.

```bash
curl -s http://localhost:3000/api/auth/session   # → {}   (in a fresh/private browser context)
```
Re-run step 3 in the browser: `/new` must bounce to `/` again.

### 13. Production smoke (after deploy)

```bash
curl -s https://expensetracking.online/api/auth/providers | grep -o 'https://[^"]*callback/google'
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://expensetracking.online/new
curl -s -o /dev/null -w '%{http_code}\n' https://expensetracking.online/s/aBcDeF123456
```
**PASS:** callback prints `https://expensetracking.online/api/auth/callback/google` (proving `AUTH_URL` took effect); `/new` gives `307 https://expensetracking.online/?next=%2Fnew`; `/s/…` gives `404`, not `307`.

Then sign in for real in a private window, and confirm step 9 against production.

### Commit the green run

```bash
git commit --allow-empty -m "F02: manual verification script passed (sign-in, session.user.id, /s public, /new protected)"
```

---

## 9. Contract deltas

**None.**

Everything F02 builds sits inside the authoritative contract as written:
- `auth.ts` at the repo root exporting `{ handlers, auth, signIn, signOut }` — §5/F02.
- `app/api/auth/[...nextauth]/route.ts` — §4.5, verbatim.
- `middleware.ts` protecting `/new`, `/m`, `/e`, `/stats` and not `/s` — §4.6 auth column, verbatim.
- JWT session strategy — §5/F02 already specifies it; §2 above records the reasoning rather than changing the decision.
- Env var names `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_URL` — §4.8, verbatim.
- Auth.js tables come from the standard Drizzle adapter shape, hand-rolled by nobody — §4.2, honoured.

Two additive files that the contract does not enumerate but does not forbid, flagged for visibility:

1. `auth.config.ts` at the repo root. Required by the Edge/Node split (§3). It is an implementation detail of `auth.ts`; nothing outside `auth.ts` and `middleware.ts` should import it.
2. `lib/auth/actions.ts` — sign-in/sign-out Server Actions. Deliberately **not** placed in `app/actions/`, so the §4.4 Server Actions table stays exactly as written and continues to describe only data mutations.
3. `types/next-auth.d.ts` — type-only augmentation, zero runtime footprint.

---

## 10. Interfaces I publish

Everything below is stable API for F05–F09. Import from these exact paths.

### `lib/auth/requireUserId.ts` — the one every feature needs

```ts
requireUserId(): Promise<string>
```
Returns `users.id`. Redirects to `/` (by throwing `NEXT_REDIRECT`) when there is no session, so the return type is a bare `string` and no call site needs a null check.
**Use in:** every Server Action in `app/actions/*.ts`, and every protected Server Component.
**Cost:** cookie decrypt, zero DB round trips.
**Rules:** call it *first*; never wrap it in try/catch; don't use it in Route Handlers.

Canonical call site (this is the shape §4.4 mandates):

```ts
'use server'
import { and, eq } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/requireUserId'
import { db } from '@/lib/db'
import { expenseGroups } from '@/lib/db/schema'

export async function deleteExpense(id: string): Promise<void> {
  const userId = await requireUserId()          // ← always line 1
  await db.delete(expenseGroups).where(
    and(eq(expenseGroups.id, id), eq(expenseGroups.userId, userId)),  // ← always scoped
  )
}
```

```ts
getUserId(): Promise<string | null>
```
For pages that legitimately render both states (`app/page.tsx`, and F09's `/s/[token]` if it ever wants to show an "open in app" affordance to signed-in viewers).

```ts
requireUserIdApi(): Promise<string>   // throws UnauthorizedError
class UnauthorizedError extends Error { status: 401 }
unauthorizedJson(): Response          // → 401 { "error": "Unauthorized" }
```
For the two auth-required Route Handlers in §4.5:

```ts
// app/api/parse/route.ts (F04) and app/api/photos/upload/route.ts (F06)
import { UnauthorizedError, requireUserIdApi, unauthorizedJson } from '@/lib/auth/requireUserId'

export async function POST(req: Request) {
  let userId: string
  try {
    userId = await requireUserIdApi()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedJson()
    throw e
  }
  // …
}
```

### `auth.ts` (repo root)

```ts
auth(): Promise<Session | null>   // Session.user.id is typed string
signIn(provider, options)
signOut(options)
handlers: { GET, POST }
```
Prefer `requireUserId()` / `getUserId()` over calling `auth()` directly. Reach for `auth()` only when you need the *profile* (`name`, `email`, `image`) — as `AccountMenu` does.
**Never import `@/auth` from `middleware.ts`** or from anything middleware transitively imports.

### `lib/auth/actions.ts`

```ts
signInWithGoogleAction(formData: FormData): Promise<void>  // reads formData 'next'
signOutAction(): Promise<void>
```
Safe to pass to `<form action={…}>` from client components.

### `components/auth/SignOutButton.tsx`, `components/auth/AccountMenu.tsx`

```tsx
<SignOutButton className?: string />   // server component, no client JS
<AccountMenu />                        // async server component: name + email + sign out
```
F07 should drop `<AccountMenu />` into its header menu rather than re-reading the session.

### Types

`session.user.id` is `string`, non-optional, everywhere — guaranteed by `types/next-auth.d.ts` plus the two callbacks. Features may rely on this without defensive checks.

### The guarantee F02 makes to F03

The `userId` handed out by `requireUserId()` is always a value present in `users.id`. It is safe to use directly as `expense_groups.user_id` with the FK in place; you never need to verify the user exists first.

---

## 11. Open questions for the integrator

1. **Does `lib/format.ts` exist when F02 runs?** `app/page.tsx` imports `monthKey` and `todayJakartaISO` from it (§4.7). The roadmap assigns §4.7 to no feature explicitly. **Assumption:** F01 or F03 ships it. If not, F02 creates it with only the three date exports and F03 fills in `formatIdr`/`parseIdrLoose` later. Confirm ownership so it isn't written twice.

2. **What exactly does F03 name the adapter table exports?** `auth.ts` currently imports `{ users, accounts, sessions, verificationTokens }` from `@/lib/db/schema`. If F03 exports `usersTable` etc., adjust the import in `auth.ts` (not F03's names).

3. **`users.id` type — text vs uuid.** The Drizzle adapter's default Postgres schema uses `text` with a `crypto.randomUUID()` default. §4.2 declares `expense_groups.user_id` as `text`, which matches. Confirm F03 did not switch it to a native `uuid` column, which would break the FK type.

4. **`/m` with no month segment.** The matcher `/m/:path*` protects both `/m` and `/m/2026-08`. §4.6 only defines `/m/[month]`. Does F07 want `/m` to redirect to the current month? If yes it needs a page; if no, it 404s (fine).

5. **Where does the sign-out affordance actually live?** F02 ships `AccountMenu`, but F07 owns the header and §4.6's tab bar has only three tabs with no account slot. Decide: a small avatar in the `/m/[month]` sticky header, or a long-press/overflow menu. F02 is unblocked either way.

6. **Account deletion.** `users` deletion cascades to `expense_groups` (§4.2), so the DB is ready — but there is no UI, and §6 doesn't list it as out of scope either. Assume **not in v0.1.0**; confirm.

7. **Do we want `www.expensetracking.online`?** Affects which redirect URIs must be registered (step 22). Needs F01's Vercel/Domainesia DNS decision. **Assumption:** apex is canonical, www 308-redirects to it, only apex URIs registered.

8. **Vercel preview sign-in.** §7 picks Option A (no OAuth on previews). Confirm nobody's workflow depends on signing in to a preview before this ships.

9. **Next 16's `unauthorized()` + `app/unauthorized.tsx`.** A cleaner primitive than `redirect('/')` for `requireUserId()`, but it is behind the experimental `authInterrupts` flag and the core tenet says no feature flags. **Assumption:** stay on `redirect('/')` for v0.1.0; revisit if it stabilises.

10. **Session length.** 30 days with a 1-day rolling refresh. For a personal daily-use expense tracker, "never asks me to sign in again" is arguably the right product answer — should this be 90 days? Cheap to change (`session.maxAge` in `auth.config.ts`), so it is not blocking, but pick deliberately.

11. **Does anything need to run on *every* request that middleware could do cheaply?** Right now middleware only redirects. If F10 wants a nonce-based CSP or F09 wants `noindex` headers on `/s/*`, the matcher would have to widen — and widening it is exactly how `/s/*` accidentally becomes protected. Route any such request through this plan's §1 INVARIANT B.
