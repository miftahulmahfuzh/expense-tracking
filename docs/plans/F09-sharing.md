# F09 — Public Share Links

> Plan file: `docs/plans/F09-sharing.md` · Depends on **F03** (data layer), **F07** (detail page) · Consumes **F02**, **F06**, **F10** · Wave 5 (parallel with F08)

---

## 0. What this feature is, in one paragraph

The user has just paid for dinner. They open `/e/<id>`, tap **Bagikan**, the iOS share sheet
comes up, they pick a friend in WhatsApp, and send. The friend — who has no account and will
never make one — taps the link and sees the title, the date, the itemised list with category
chips, the total, and the photos. Nothing else. No edit buttons, no tab bar, no way to reach
any other expense, no idea who the owner is beyond what the WhatsApp message already told them.
Later the user taps **Batalkan tautan**, and within seconds that URL returns a plain 404.

Everything below serves that paragraph. Anything that does not, is out of scope.

---

## 1. Preconditions

This plan assumes the following have landed. **Run the preflight in Task 1 before writing any code** —
if a symbol is missing or named differently, fix the reference here rather than working around it.

| From | Symbol / artefact | Used for |
|---|---|---|
| F01 | `next.config.ts`, `lib/env.ts` | response headers, `AUTH_URL` for absolute share URLs |
| F02 | `requireUserId()` | ownership check in both server actions |
| F02 | `middleware.ts` matcher | **must not** match `/s` — see Task 11 |
| F03 | `db`, `schema.shareLinks`, `schema.expenseGroups` | minting + revoking |
| F03 | `getGroupByShareToken(token)` | the only unscoped query in the app |
| F03 | `newId()` (nanoid(12) helper) | token generation |
| F06 | photo grid / lightbox component | read-only gallery on `/s/[token]` |
| F07 | `/e/[id]` page | the embed point for the share control |
| F10 | `Button`, `Card`, `Money`, `Chip`, design tokens, `TabBar` | UI primitives; `TabBar` must be *absent* from `/s` |
| — | `lib/format.ts` `formatIdr`, `TZ` | rupiah + Jakarta dates |

### 1.1 Assumptions about upstream naming

This plan writes Drizzle field names in camelCase (`userId`, `occurredOn`, `groupId`, `amountIdr`,
`blobUrl`, `sortOrder`) mapping to the snake_case columns in roadmap §4.2, and table exports named
`expenseGroups`, `expenseItems`, `expensePhotos`, `shareLinks`. Verify in Task 1 and adjust
identifiers if F03 chose otherwise. **Do not** change the column names — those are contract.

---

## 2. Design decisions, with the reasoning written down

### 2.1 Minting is idempotent — the URL must never churn

`share_links.group_id` is `UNIQUE` (roadmap §4.2), so a group has at most one live token.
That constraint exists for a product reason, not a storage reason: **a link that has already
been sent to a friend must keep working.** If tapping *Bagikan* a second time minted a fresh
token and orphaned the first, the user would silently break a link they sent yesterday, and
they would have no way to know.

So `createShareLink(groupId)` is a *get-or-create*, and the "get" branch is the common one.
Exact semantics (implemented in Task 4):

1. `requireUserId()`, then **verify ownership** — `SELECT id FROM expense_groups WHERE id = $groupId AND user_id = $userId`.
   No row → throw. This must happen *before* any write; without it, any signed-in user could
   mint a public link to a stranger's expenses by guessing a group id. This is the single most
   important line in the feature.
2. **Read first.** `SELECT token FROM share_links WHERE group_id = $groupId`. If a row exists,
   return that token verbatim and stop. No write, no `updated_at` churn, no `revalidatePath`.
3. **Mint.** `INSERT INTO share_links (token, group_id) VALUES (...) ON CONFLICT DO NOTHING RETURNING token`.
   Drizzle: `.onConflictDoNothing()` with no target, so it absorbs *both* unique constraints.
4. If exactly one row came back, that is the new token. Done.
5. If zero rows came back, the insert hit a conflict, and there are exactly two possible causes,
   which we distinguish by **re-reading by `group_id`**:
   - a row for this group now exists → another request (a double-tap, two tabs) won the race.
     Return *its* token. This is a success, not an error.
   - still no row for this group → the conflict was on the **primary key**, i.e. a genuine token
     collision. Generate a fresh token and loop (bounded at 3 attempts, then throw).

Step 5 is why `.onConflictDoNothing()` is used with **no conflict target**. Targeting only
`group_id` would let a PK collision surface as an unhandled `23505`; targeting neither means a
single code path absorbs both and the follow-up read disambiguates. The bounded retry exists for
completeness, not because it will ever run (see §2.2) — but a silent infinite loop would be worse
than a thrown error, hence the cap.

> **Not chosen:** `ON CONFLICT (group_id) DO UPDATE SET token = excluded.token`. That is the
> churn we are specifically preventing.
>
> **Not chosen:** `ON CONFLICT (group_id) DO UPDATE SET group_id = excluded.group_id RETURNING token`
> (the "upsert that returns the existing row" trick). It works, but it writes a dead tuple on every
> tap and it makes the read path a write path for no benefit. The read-first version is one cheap
> indexed lookup in the common case.

### 2.2 Token entropy: `nanoid(12)`, and the cost of guessing one

nanoid's default alphabet is 64 URL-safe characters (`A–Z a–z 0–9 _ -`). Twelve of them:

```
64^12 = 4,722,366,482,869,645,213,696 ≈ 4.7 × 10^21 distinct tokens = exactly 2^72
```

The roadmap quotes "~71 bits"; that is the same number, conservatively rounded down. Nothing in
this analysis turns on the one-bit difference — 2^71 and 2^72 are equally out of reach.

**Enumeration cost.** An attacker guessing blindly must expect to try half the space:

| Sustained guess rate | Expected time to find *one* live link |
|---|---|
| 1,000 req/s (already far past what a Hobby project will serve) | ~7.5 × 10^10 years |
| 1,000,000 req/s (a serious botnet, aimed at a free-tier app) | ~7.5 × 10^7 years |

Put the other way round: **10 million** blind requests — more traffic than this app will see in
its lifetime — yield a hit with probability 10^7 / 4.7×10^21 ≈ **2 × 10^-15**. And that is for
a *full* space; with `N` links actually minted, a single random guess hits *any* of them with
probability `N / 2^72`, so even 10,000 live links leaves ~2 × 10^-18 per guess.

**Why that is enough for this threat model.** The asset is one person's dinner receipt: a list of
Indonesian food items, a rupiah total, and some phone photos. It is not medical records, not
financial credentials, not anything with a regulatory floor. The realistic loss scenarios are
*the recipient forwards the link* and *the user pastes the URL somewhere public* — neither of
which more entropy fixes. Brute force is already ~14 orders of magnitude beyond irrelevant, and
the remaining risk lives entirely in §7 (Security review), not in the bit count.

**The tradeoff against a shorter token.** A friendlier 8-character token gives 64^8 = 2^48 ≈
2.8 × 10^14. Still astronomically safe against a human, but only ~4,500 years at 1,000 req/s and
**~4.5 years at 10^6 req/s** — and that margin erodes linearly as more links are minted, which is
exactly the wrong direction for a value that is never revisited after launch. Meanwhile the
gain is nothing the user perceives:

```
https://expensetracking.online/s/V1StGXR8_Z5j    ← 12 chars, 44 chars total
https://expensetracking.online/s/V1StGXR8        ← 8 chars,  40 chars total
```

Nobody types either one; it goes into WhatsApp via the native share sheet as an opaque blob.
Four characters buy 24 bits for zero UX cost. **Keep 12.** Do not shorten it later "for prettier
links" — that would also invalidate every already-sent link.

**Hard requirement:** the token must come from a CSPRNG. `nanoid` v5 uses `crypto.getRandomValues`
(browser/edge) or `crypto.randomFillSync` (node). Never substitute a `Math.random()` id helper;
`Math.random` in V8 is xorshift128+ and is *seed-recoverable from a handful of outputs*, which
would turn 72 bits into approximately zero. Task 2 asserts this.

### 2.3 The share control is one button, and `navigator.share` is fussy about it

The brief is a single tap → native share sheet. Two browser constraints shape the implementation:

- **Transient activation.** `navigator.share()` must be called while a user gesture is still
  "live". Safari's activation window is short and is consumed by `await`ing an unrelated promise.
  A naive `onClick={async () => { const {token} = await createShareLink(id); navigator.share(...) }}`
  works when the server action is fast and throws `NotAllowedError` when it is not — i.e. it fails
  exactly on a bad mobile connection, which is when the user is most likely to be out at dinner.
- **Feature detection is not SSR-safe.** Branching the rendered label on `navigator.share`
  existence causes a hydration mismatch. The button always says **Bagikan**; the branch lives
  entirely inside the handler.

The fix for the first is **warming**: kick off the mint on `pointerdown`, which fires before
`click`. By the time the click handler runs, the token is usually already resolved and
`navigator.share()` is called **synchronously**, preserving activation. If it is not resolved yet
we await it, try anyway, and treat `NotAllowedError` as "fall back to clipboard" rather than as a
failure. After the first mint the token is in component state, so every subsequent tap is
synchronous by construction.

**Error taxonomy in the click handler** — this matters, most of these are not errors:

| Thrown | Meaning | Response |
|---|---|---|
| `AbortError` | user swiped the share sheet away | **nothing.** Not an error. No toast, no log, no state change. |
| `NotAllowedError` | activation was lost, or permissions policy blocks it | clipboard fallback + "Tersalin" |
| `TypeError` / `navigator.share` undefined | desktop browser, or non-secure context | clipboard fallback + "Tersalin" |
| clipboard also fails | iOS clipboard needs activation too | reveal the URL in a read-only, pre-selected input so the user can long-press → Copy |
| server action throws | not the owner / DB down | "Gagal membuat tautan. Coba lagi." |

Silently swallowing `AbortError` is the single most commonly missed detail in Web Share
integrations, and getting it wrong means the user sees a scary red toast every time they change
their mind.

### 2.4 Revoke: destructive, and the copy has to say so

Revoke is `DELETE FROM share_links WHERE group_id = $groupId` (roadmap §4.2). There is no
`revoked_at`, no soft delete, no expiry. Consequences the user must understand *before* they
confirm:

- the link they already sent stops working **immediately**;
- sharing again mints a **different** token — the old URL never comes back;
- so "revoke then re-share" is not a refresh, it is a break-and-replace.

Therefore the confirm is not a generic "Are you sure?". It is an inline two-step (no
`window.confirm` — we need control of the wording) that says exactly what dies:

> **Batalkan tautan?**
> Tautan yang sudah kamu kirim akan langsung mati. Kalau nanti kamu bagikan lagi, tautannya baru —
> yang lama tidak akan hidup lagi.
> [ Ya, batalkan ]  [ Jangan jadi ]

### 2.5 Owner attribution: show nothing, by default

The roadmap permits "a display name". We choose to show **nothing personal**, because the
recipient already knows who sent it — they received it in a WhatsApp thread from that person.
A name on the page adds zero information to the intended reader and adds identity to a *leaked*
reader. The email address is never rendered under any setting.

This is one constant, `SHARE_SHOWS_OWNER_NAME = false` in `lib/share/config.ts`, so the decision
is reversible in one line if the user disagrees after seeing it. When flipped it renders
`users.name` only.

### 2.6 The Open Graph description must not carry the total

WhatsApp fetches the URL server-side and renders a preview card **inline in the chat**. That card
is visible: in the chat bubble, in the recipient's chat-list snippet, on their lock screen
notification, to everyone in a group chat, and to anyone the message is forwarded to. The URL is
the secret; the preview card is not.

So: `title` = the expense title (which the sender typed and is about to say out loud anyway),
`description` = item count and date. **Not the total.**

> `Makan malam di Blok M` · `6 item · Selasa, 18 Agustus 2026`

The nicer-looking alternative — `6 item · Rp 266.350` — publishes the number to a lock screen
before the recipient has even unlocked their phone, and to every other member of a group chat.
The friend is one tap from seeing it anyway; the preview's job is to make the link look
trustworthy and tappable, not to be the payload.

Reversible in one line: `SHARE_PREVIEW_SHOWS_TOTAL = false` in `lib/share/config.ts`, documented
in place with the consequence.

Note also that `generateMetadata` is served to **anyone with the URL**, including link scanners
(Meta's `facebookexternalhit`, Google Safe Browsing, corporate mail gateways). It must therefore
never contain more than the page body does.

### 2.7 No dynamic OG image in v0.1.0

`opengraph-image.tsx` would render a per-link PNG with the title and total. **Defer it**, for
three reasons, in order of weight:

1. **It undermines revoke.** Meta caches scraped preview images on its own CDN, keyed by URL, for
   days. Once WhatsApp has rendered a card with the expense burned into a bitmap, revoking the
   share link does not remove that bitmap from Meta's cache or from the chat thread. Content that
   leaves our origin cannot be revoked. A text-only card degrades to plain text after revoke;
   an image card does not.
2. It is a second unauthenticated route (`/s/[token]/opengraph-image`) with its own caching
   semantics that must be reasoned about separately.
3. `next/og` pulls in satori plus a bundled font and renders per request. Against the roadmap's
   core tenet, that is a lot of machinery for a thumbnail.

Instead ship **one static** `public/og-default.png` (1200×630, app mark on brand background)
referenced from `openGraph.images`. WhatsApp gets a thumbnail, every link gets the same one, and
nothing about the expense leaves our origin as a cached image.

### 2.8 `/s/[token]` is dynamic, always

A revoke must take effect in seconds, so the route must never be served from the Full Route Cache
or a CDN edge. Task 9 sets `export const dynamic = 'force-dynamic'` **and** an explicit
`Cache-Control: private, no-store, max-age=0, must-revalidate` response header, and Task 14
verifies with `curl` that no `x-vercel-cache: HIT` is possible. Belt and braces is warranted here
because the failure mode is invisible: a stale edge copy looks identical to a working page.

### 2.9 Rate limiting: consciously deferred, with the reasoning

Any Google account can sign in (roadmap D3), so "a stranger with an account" is in scope. What
they can actually do with this feature:

- **Mint links.** Bounded by `share_links.group_id UNIQUE` — one link per group, ever. Minting is
  not an amplification vector; to mint 1,000 links you must first create 1,000 groups, and *that*
  costs an LLM call each (F04's rate-limit problem, not this feature's).
- **Hammer `/s/<garbage>`.** Unauthenticated, so no account needed. Burns Vercel function
  invocations and bandwidth on the Hobby plan.

**v0.1.0 ships no application-level rate limiter**, deliberately:

- the free stack has no state store to count against (no Redis, no KV) — adding Upstash for this
  is a new dependency, a new secret, and a new failure mode for a personal app;
- the mint path is already capped by a database constraint;
- the enumeration path is one PK lookup on an indexed 12-char text column, and Task 9 makes
  malformed tokens cost **zero** queries via a regex shape check before the DB call;
- Vercel's platform-level DDoS protection sits in front regardless.

**Documented tripwire.** If Vercel usage alerts fire or the function-invocation graph shows a
sustained flat line of `/s/*` 404s: turn on **Attack Challenge Mode** in the Vercel dashboard
(zero code, takes effect in seconds), and only then consider `@upstash/ratelimit` with a fixed
window on the client IP for `/s/*`. Do not pre-build it.

---

## 3. File manifest

**Created by this plan**

```
lib/share/config.ts                  share constants + shape regex + URL builder
lib/share/token.ts                   mintShareToken() — CSPRNG, 12 chars
lib/share/copy.ts                    clipboard with a manual-selection fallback
lib/share/__tests__/token.test.ts    entropy/alphabet/CSPRNG assertions
app/actions/share.ts                 createShareLink, revokeShareLink   (contract §4.4)
components/share/ShareControl.tsx    the control F07 embeds  (client)
components/share/ShareControl.module.css   (only if F10 has no primitive that fits)
app/s/[token]/layout.tsx             minimal public shell — no TabBar, no header menu
app/s/[token]/page.tsx               the public page + generateMetadata
app/s/[token]/not-found.tsx          neutral 404
app/robots.ts                        allows crawl of /s, indexing blocked by header
public/og-default.png                static preview image
```

**Modified**

```
lib/db/queries.ts        + getShareTokenForGroup(userId, groupId)   [additive, see Contract deltas]
lib/format.ts            + formatJakartaLong(iso)                    [additive]
next.config.ts           + headers() block for /s/:token
app/e/[id]/page.tsx      embed <ShareControl/>                        [F07 integration]
middleware.ts            assertion only — verify /s is not matched    [F02 coordination]
app/(app)/layout.tsx     TabBar moves out of the root layout          [F07/F10 coordination]
components/photos/…      read-only mode for the gallery               [F06 coordination]
```

---

## 4. Tasks

Each task is small enough to verify on its own. Commit checkpoints are explicit; do not batch them.

### Task 1 — Preflight: confirm the ground you are standing on

No code. Confirm every upstream symbol exists and is named as assumed.

```bash
cd /home/miftah/expense-tracking

# 4.4 actions file must not already exist with a conflicting share.ts
ls app/actions/

# F03: table + query exports
grep -n "shareLinks\|share_links" lib/db/schema.ts
grep -n "export .*getGroupByShareToken" lib/db/queries.ts
grep -n "export .*newId\|nanoid" lib/db/ids.ts lib/db/*.ts

# F02: the auth helper and the middleware matcher
grep -n "export .*requireUserId" lib/auth/*.ts auth.ts 2>/dev/null
sed -n '1,80p' middleware.ts

# F06: what the gallery is called and what props it takes
grep -rn "export function\|export default function" components/photos/

# F10: primitives
grep -rn "export function Button\|export function Card\|export function Money" components/ui/

# F07: the detail page, to find the embed point
sed -n '1,120p' app/e/\[id\]/page.tsx
```

**Expected:** every grep returns at least one line. Record the actual names in a scratch note and
substitute them throughout this plan where they differ.

**Blocking findings to escalate rather than work around:**

- `getGroupByShareToken` takes a `userId` argument → F03 misread the contract; it must not.
- `middleware.ts` matcher matches `/s` → see Task 11, must be fixed before `/s` can work at all.
- The photo gallery has no way to render without delete affordances → see Task 12.

---

### Task 2 — `lib/share/config.ts` and `lib/share/token.ts`

Two tiny modules so that every policy decision from §2 has exactly one place to live.

**`lib/share/config.ts`**

```ts
/**
 * Share-link policy constants (F09).
 *
 * Everything here is a product decision, not an implementation detail. If you are
 * changing a value, read docs/plans/F09-sharing.md §2 first — each one has a reason.
 */

/** Token length in characters. 12 over nanoid's 64-char alphabet = 2^72. See §2.2. */
export const SHARE_TOKEN_LENGTH = 12

/**
 * Shape of a valid token. Used to reject malformed tokens on /s/[token] BEFORE
 * touching the database, so enumeration with garbage costs us zero queries. §2.9.
 * Must stay in sync with nanoid's default URL-safe alphabet.
 */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{12}$/

/**
 * Put the total in the WhatsApp preview card?
 *
 * false (default) — the card shows "6 item · Selasa, 18 Agustus 2026". The rupiah
 * number stays behind the tap.
 * true            — nicer card, but the amount appears on the recipient's lock
 * screen, in their chat list, to every member of a group chat, and in every
 * forward of that message. See §2.6.
 */
export const SHARE_PREVIEW_SHOWS_TOTAL = false

/**
 * Show the owner's display name on the public page?
 *
 * false (default) — the recipient already knows who sent it; a name only adds
 * identity to a leaked link. The email is never rendered under any setting. §2.5.
 */
export const SHARE_SHOWS_OWNER_NAME = false

/** Absolute origin, needed because navigator.share and OG tags both require a full URL. */
export function appOrigin(): string {
  // AUTH_URL is validated in lib/env.ts (roadmap §4.8) and is set in prod.
  // In dev, fall back to localhost so the share sheet still produces a tappable link.
  return process.env.AUTH_URL ?? 'http://localhost:3000'
}

/** The canonical public URL for a token. The one place this string is built. */
export function shareUrl(token: string): string {
  return `${appOrigin()}/s/${token}`
}
```

> `appOrigin()` reads `process.env` directly rather than importing `lib/env.ts`, because
> `shareUrl` is also called from the **client** component in Task 5. If `lib/env.ts` exports a
> client-safe subset, import that instead. If `AUTH_URL` is server-only in your F01 setup, pass
> the origin down as a prop from the server component in Task 6 rather than reading it in the
> browser — do **not** reach for `window.location.origin`, which would produce a preview-deploy
> URL when the user shares from a Vercel preview.

**`lib/share/token.ts`**

```ts
import { nanoid } from 'nanoid'
import { SHARE_TOKEN_LENGTH } from './config'

/**
 * Mint a share token.
 *
 * nanoid v5 draws from crypto.getRandomValues / crypto.randomFillSync — a CSPRNG.
 * NEVER swap this for a Math.random()-based helper: V8's Math.random is xorshift128+
 * and its state is recoverable from a handful of outputs, which would reduce 72 bits
 * of entropy to approximately zero. See docs/plans/F09-sharing.md §2.2.
 */
export function mintShareToken(): string {
  return nanoid(SHARE_TOKEN_LENGTH)
}
```

**`lib/share/__tests__/token.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { mintShareToken } from '../token'
import { SHARE_TOKEN_RE, shareUrl } from '../config'

describe('share tokens', () => {
  it('is 12 URL-safe characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(mintShareToken()).toMatch(SHARE_TOKEN_RE)
    }
  })

  it('never needs percent-encoding in a URL', () => {
    for (let i = 0; i < 200; i++) {
      const t = mintShareToken()
      expect(encodeURIComponent(t)).toBe(t)
    }
  })

  it('does not repeat across a large sample', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20_000; i++) seen.add(mintShareToken())
    expect(seen.size).toBe(20_000)
  })

  it('builds an absolute URL', () => {
    expect(shareUrl('V1StGXR8_Z5j')).toMatch(/^https?:\/\/.+\/s\/V1StGXR8_Z5j$/)
  })
})
```

```bash
npm run test -- lib/share
```

**Expected:** 4 passing tests.

---

### Task 3 — Commit

```bash
git add lib/share
git commit -m "F09: share token minting, policy constants, unit tests"
```

---

### Task 4 — `app/actions/share.ts`

The contract surface from roadmap §4.4. Read §2.1 before editing this file.

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { expenseGroups, shareLinks } from '@/lib/db/schema'
import { requireUserId } from '@/lib/auth/requireUserId'
import { mintShareToken } from '@/lib/share/token'

const MAX_MINT_ATTEMPTS = 3

/**
 * Ownership gate. Every share action goes through this before touching share_links.
 *
 * Without it, any signed-in Google account (roadmap D3 — anyone may sign in) could
 * publish a stranger's expenses by guessing a group id. This is the userId-scoping
 * invariant of roadmap §4.4 applied to this feature.
 */
async function assertOwnsGroup(userId: string, groupId: string): Promise<void> {
  const [row] = await db
    .select({ id: expenseGroups.id })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.id, groupId), eq(expenseGroups.userId, userId)))
    .limit(1)

  // Same error for "does not exist" and "belongs to someone else": do not let the
  // caller distinguish, or the action becomes a group-id oracle.
  if (!row) throw new Error('Pengeluaran tidak ditemukan.')
}

async function selectTokenForGroup(groupId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .where(eq(shareLinks.groupId, groupId))
    .limit(1)
  return row?.token ?? null
}

/**
 * Get-or-create the public link for a group. Contract: roadmap §4.4.
 *
 * IDEMPOTENT BY DESIGN. Calling this twice returns the SAME token, because a link the
 * user already sent to a friend must keep working. share_links.group_id is UNIQUE and
 * that constraint is the product rule, not just a storage detail. See §2.1.
 */
export async function createShareLink(groupId: string): Promise<{ token: string }> {
  const userId = await requireUserId()
  await assertOwnsGroup(userId, groupId)

  // 1. Fast path — a link already exists. No write, no cache invalidation, no churn.
  const existing = await selectTokenForGroup(groupId)
  if (existing) return { token: existing }

  // 2. Mint. onConflictDoNothing() with NO target absorbs both unique constraints:
  //      share_links_pkey            → token collision (2^-72, effectively never)
  //      share_links_group_id_unique → someone else minted first (double-tap, two tabs)
  //    A zero-row result is then disambiguated by re-reading on group_id.
  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const token = mintShareToken()

    const inserted = await db
      .insert(shareLinks)
      .values({ token, groupId })
      .onConflictDoNothing()
      .returning({ token: shareLinks.token })

    if (inserted.length === 1) {
      revalidatePath(`/e/${groupId}`)
      return { token: inserted[0].token }
    }

    // Conflict. Which one?
    const raced = await selectTokenForGroup(groupId)
    if (raced) {
      // group_id UNIQUE fired: a concurrent mint won. Its token is the real one.
      // Returning it (rather than erroring) is what makes a double-tap harmless.
      return { token: raced }
    }
    // Otherwise the PK fired: a token collision. Loop with a fresh token.
  }

  throw new Error('Gagal membuat tautan. Coba lagi.')
}

/**
 * Revoke = DELETE the row (roadmap §4.2). No soft delete, no revoked_at, no expiry.
 * The URL 404s immediately and re-sharing mints a DIFFERENT token — the old one is gone
 * for good. The UI copy in components/share/ShareControl.tsx says so explicitly.
 *
 * Idempotent: revoking a group with no link is a no-op, not an error, so a double-tap
 * or a stale tab cannot produce a scary message.
 */
export async function revokeShareLink(groupId: string): Promise<void> {
  const userId = await requireUserId()
  await assertOwnsGroup(userId, groupId)

  await db.delete(shareLinks).where(eq(shareLinks.groupId, groupId))

  revalidatePath(`/e/${groupId}`)
}
```

> **Why no `revalidatePath('/s/<token>')` on revoke.** `/s/[token]` is `force-dynamic`
> (Task 9), so it is never in the Full Route Cache and there is nothing to invalidate.
> Revalidating a path that does not exist any more would also be a no-op. If you find
> yourself needing this call, `/s` has accidentally become cacheable — go fix that instead.

**Verify it compiles and the ownership gate is really there:**

```bash
npx tsc --noEmit
grep -c "assertOwnsGroup(userId" app/actions/share.ts   # expect: 3  (1 def + 2 calls)
grep -c "requireUserId()" app/actions/share.ts          # expect: 2
```

---

### Task 5 — `lib/db/queries.ts`: read the owner's current token

The owner's `/e/[id]` page needs to know whether a link already exists, so it can render either
"Bagikan" alone or "Bagikan" plus the status/revoke row. This is a **userId-scoped** read and
therefore belongs with F03's other queries.

Append to `lib/db/queries.ts`:

```ts
/**
 * The owner's current share token for a group, or null.
 *
 * userId-scoped via the join on expense_groups.user_id — this is an OWNER-side read and
 * follows the normal invariant. (Contrast getGroupByShareToken below, which is the one
 * deliberate exception.)
 */
export async function getShareTokenForGroup(
  userId: string,
  groupId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .innerJoin(expenseGroups, eq(expenseGroups.id, shareLinks.groupId))
    .where(and(eq(shareLinks.groupId, groupId), eq(expenseGroups.userId, userId)))
    .limit(1)
  return row?.token ?? null
}
```

Also **wrap `getGroupByShareToken` in React `cache()`** if F03 has not already. `/s/[token]`
calls it twice per request — once in `generateMetadata`, once in the page — and without
request-level memoisation that is two round trips to Neon for every preview scrape and every
page view:

```ts
import { cache } from 'react'

export const getGroupByShareToken = cache(
  async (token: string): Promise<SharedGroup | null> => {
    /* ...F03's implementation... */
  },
)
```

> If F03 declines to change its export, wrap it locally in `app/s/[token]/page.tsx` instead:
> `const loadShared = cache((t: string) => getGroupByShareToken(t))` and call `loadShared`
> from both `generateMetadata` and the page. Same effect, scoped to this feature.

**Shape required from `getGroupByShareToken`** (F03 owns it; this is what `/s` consumes):

```ts
export type SharedGroup = {
  id: string
  title: string
  occurredOn: string            // 'YYYY-MM-DD'
  note: string | null
  totalIdr: number              // SQL SUM, per roadmap D7 — never a stored column
  items: Array<{
    id: string
    name: string
    amountIdr: number
    category: Category
    sortOrder: number
  }>
  photos: Array<{
    id: string
    blobUrl: string
    width: number | null
    height: number | null
    sortOrder: number
  }>
  ownerName: string | null      // rendered only if SHARE_SHOWS_OWNER_NAME; never the email
}
```

**Fields that must NOT be in this projection** — flag to F03 if they are:

| Field | Why not |
|---|---|
| `userId` | identifies the owner; nothing on the public page needs it |
| `users.email` | never leaves the owner's own session |
| `rawText` | the original free-text paste. May contain anything the user typed and did not mean to publish. There is no UI for it on `/s`, so it must not be in the payload either. |
| `blobPathname` | the `del()` handle for a blob. Harmless without auth, but there is no reason to ship it. |
| `createdAt` / `updatedAt` | timing metadata, no product use on this page |

**Verify:**

```bash
npx tsc --noEmit
# The exception must be documented at the definition site, per F03's own charter:
grep -n -B4 "getGroupByShareToken" lib/db/queries.ts
```

**Expected:** a comment above `getGroupByShareToken` explicitly stating that it is the only
query in the application not scoped by `userId`, and why (the token *is* the authorisation).
If that comment is missing, add it:

```ts
/**
 * ⚠️ THE ONLY QUERY IN THIS APPLICATION NOT SCOPED BY userId. ⚠️
 *
 * Authorisation here is the token itself: a 72-bit unguessable secret (F09 §2.2). There is
 * no session on /s/[token] — by design, that is the one public route (roadmap §4.6).
 *
 * Consequences, all of them intentional:
 *   - a DELETEd share_links row makes this return null → the page 404s. That is revoke.
 *   - the projection must contain NOTHING that is not meant to be public. No userId, no
 *     email, no rawText. See docs/plans/F09-sharing.md §5.
 *   - do not add a "convenience" overload that takes a userId; do not reuse this helper
 *     anywhere an owner-side query belongs.
 */
```

---

### Task 6 — Commit

```bash
git add app/actions/share.ts lib/db/queries.ts
git commit -m "F09: createShareLink (idempotent get-or-create) + revokeShareLink"
```

---
### Task 7 — `lib/share/copy.ts` and `lib/format.ts` addition

**`lib/share/copy.ts`** — the clipboard fallback, and the fallback's fallback.

```ts
/**
 * Copy text, returning whether it worked.
 *
 * Two paths, because iOS Safari's async Clipboard API also requires transient user
 * activation and will reject if the calling gesture has expired — which is precisely
 * the case where we arrive here (see F09 §2.3).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  // Legacy: a hidden, selected textarea + execCommand. Works in non-secure contexts
  // and on older WebKit. Deprecated, but it is the last thing between the user and
  // "copy this by hand".
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '-1000px'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    el.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}
```

**Append to `lib/format.ts`:**

```ts
const JAKARTA_LONG = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TZ,
})

/** '2026-08-18' → 'Selasa, 18 Agustus 2026'. */
export function formatJakartaLong(iso: string): string {
  // occurred_on is a `date` column with no time (roadmap D10). Anchor it at Jakarta
  // midnight so the formatter can never roll it to the adjacent day.
  return JAKARTA_LONG.format(new Date(`${iso}T00:00:00+07:00`))
}
```

```bash
node -e "process.env.TZ='UTC'; console.log(new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date('2026-08-18T00:00:00+07:00')))"
```

**Expected:** `Selasa, 18 Agustus 2026` — and the same output with `TZ=America/New_York`, which is
the point of the anchor.

---

### Task 8 — `components/share/ShareControl.tsx`

This is the single interface F07 embeds. Read §2.3 and §2.4 before touching the handlers.

```tsx
'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createShareLink, revokeShareLink } from '@/app/actions/share'
import { shareUrl } from '@/lib/share/config'
import { copyText } from '@/lib/share/copy'
import { formatJakartaLong } from '@/lib/format'
import { Button } from '@/components/ui/Button'

export type ShareControlProps = {
  groupId: string
  /** Group title — becomes the share sheet's title and the first line of its text. */
  title: string
  /** 'YYYY-MM-DD'. Only used to compose the share sheet's text line. */
  occurredOn: string
  /**
   * The token that already exists for this group at render time, or null.
   * Loaded server-side by /e/[id] via getShareTokenForGroup so the revoke row is
   * present on first paint — no loading flash, no client fetch on mount.
   */
  initialToken: string | null
}

type Toast = { kind: 'ok' | 'error'; text: string }

/** WebKit reports a dismissed share sheet as AbortError. That is a user choice, not a failure. */
function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

export function ShareControl({ groupId, title, occurredOn, initialToken }: ShareControlProps) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  /** Set only when both navigator.share AND the clipboard failed: show the URL to copy by hand. */
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [revoking, startRevoke] = useTransition()

  /** In-flight mint, so pointerdown-warming and the click handler share one request. */
  const mintRef = useRef<Promise<string> | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  const ensureToken = useCallback((): Promise<string> => {
    if (token) return Promise.resolve(token)
    if (!mintRef.current) {
      mintRef.current = createShareLink(groupId)
        .then(({ token: minted }) => {
          setToken(minted)
          return minted
        })
        .catch((err) => {
          mintRef.current = null // let the next tap retry
          throw err
        })
    }
    return mintRef.current
  }, [groupId, token])

  /**
   * Warm the mint on pointerdown, which fires before click.
   *
   * navigator.share() requires transient user activation, and WebKit's activation window
   * is a few seconds long. If we only start the server round trip inside the click handler,
   * a slow mobile connection can outlast that window and Safari rejects with NotAllowedError.
   * Warming here means the token is normally already resolved by the time click runs, so
   * share() is invoked essentially immediately. See F09 §2.3.
   */
  const warm = useCallback(() => {
    if (token || revoking) return
    void ensureToken().catch(() => {
      /* swallow — the click handler will surface the failure with a message */
    })
  }, [ensureToken, token, revoking])

  async function onShare() {
    if (sharing) return
    setSharing(true)
    setToast(null)
    setManualUrl(null)

    let active = token
    if (!active) {
      try {
        active = await ensureToken()
      } catch {
        setToast({ kind: 'error', text: 'Gagal membuat tautan. Coba lagi.' })
        setSharing(false)
        return
      }
    }

    const url = shareUrl(active)
    const payload = {
      title,
      text: `${title} — ${formatJakartaLong(occurredOn)}`,
      url,
    }

    // Feature-detect inside the handler, never in render: branching the rendered output
    // on navigator.share would produce a hydration mismatch.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload)
        // Shared. The OS already gave feedback; a toast on top of it is noise.
        setSharing(false)
        return
      } catch (err) {
        if (isAbortError(err)) {
          // The user opened the sheet and changed their mind. Do nothing at all:
          // no toast, no error state, no log. This is the normal cancel path.
          setSharing(false)
          return
        }
        // NotAllowedError (activation expired, or a permissions policy blocks sharing),
        // TypeError, or anything else → clipboard.
      }
    }

    const copied = await copyText(url)
    if (copied) setToast({ kind: 'ok', text: 'Tersalin' })
    else setManualUrl(url) // last resort: let them long-press → Copy

    setSharing(false)
  }

  function onRevoke() {
    startRevoke(async () => {
      try {
        await revokeShareLink(groupId)
        setToken(null)
        // Critical: drop the cached mint promise, otherwise the next Bagikan would
        // resolve to the token we just deleted.
        mintRef.current = null
        setConfirmingRevoke(false)
        setManualUrl(null)
        setToast({ kind: 'ok', text: 'Tautan dibatalkan' })
      } catch {
        setToast({ kind: 'error', text: 'Gagal membatalkan tautan. Coba lagi.' })
      }
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <Button
        type="button"
        variant="secondary"
        onPointerDown={warm}
        onClick={onShare}
        disabled={sharing || revoking}
      >
        Bagikan
      </Button>

      {token && !confirmingRevoke && (
        <div className="flex flex-col gap-2 rounded-xl bg-[--color-surface-2] p-3">
          <p className="text-sm text-[--color-text-muted]">
            Tautan aktif. Siapa pun yang punya tautan ini bisa melihat pengeluaran ini tanpa masuk.
          </p>
          <button
            type="button"
            className="self-start text-sm font-medium text-[--color-danger]"
            onClick={() => setConfirmingRevoke(true)}
            disabled={revoking}
          >
            Batalkan tautan
          </button>
        </div>
      )}

      {token && confirmingRevoke && (
        <div className="flex flex-col gap-2 rounded-xl bg-[--color-surface-2] p-3">
          <p className="text-sm font-semibold">Batalkan tautan?</p>
          <p className="text-sm text-[--color-text-muted]">
            Tautan yang sudah kamu kirim akan langsung mati. Kalau nanti kamu bagikan lagi,
            tautannya baru — yang lama tidak akan hidup lagi.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="danger" onClick={onRevoke} disabled={revoking}>
              {revoking ? 'Membatalkan…' : 'Ya, batalkan'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingRevoke(false)}
              disabled={revoking}
            >
              Jangan jadi
            </Button>
          </div>
        </div>
      )}

      {manualUrl && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[--color-text-muted]">Salin tautannya sendiri:</span>
          <input
            readOnly
            value={manualUrl}
            onFocus={(e) => e.currentTarget.select()}
            // 16px minimum, or iOS Safari zooms the viewport on focus (F10).
            className="w-full rounded-lg border p-2 text-base"
          />
        </label>
      )}

      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {toast && (
          <span className={toast.kind === 'ok' ? 'text-[--color-text-muted]' : 'text-[--color-danger]'}>
            {toast.text}
          </span>
        )}
      </p>
    </section>
  )
}
```

> **On `Button` props.** If F10's `Button` does not forward `onPointerDown` or does not have a
> `danger` / `ghost` variant, either extend it (preferred — other features will want the same)
> or drop to a plain `<button>` with the same token classes here. Do **not** wrap `Button` in a
> `<div onPointerDown>` — the warm must fire on the actual control.
>
> **On the toast.** F10's primitive list has no `Toast`, so this is a local `aria-live` region
> rather than a new global contract. It reserves `min-h-5` so appearing text does not shift the
> layout. If F10 later publishes a real toast, swap it in; nothing else changes.

**Verify:**

```bash
npx tsc --noEmit
npm run lint
grep -n "AbortError" components/share/ShareControl.tsx   # the cancel path must exist
grep -n "mintRef.current = null" components/share/ShareControl.tsx  # expect 2 (catch + revoke)
```

---

### Task 9 — Embed it on `/e/[id]` (F07 integration)

The detail page loads the current token server-side so the revoke row is on the first paint.

In `app/e/[id]/page.tsx`, inside the existing server component:

```tsx
import { getGroupDetail, getShareTokenForGroup } from '@/lib/db/queries'
import { requireUserId } from '@/lib/auth/requireUserId'
import { ShareControl } from '@/components/share/ShareControl'

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await requireUserId()

  // Two independent reads → run them together.
  const [group, shareToken] = await Promise.all([
    getGroupDetail(userId, id),
    getShareTokenForGroup(userId, id),
  ])
  if (!group) notFound()

  return (
    <main>
      {/* …F07's title, date, items, photos, delete… */}

      <ShareControl
        groupId={group.id}
        title={group.title}
        occurredOn={group.occurredOn}
        initialToken={shareToken}
      />
    </main>
  )
}
```

Place `ShareControl` **below** the photo gallery and **above** the destructive "Hapus pengeluaran"
action, so the two red affordances (`Batalkan tautan`, `Hapus pengeluaran`) are not adjacent.

```bash
npm run dev
# Visit /e/<some id>. Expect: a "Bagikan" button, no status row (no link yet).
```

---

### Task 10 — Commit

```bash
git add components/share lib/share/copy.ts lib/format.ts app/e
git commit -m "F09: ShareControl — native share sheet, clipboard fallback, revoke confirm"
```

---
### Task 11 — Coordinate with F02: `/s` must not be behind the middleware

**This is a hard dependency and the feature is entirely non-functional without it.** Roadmap §4.6
makes `/s/[token]` the only unauthenticated app route; F02's charter already says the matcher is
"explicitly **not** `/s`". Verify, and if it is wrong, fix it in `middleware.ts` and tell the F02
owner.

Required form — an **allowlist of protected prefixes**, never a deny-all with a negative
lookahead:

```ts
// middleware.ts  (F02 owns this file)
export const config = {
  matcher: [
    '/new/:path*',
    '/m/:path*',
    '/e/:path*',
    '/stats/:path*',
  ],
}
```

> **Why not the common `'/((?!api|_next|static|.*\\..*).*)'` catch-all.** A negative-lookahead
> matcher protects everything and then carves out exceptions, so `/s` is protected unless someone
> remembers to add it — and the failure is silent-ish (the friend gets bounced to a Google sign-in
> page instead of the expense). An allowlist fails the other way: forget to add a route and it is
> *unprotected*, which is why every entry above must be checked. For this app the allowlist is
> four lines and complete; prefer it, and keep `/s` structurally outside it rather than as an
> exception clause.

Also confirm nothing else redirects `/s`: no `redirect()` in the root layout, no `auth()` call in
`app/layout.tsx`, no `/` → `/m/<month>` rule that could catch it.

**Verify (dev, signed out — use a fresh incognito profile or `curl`, which sends no cookies):**

```bash
npm run dev

# Must be 200/404 from the page, never 302/307 to a sign-in page.
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/s/aaaaaaaaaaaa
# expected: 404   (route reachable, token unknown)

# And the protected routes must still bounce:
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/e/aaaaaaaaaaaa
# expected: 307 http://localhost:3000/api/auth/signin?...   (or F02's sign-in path)
```

If the first command returns a 3xx, stop and fix the matcher. Nothing downstream will work.

---

### Task 12 — Layout isolation: the tab bar must not exist on `/s`

A nested layout cannot remove something the **root** layout rendered. If `TabBar` lives in
`app/layout.tsx`, the public page will show a bottom bar with **Bulan Ini / Tambah / Statistik** —
three links straight into the owner's private data, on a page a stranger is looking at. They would
all bounce to sign-in, so nothing leaks, but it advertises the owner's account and looks broken.

**Preferred fix — a route group** (coordinate with F07/F10):

```
app/
  layout.tsx                 <html>, <body>, fonts, theme tokens.  NO TabBar, NO header menu.
  (app)/
    layout.tsx               TabBar + safe-area padding + signed-in header
    m/[month]/page.tsx
    e/[id]/page.tsx
    new/page.tsx
    stats/page.tsx
  s/
    [token]/
      layout.tsx             minimal public shell
      page.tsx
      not-found.tsx
```

Route groups do not affect URLs, so `/m/2026-08` stays `/m/2026-08`. Moving four page files is a
one-commit refactor; do it now rather than discovering it at QA.

**Fallback if F10 has already shipped `TabBar` in the root layout and a refactor is too disruptive:**
make `TabBar` a client component that hides itself.

```tsx
'use client'
import { usePathname } from 'next/navigation'

export function TabBar() {
  const pathname = usePathname()
  // /s/[token] is the public route (roadmap §4.6). It must show no navigation into
  // the owner's data. See docs/plans/F09-sharing.md §Task 12.
  if (pathname.startsWith('/s/')) return null
  return (/* …tabs… */)
}
```

This is strictly worse — it ships the tab bar's markup and links into the public bundle and relies
on a runtime string check — but it is correct and it unblocks. Prefer the route group.

**`app/s/[token]/layout.tsx`:**

```tsx
import type { ReactNode } from 'react'

/**
 * Public shell for /s/[token].
 *
 * Deliberately empty of chrome: no tab bar, no header menu, no sign-in prompt, no link
 * to any authenticated route. The only outbound link on this page is the footer's "/".
 */
export default function ShareLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-6">
      {children}
    </div>
  )
}
```

**Verify:**

```bash
grep -rn "TabBar" app/layout.tsx        # expected: no matches
```

---

### Task 13 — Coordinate with F06: a read-only photo gallery

The public page must render photos with a lightbox and **no delete affordance**.

**Requested contract (minimum):** F06's gallery accepts a `readOnly` prop.

```tsx
<PhotoGallery photos={photos} readOnly />
```

```ts
export type PhotoGalleryProps = {
  photos: GalleryPhoto[]
  /**
   * When true the gallery is a viewer only: no delete button on the thumbnail, no delete
   * action in the lightbox, no long-press action menu, no drag-to-reorder. Used by
   * /s/[token] (F09), which is public and unauthenticated. Default false.
   */
  readOnly?: boolean
}
```

**Strongly preferred contract — split the component instead.** With a single component the
public page's client bundle still contains an import of the `deletePhoto` **server action**, which
means that action's ID is discoverable in JavaScript served to anonymous visitors. It is not
*exploitable* — `deletePhoto` starts with `requireUserId()` and would reject — but it publishes a
callable POST endpoint on a page that should have no mutation surface at all, and it makes the
security story depend on a guard in another file rather than on the absence of a wire.

```
components/photos/PhotoGrid.tsx        presentational: thumbnails + lightbox + pinch zoom.
                                       Imports NO server actions. Used by /s and by /e.
components/photos/PhotoManager.tsx     wraps PhotoGrid, adds upload/delete/reorder.
                                       Imports deletePhoto. Used ONLY by /e and /new.
```

`/s/[token]` then imports `PhotoGrid` and there is physically nothing to call.

**Fallback if F06 ships only the monolith:** accept `readOnly`, and verify by inspection that the
public build does not expose a mutation the guard would miss:

```bash
npm run build
# No server-action reference should appear in the chunks the /s route loads:
grep -rl "deletePhoto\|deleteExpense\|updateItem" .next/static/chunks/ | head
# Cross-check which of those chunks /s actually loads, in DevTools → Network on /s/<token>.
```

Whatever the outcome, `deletePhoto` and every other action must keep its `requireUserId()` first
line. Defence in depth, not instead of.

---

### Task 14 — `app/s/[token]/page.tsx` — the public page

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGroupByShareToken } from '@/lib/db/queries'
import { PhotoGrid } from '@/components/photos/PhotoGrid'
import { CATEGORY_META } from '@/lib/categories'
import { formatIdr, formatJakartaLong } from '@/lib/format'
import {
  SHARE_PREVIEW_SHOWS_TOTAL,
  SHARE_SHOWS_OWNER_NAME,
  SHARE_TOKEN_RE,
  shareUrl,
} from '@/lib/share/config'

/**
 * DYNAMIC, ALWAYS.
 *
 * Revoking a share link is a DELETE (roadmap §4.2) and must take effect within seconds.
 * If this route were prerendered into the Full Route Cache, or held by a CDN edge, a
 * revoked link would keep serving the expense from a copy we no longer control — and the
 * failure would be invisible, because a stale page looks exactly like a working one.
 *
 * Backed up by an explicit Cache-Control header in next.config.ts. Do NOT add "use cache",
 * unstable_cache, generateStaticParams, or a revalidate > 0 to this route. See F09 §2.8.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = { params: Promise<{ token: string }> }

/**
 * getGroupByShareToken is wrapped in React cache() (Task 5), so calling load() from both
 * generateMetadata and the page costs ONE database round trip per request, not two.
 */
async function load(token: string) {
  // Shape-check before the database. A malformed token — which is what enumeration and
  // crawler noise look like — then costs us zero queries. F09 §2.9.
  if (!SHARE_TOKEN_RE.test(token)) return null
  return getGroupByShareToken(token)
}

export default async function SharedExpensePage({ params }: Props) {
  const { token } = await params
  const group = await load(token)

  /**
   * Unknown token and revoked token produce the SAME plain 404.
   *
   * Never "tautan ini sudah dibatalkan" — that confirms the id once existed, turns this
   * route into an oracle, and tells a finder of an old link that there is something to
   * go looking for. One response, no information. F09 §7.
   */
  if (!group) notFound()

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-tight">{group.title}</h1>
        <p className="text-sm text-[--color-text-muted]">{formatJakartaLong(group.occurredOn)}</p>
        {SHARE_SHOWS_OWNER_NAME && group.ownerName && (
          <p className="text-sm text-[--color-text-muted]">oleh {group.ownerName}</p>
        )}
      </header>

      {group.note && <p className="text-sm text-[--color-text-muted]">{group.note}</p>}

      <ul className="flex flex-col divide-y divide-[--color-border]">
        {group.items.map((item) => {
          const meta = CATEGORY_META[item.category]
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="shrink-0">{meta.emoji}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.name}</span>
                  <span className="text-xs text-[--color-text-muted]">{meta.label}</span>
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatIdr(item.amountIdr)}</span>
            </li>
          )
        })}
      </ul>

      <div className="flex items-baseline justify-between border-t border-[--color-border] pt-3">
        <span className="text-sm text-[--color-text-muted]">Total</span>
        <span className="text-xl font-semibold tabular-nums">{formatIdr(group.totalIdr)}</span>
      </div>

      {group.photos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-[--color-text-muted]">Foto</h2>
          {/* Read-only: PhotoGrid imports no server actions at all. See Task 13. */}
          <PhotoGrid photos={group.photos} />
        </section>
      )}

      <footer className="mt-auto pt-8 text-center text-xs text-[--color-text-muted]">
        <Link href="/" className="underline underline-offset-2">
          Dibagikan via expensetracking.online
        </Link>
      </footer>
    </main>
  )
}
```

**What this page must never render** — treat this as a checklist during review, not prose:

- [ ] no edit control of any kind: no inline-editable field, no add-item, no delete, no category picker
- [ ] no `<form action={serverAction}>`, no client component that imports from `app/actions/`
- [ ] no bottom tab bar, no header menu, no sign-out, no "Masuk" button
- [ ] no link to `/m/…`, `/e/…`, `/new`, `/stats` — the **only** outbound link is the footer's `/`
- [ ] no owner email, no `userId`, no avatar, no `rawText`
- [ ] no evidence that other groups exist: no counts, no "lihat semua", no month navigation
- [ ] no group id in the URL or in a visible attribute (the token is the identifier here)

**`app/s/[token]/not-found.tsx`:**

```tsx
import Link from 'next/link'

/**
 * One response for "never existed" and for "revoked". Do not add a second variant, and do
 * not word this so it hints that the link once worked. F09 §7.
 */
export default function ShareNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-semibold">Tautan tidak ditemukan</h1>
      <p className="text-sm text-[--color-text-muted]">
        Tautan ini tidak berlaku. Coba minta tautan baru ke pengirimnya.
      </p>
      <Link href="/" className="text-sm underline underline-offset-2">
        expensetracking.online
      </Link>
    </main>
  )
}
```

---

### Task 15 — `generateMetadata` and the WhatsApp preview

Append to `app/s/[token]/page.tsx` (above the default export):

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const group = await load(token) // React cache() — no extra query

  const robots = {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  } as const

  if (!group) {
    return { title: 'Tautan tidak ditemukan', robots }
  }

  const when = formatJakartaLong(group.occurredOn)
  const count = `${group.items.length} item`

  /**
   * The description is rendered by WhatsApp INSIDE THE CHAT — visible in the bubble, in the
   * recipient's chat list, on their lock screen, to every member of a group chat, and in
   * every forward. The URL is the secret; this card is not.
   *
   * So: item count and date, not the rupiah total. Flip SHARE_PREVIEW_SHOWS_TOTAL in
   * lib/share/config.ts if the user decides they want the nicer card and accepts that the
   * amount appears on a lock screen. See F09 §2.6.
   */
  const description = SHARE_PREVIEW_SHOWS_TOTAL
    ? `${count} · ${formatIdr(group.totalIdr)} · ${when}`
    : `${count} · ${when}`

  const url = shareUrl(token)

  return {
    title: `${group.title} · Expense Tracking`,
    description,
    robots,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName: 'expensetracking.online',
      title: group.title,
      description,
      url,
      // One STATIC image for every link. A per-link opengraph-image.tsx would burn the
      // expense into a bitmap that Meta caches on its own CDN for days — surviving a
      // revoke, in a place we cannot reach. See F09 §2.7.
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Expense Tracking' }],
    },
    twitter: { card: 'summary', title: group.title, description },
  }
}
```

Create `public/og-default.png` — 1200×630, the app mark on the brand background from F10's tokens.
Export it once from the Claude Design project (roadmap §7); it never changes per link.

**Verify locally:**

```bash
npm run dev
# Mint a link through the UI first, then:
TOKEN=<paste it>
curl -s "http://localhost:3000/s/$TOKEN" | grep -oE '<meta [^>]*(og:|name="description"|name="robots")[^>]*>'
```

**Expected:** `og:title` = the group title, `og:description` = `6 item · Selasa, 18 Agustus 2026`
with **no rupiah figure**, `og:image` = `/og-default.png`, `robots` = `noindex, nofollow`.

---
### Task 16 — Response headers and `robots.ts`

Metadata `robots` alone is not enough. It only exists once a crawler has parsed the HTML, it does
not stop intermediary caches, and it does nothing about `noarchive`. Add the header too.

**`next.config.ts`** (F01 owns the file — this block is additive):

```ts
const nextConfig: NextConfig = {
  // …existing config…
  async headers() {
    return [
      {
        source: '/s/:token',
        headers: [
          /**
           * Revoke must be immediate. `private` keeps it out of every shared cache;
           * `no-store` keeps it out of disk; `must-revalidate` closes the stale-while-error
           * door. Belongs here as well as in the route segment config, because a header is
           * what the CDN actually reads. F09 §2.8.
           */
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
          /**
           * An unguessable URL that gets indexed is no longer unguessable. This covers the
           * cases the <meta> tag cannot: non-HTML responses, and archivers that honour the
           * header. `noarchive` additionally asks search engines not to keep a cached copy —
           * which would outlive a revoke.
           */
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          /**
           * Photos are served from *.public.blob.vercel-storage.com. Modern browsers already
           * default to this policy, so the cross-origin image request sends only our origin
           * and not the token-bearing path — but state it rather than inherit it.
           */
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}
```

**`app/robots.ts`:**

```ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated routes. Crawlers get bounced by middleware anyway; this just
        // stops them wasting invocations.
        disallow: ['/api/', '/new', '/m/', '/e/', '/stats'],
      },
    ],
  }
}
```

> **Deliberately NOT `disallow: '/s/'`, and this is the subtle bit.**
>
> `robots.txt` governs *fetching*, `noindex` governs *indexing*, and they trade off in opposite
> directions here:
>
> - Disallowing `/s/` would block `facebookexternalhit` — Meta's crawler honours robots.txt — and
>   **the WhatsApp preview card would disappear**, which is a feature the user explicitly wants.
> - Worse, it does not even achieve the goal: Google can still index a URL it learns about from
>   elsewhere without crawling it, listing it URL-only. Disallow prevents it from *seeing* the
>   `noindex` it would otherwise obey.
>
> So: allow the fetch, forbid the index. `X-Robots-Tag: noindex` + `<meta name="robots">` give a
> hard guarantee against indexing, and the preview keeps working. Do not "tighten" this later by
> adding `/s/` to disallow — it would be a strict regression on both axes.

**Verify:**

```bash
npm run build && npm run start
curl -sI "http://localhost:3000/s/$TOKEN" | grep -iE 'cache-control|x-robots-tag|referrer-policy'
curl -s  http://localhost:3000/robots.txt
```

**Expected:**

```
Cache-Control: private, no-store, max-age=0, must-revalidate
X-Robots-Tag: noindex, nofollow, noarchive
Referrer-Policy: strict-origin-when-cross-origin
```

and `robots.txt` containing no `Disallow: /s`.

---

### Task 17 — Prove the cache cannot serve a revoked link

The one failure mode that manual clicking will not catch.

```bash
npm run build 2>&1 | tee /tmp/build.log

# 1. The route must be listed as dynamic, not static/ISR.
grep -E "^\s*[fλƒ●○] +/s/\[token\]" /tmp/build.log
```

**Expected:** `/s/[token]` marked as **Dynamic / server-rendered on demand** (`ƒ`), **never** `○`
(static) or `●` (SSG/ISR). If it shows as static, something added `generateStaticParams` or a
`revalidate` — remove it.

```bash
# 2. There must be no cache-tag or revalidate machinery on this route.
grep -rn "unstable_cache\|use cache\|revalidate = [1-9]\|generateStaticParams" app/s/
```

**Expected:** no output.

```bash
# 3. On production, hit it twice from a cold cache and confirm the CDN never claims a HIT.
curl -sI "https://expensetracking.online/s/$TOKEN" | grep -iE 'x-vercel-cache|age|cache-control'
curl -sI "https://expensetracking.online/s/$TOKEN" | grep -iE 'x-vercel-cache|age|cache-control'
```

**Expected:** `x-vercel-cache: MISS` (or absent) on **both**, never `HIT`, and no `Age:` header
climbing between the two.

```bash
# 4. Revoke in the UI, then immediately:
for i in 1 2 3; do curl -s -o /dev/null -w '%{http_code} ' "https://expensetracking.online/s/$TOKEN"; done; echo
```

**Expected:** `404 404 404` — within seconds, with no warm-up period.

> **Known and accepted:** a recipient who still has the tab open sees the old render until they
> reload, and iOS back-forward cache can restore it from memory on a swipe-back. `no-store` does
> not evict a page already painted in a live tab. Nothing short of client-side polling fixes this,
> and polling is not worth it for v0.1.0 — but say so if the user asks "is it *gone* gone?".
> The honest answer is: the URL is dead within seconds; a screen someone is already looking at is
> not something we can reach.

---

### Task 18 — Commit and deploy

```bash
git add app/s app/robots.ts next.config.ts public/og-default.png components/photos
git commit -m "F09: public /s/[token] page, noindex headers, dynamic-only caching"

git push
# Vercel builds from main. Wait for the deployment, then run the QA script below against
# https://expensetracking.online (NOT the preview URL — AUTH_URL and the OG absolute URLs
# are production values).
```

---

## 5. Manual QA script

Run the whole thing on the real phone (iPhone XS Max, Safari) against production. Roughly 10
minutes. Every step has a pass condition; if one fails, stop.

### Setup

1. Sign in at `https://expensetracking.online`.
2. Create an expense with the canonical paste from roadmap §1 (6 items, `Rp 266.350`) and attach
   **at least 2 photos** — photos are half of what we are testing.
3. Land on `/e/<id>`.

### A. Mint and share

4. Tap **Bagikan**.
   - **Pass:** the iOS share sheet appears within about a second. Not a toast, not a spinner that
     then opens a sheet — the sheet.
5. Swipe the sheet away without choosing anything.
   - **Pass:** nothing happens. No red toast, no "Gagal", no error text anywhere. This is the
     `AbortError` path (§2.3) and silence is the correct behaviour.
6. Tap **Bagikan** again, choose **WhatsApp**, and send it to **yourself** ("Message yourself").
   - **Pass:** the message sends with a URL of the form `https://expensetracking.online/s/XXXXXXXXXXXX`
     — 12 characters after `/s/`.
7. Note the token. Tap **Bagikan** a third time and check the URL in the sheet.
   - **Pass:** **identical token.** If it changed, `createShareLink` is not idempotent — go back
     to §2.1 and Task 4. This is the single most important assertion in the QA script, because
     the failure is invisible in normal use and silently breaks links the user already sent.
8. Reload `/e/<id>`.
   - **Pass:** the status row is present on first paint: *"Tautan aktif. Siapa pun yang punya
     tautan ini bisa melihat pengeluaran ini tanpa masuk."* plus **Batalkan tautan**. No flash of
     the button-only state.

### B. The WhatsApp preview

9. Look at the sent message in the chat.
   - **Pass:** a preview card with the expense title, `6 item · Selasa, 18 Agustus 2026`, the
     static thumbnail, and `expensetracking.online`.
   - **Pass:** **no rupiah amount anywhere on the card** (§2.6). Check the chat-list snippet on
     the WhatsApp home screen too.
   - If no card appears at all: WhatsApp caches by URL and may have scraped before deploy — mint
     a fresh link on a different expense and retry, then check `robots.txt` does not disallow `/s`.

### C. The public page, signed out

10. On a **desktop** browser, open a **private/incognito** window (a profile with no session
    cookie) and paste the URL.
    - **Pass:** 200. The page renders: title, long-form Indonesian date, 6 item rows with emoji +
      category label + amount, `Total Rp 266.350`, the photo grid.
    - **Pass:** it did **not** redirect to a Google sign-in page (Task 11).
11. Tap a photo.
    - **Pass:** the lightbox opens, swipes between photos, pinch-zooms.
    - **Pass:** there is **no delete button** in the lightbox or on any thumbnail (Task 13).
12. Hunt for anything that should not be there.
    - **Pass:** no bottom tab bar. No header menu, avatar, or "Masuk". No item is tappable-to-edit.
      No "+ Tambah item". No date picker. No trash icon. No month navigation.
    - **Pass:** the only link on the page is the footer *"Dibagikan via expensetracking.online"*,
      and it goes to `/`.
13. View source (`Ctrl-U`) and search it.

    ```bash
    curl -s "https://expensetracking.online/s/$TOKEN" > /tmp/shared.html
    grep -icE 'gmail|@[a-z0-9.-]+\.(com|id)|userId|user_id|rawText|deletePhoto|deleteExpense' /tmp/shared.html
    ```

    - **Pass:** `0`. (`expensetracking.online` in the footer will not match the email pattern
      because of the required `@`. If you get hits, read each one.)
14. Headers:

    ```bash
    curl -sI "https://expensetracking.online/s/$TOKEN" | grep -iE 'http/|cache-control|x-robots|x-vercel-cache'
    ```

    - **Pass:** `200`, `private, no-store, …`, `noindex, nofollow, noarchive`, and no `HIT`.
15. Try a garbage token and a well-formed but unknown one:

    ```bash
    curl -s -o /dev/null -w '%{http_code}\n' "https://expensetracking.online/s/hello"
    curl -s -o /dev/null -w '%{http_code}\n' "https://expensetracking.online/s/aaaaaaaaaaaa"
    ```

    - **Pass:** `404` for both, and the rendered body is the same neutral *"Tautan tidak
      ditemukan"* in both cases.

### D. Revoke

16. Back on the phone, on `/e/<id>`, tap **Batalkan tautan**.
    - **Pass:** an inline confirm appears saying the already-sent link will die immediately and a
      new share will produce a *different* link. Not a bare "Are you sure?".
17. Tap **Jangan jadi**.
    - **Pass:** the confirm closes, the link is still active — verify by reloading `/s/<token>`
      in the incognito window: still 200.
18. Tap **Batalkan tautan** → **Ya, batalkan**.
    - **Pass:** the status row disappears, only **Bagikan** remains, brief *"Tautan dibatalkan"*.
19. Immediately reload the incognito tab.
    - **Pass:** **404**, within seconds, first try. Hard-reload once more to be sure it is not the
      browser's own copy.
20. Re-open the WhatsApp message and tap the preview card.
    - **Pass:** 404. (The *card* may still show the old title — Meta cached it. Expected; see §2.7.)
21. Tap **Bagikan** again on `/e/<id>`.
    - **Pass:** a **new, different** token. Paste it in incognito: 200.
    - **Pass:** the **old** token still 404s. Re-share is not un-revoke.

### E. Desktop fallback path

22. On desktop Chrome (where `navigator.share` may be absent), signed in, open `/e/<id>` and click
    **Bagikan**.
    - **Pass:** the URL is on the clipboard and a **"Tersalin"** toast appears. Paste to confirm.
    - **Pass:** no error toast, no unhandled rejection in the console.

---

## 6. Rollback

Nothing here is destructive to existing data, and `share_links` rows are disposable.

```bash
git revert <the F09 commits>
```

If a link must be killed right now and the UI is broken:

```sql
DELETE FROM share_links WHERE token = '<token>';   -- or: WHERE group_id = '<id>';
```

`ON DELETE CASCADE` from `expense_groups` means deleting the expense also kills its link, so
"delete the whole expense" is always a valid emergency stop.

---

## 7. Security review

### What an attacker holding a valid token CAN do

| | |
|---|---|
| Read the shared group | title, date, note, every item name + amount + category, the SQL-computed total |
| View the photos | full resolution, via the lightbox |
| **Keep the photos forever** | see below — this is the one genuinely unfixable-in-v0.1.0 item |
| Share the URL onward | it is a bearer token; there is no device binding, no view count, no expiry |
| Keep reading until revoke | no TTL in v0.1.0 (roadmap §4.2: no expiry column) |
| Learn the app exists and the group's item count | i.e. nothing beyond the page itself |

**The photo caveat, stated plainly.** Photos live at public Vercel Blob URLs
(`https://….public.blob.vercel-storage.com/…`). Those URLs are unguessable but **permanent and
independent of the share link**. Anyone who opens the shared page can right-click → copy image
address, and that URL keeps working **after the share link is revoked**. Revoke kills the *page*,
not the *blobs*. Truly revoking images would require either signed blob URLs with short expiry or
proxying every image through an authenticated route — neither is in v0.1.0's stack or scope.
**Tell the user this in one sentence**: "Batalkan tautan mematikan halamannya; foto yang sudah
sempat dibuka bisa saja masih tersimpan di sisi mereka."

### What they CANNOT do

| | |
|---|---|
| See any other expense | `getGroupByShareToken` returns one group by token. There is no navigation, no sibling ids, and no listing endpoint reachable without a session. |
| Learn who the owner is | no email anywhere; `ownerName` is gated off by default (§2.5); no avatar, no `userId` in the payload or the DOM. |
| Know how many expenses exist | nothing on the page is a count, a month, or a "back to list". |
| Modify anything | `/s` renders no form and imports no server action (Task 13). Every action in `app/actions/` opens with `requireUserId()`, and each one re-verifies ownership — `createShareLink`/`revokeShareLink` via `assertOwnsGroup`. |
| Mint or revoke links | both require a session **and** ownership. A signed-in stranger guessing a `groupId` gets the same "Pengeluaran tidak ditemukan." as for a nonexistent id — no oracle. |
| Enumerate other tokens | tokens are independent CSPRNG draws (§2.2); holding one reveals nothing about another. |
| Brute-force a second token | ~2^72 space; ~7.5 × 10^10 years at 1,000 req/s (§2.2). |
| Confirm a *revoked* link once existed | revoked and never-existed return byte-identical 404s, after the same single indexed lookup, so neither the body nor the timing distinguishes them. |
| Get it indexed by Google | `noindex, nofollow, noarchive` as both a header and a meta tag (Task 16). |
| Leak the token via `Referer` | the only cross-origin subresources are blob images, and `strict-origin-when-cross-origin` sends the origin only. |
| CSRF an owner into minting/revoking | Next 16 server actions verify `Origin`/`Host`; the actions are POST-only and not reachable as GET. |

### Residual risks, accepted

1. **Bearer semantics.** Anyone the recipient forwards the message to has full access. This is the
   product: "send it to a friend over WhatsApp". Revoke is the mitigation, and it is one tap.
2. **Blob permanence** (above). Documented, not fixed.
3. **No expiry.** A link the user forgets about lives forever. The status row on `/e/[id]` is the
   only reminder. A `expires_at` column is the obvious v0.2 addition.
4. **Meta's cached preview card** survives revoke for days (§2.7) — which is exactly why there is
   no per-link OG image.
5. **No rate limiting** (§2.9), consciously deferred with a documented tripwire.
6. **`note` is published.** The note field is rendered on the public page. It is the owner's own
   text about this specific group and it is visible directly above the share button when they
   share, so the consent is informed — but see Open Questions.

---

## Contract deltas

Three additions. None changes an existing signature, table, or route; nothing in roadmap §4 is
contradicted.

1. **`lib/db/queries.ts` gains `getShareTokenForGroup(userId, groupId): Promise<string | null>`.**
   Additive. Roadmap §5's F03 description lists five queries; this is a sixth, `userId`-scoped like
   the other five. Needed because `/e/[id]` must know whether a link already exists in order to
   render the status/revoke row on first paint.
   *Alternative considered and rejected:* adding a `shareToken` field to `getGroupDetail`'s return.
   That would change a shape three other features consume, to save one indexed lookup on a page
   that is not hot.

2. **`getGroupByShareToken` must be wrapped in React `cache()`.** Behavioural, not signature.
   Without it `/s/[token]` runs the query twice per request (`generateMetadata` + page). If F03
   prefers not to, this plan wraps it locally instead (Task 5) and the delta disappears.

3. **`lib/format.ts` gains `formatJakartaLong(iso: string): string`.** Additive; §4.7 lists three
   helpers, this is a fourth, same file, same `TZ` constant.

**Coordination requirements that are not deltas** (they are already implied by roadmap §4.6 /
§5 but must be actively confirmed):

- **F02** — `middleware.ts` must not match `/s` (Task 11). The roadmap already says so.
- **F07 / F10** — `TabBar` must live in a route-group layout, not the root layout, or self-hide
  on `/s/` (Task 12).
- **F06** — the gallery must be usable without any delete affordance; preferably split into a
  presentational `PhotoGrid` and an action-bearing `PhotoManager` (Task 13).
- **F01** — `next.config.ts` gains a `headers()` block for `/s/:token` (Task 16).

---

## Interfaces I publish

**`components/share/ShareControl.tsx` — the one thing F07 embeds.**

```ts
export type ShareControlProps = {
  groupId: string
  title: string
  occurredOn: string          // 'YYYY-MM-DD'
  initialToken: string | null // from getShareTokenForGroup(userId, groupId)
}
export function ShareControl(props: ShareControlProps): JSX.Element
```

It is a client component and self-contained: it owns the button, the mint, the native share
sheet, the clipboard fallback, the status row, the revoke confirm, and its own inline status
message. F07 renders it and passes four props — no callbacks, no state to lift, no context.
Place it below the photo gallery and above the destructive delete action.

**`app/actions/share.ts`** (roadmap §4.4, unchanged)

```ts
export async function createShareLink(groupId: string): Promise<{ token: string }>  // idempotent
export async function revokeShareLink(groupId: string): Promise<void>               // idempotent
```

**`lib/share/config.ts`**

```ts
export const SHARE_TOKEN_LENGTH: 12
export const SHARE_TOKEN_RE: RegExp
export const SHARE_PREVIEW_SHOWS_TOTAL: boolean   // false
export const SHARE_SHOWS_OWNER_NAME: boolean      // false
export function appOrigin(): string
export function shareUrl(token: string): string
```

**`lib/share/token.ts`** — `export function mintShareToken(): string`

**Route** — `GET /s/[token]`, public, dynamic, `noindex`.

---

## Interfaces I consume

| From | Symbol | How |
|---|---|---|
| **F02** | `requireUserId(): Promise<string>` | first line of both server actions |
| **F02** | `middleware.ts` `config.matcher` | must **exclude** `/s` — hard dependency (Task 11) |
| **F03** | `db` (Drizzle client) | all queries |
| **F03** | `schema.shareLinks` (`token`, `groupId`, `createdAt`) | insert / select / delete |
| **F03** | `schema.expenseGroups` (`id`, `userId`) | ownership check |
| **F03** | `getGroupByShareToken(token): Promise<SharedGroup \| null>` | the **only** un-`userId`-scoped query in the app; must be `cache()`-wrapped and must not project `userId`, `email`, `rawText`, or `blobPathname` (Task 5) |
| **F03** | `getGroupDetail(userId, id)` | already on `/e/[id]`; unchanged |
| **F03** | `CATEGORIES`, `Category`, category metadata (`label`, `emoji`) | item rows on `/s` |
| **F03** | `nanoid` id helper convention | `mintShareToken` mirrors it at length 12 |
| **F06** | `PhotoGrid` (preferred) or `PhotoGallery` + `readOnly` prop | read-only gallery on `/s` (Task 13) |
| **F06** | `GalleryPhoto` shape (`id`, `blobUrl`, `width`, `height`) | the `photos` array on `SharedGroup` |
| **F07** | `app/e/[id]/page.tsx` | the embed point for `ShareControl` (Task 9) |
| **F07** | `getGroupDetail` return shape (`id`, `title`, `occurredOn`) | the props passed to `ShareControl` |
| **F10** | `Button` — needs `onPointerDown` forwarding and `secondary` / `danger` / `ghost` variants | share + revoke controls |
| **F10** | design tokens `--color-surface-2`, `--color-border`, `--color-text-muted`, `--color-danger` | all F09 UI |
| **F10** | `TabBar` | must be **absent** on `/s` (Task 12) |
| **F10** | 16px-minimum input rule, safe-area insets, `min-h-dvh` | the manual-copy input and the `/s` shell |
| **F01** | `lib/env.ts` / `AUTH_URL` | absolute share URLs and OG `url` |
| **F01** | `next.config.ts` | `headers()` block; blob host in `images.remotePatterns` for `/s` photos |
| — | `lib/format.ts` `formatIdr`, `TZ` | amounts and the date anchor |
| — | `nanoid@5` | CSPRNG token generation |

---

## Open questions for the integrator

1. **Should the `note` be published?** Currently yes — it is the owner's own text about this
   group and it sits directly above the share button, so sharing it is an informed act. But it is
   the one free-text field on the page whose contents we cannot predict. Cheapest alternative: hide
   it behind a `SHARE_SHOWS_NOTE` constant next to the other two. **Recommend: publish it, and ask
   the user once** — they are the only person whose notes are at stake.

2. **Owner name — really nothing?** §2.5 defaults to showing nothing, on the reasoning that the
   recipient already knows who sent it. If the user ever forwards a link into a group chat where
   the context is lost, a first name would help. One constant flip. **Recommend: ship with nothing,
   revisit if the user asks "who is this from?" when they see it.**

3. **Total in the preview card — confirm with the user.** §2.6 recommends no. It is a genuine
   product tradeoff (nicer card vs. the number on a lock screen) and the user may simply not care
   about rupiah amounts leaking to people already in the chat. Show them both variants before
   locking it.

4. **Does F06's gallery get split, or just a `readOnly` prop?** The split (Task 13) keeps server
   actions out of the public bundle entirely. That is a real improvement, but it is F06's
   refactor, not F09's. If F06 says no, the fallback is documented and safe — decide before F09's
   build, not after.

5. **Where exactly does `TabBar` live?** If F10 has already committed it to the root layout, the
   route-group refactor (Task 12) touches four page files across F05/F07/F08. Agree the approach
   with whoever owns those before moving anything.

6. **Is `AUTH_URL` readable from a client component?** `shareUrl()` is called in the browser. If
   F01's `lib/env.ts` keeps it server-only, either add a `NEXT_PUBLIC_APP_URL` or pass the origin
   into `ShareControl` as a prop. Do **not** let it fall back to `window.location.origin` — that
   would produce a `*.vercel.app` preview URL when the user shares from a preview deploy, and they
   would send a friend a link that dies at the next deployment.

7. **Should a live link block deleting the expense?** Today, deleting the group cascades the
   `share_links` row and the shared page 404s, which is correct behaviour but silent. Worth adding
   "Tautan yang kamu bagikan juga akan mati." to F07's delete confirm when a token exists.

8. **Expiry.** v0.1.0 has none by design (roadmap §4.2). If the user's mental model turns out to be
   "this should stop working after a while", that is an `expires_at` column plus one `WHERE` clause
   — cheap, but it is a schema change and therefore a real contract delta. Not in v0.1.0.

---

## Implementation checklist (filled in on landing)

Rulings **R-120…R-130** in `docs/RECONCILIATION_v0.1.0.md` are the arbitration record for
everything below and supersede this plan wherever they disagree with it.

```
Task 1  Preflight
  [x]    Every consumed symbol verified as shipped. shareLinks (token PK, group_id UNIQUE),
         getGroupByShareToken (cache()-wrapped, no userId/email/rawText in the projection),
         getOwnedGroupAnchor, getGroupDetail().shareToken, newShareToken, isValidId,
         formatJakartaLong, PhotoGallery, Button/Card/Sheet/Money/CategoryCode/useToast.
  [x]    proxy.ts (NOT middleware.ts — R-1) does not match /s. Verified live: signed out,
         /s/aaaaaaaaaaaa → 404, /e/aaaaaaaaaaaa → 307 to /?next=…
Task 2  lib/share/*
  [x]    config.ts — SHARE_PREVIEW_SHOWS_TOTAL · SHARE_SHOWS_OWNER_NAME · SHARE_SHOWS_NOTE ·
         SHARE_MINT_ATTEMPTS · shareUrl(origin, token). Client-safe: no process.env, no lib/env.
  [x] −  token.ts and SHARE_TOKEN_RE NOT CREATED (R-120). newShareToken() and isValidId()
         already exist in lib/id.ts and are derived from the same alphabet; a second generator
         with a second regex is the R-7/R-8/R-33/R-42 duplication, and the failure mode is a
         shape check that rejects real tokens.
  [x] +  origin.ts (server-only) — AUTH_URL → VERCEL_PROJECT_PRODUCTION_URL → localhost:$PORT.
         The origin is a PROP, never read in the browser (R-121, Open question 6).
  [x]    clipboard.ts — Clipboard API then the selected-textarea fallback. Named clipboard.ts,
         not copy.ts: in this repo copy.ts is a screen's strings.
  [x]    lib/share/__tests__/config.test.ts — 9 cases, incl. ID_ENTROPY_BITS === 72, because
         the whole threat model is argued from that number and a comment cannot fail.
Task 4  app/actions/share.ts
  [x]    createShareLink — requireUserId, Zod shape check, getOwnedGroupAnchor (R-99, not a
         re-declared join), read-first, then insert .onConflictDoNothing() with NO target so
         one path absorbs both constraints, disambiguated by re-reading on group_id.
  [x]    IDEMPOTENT: a second Bagikan returns the SAME token and writes nothing. The constraint
         is the product rule — a link already sent must keep working.
  [x]    revokeShareLink — DELETE, idempotent, no revoked_at. Both revalidate via
         app/actions/_revalidate.ts rather than inventing a second answer.
  [x]    R-60 recorded in place: nothing throws on this path, and anyone who changes it to a
         throwing insert must key off error.cause.code, never a message regex.
  [x]    app/actions/__tests__/share.test.ts — 14 cases over the emitted SQL: ownership before
         any write, cross-user indistinguishable from missing, idempotence, the concurrent-mint
         branch, the PK-collision retry with a FRESH token, and the bounded give-up.
Task 5  Queries
  [x] −  getShareTokenForGroup NOT ADDED (R-12). getGroupDetail().shareToken was already there,
         so the revoke panel is correct on first paint at the cost of zero extra queries.
Task 8/9  The share control, and where it lives
  [x]    SPLIT IN TWO (R-124). Design R-38 gives /e/[id]'s header exactly one action, and F07
         had already shipped that slot: ShareButton → shareSlot (header), ShareLinkPanel →
         shareLinkSlot (body, above Hapus pengeluaran, so the two red affordances are apart).
  [x]    pointerdown warming · navigator.share called with the gesture intact · AbortError is
         SILENCE · clipboard fallback · manual-copy sheet when even that fails · feature
         detection inside the handler, never in render.
  [x]    Revoke is a Sheet, feedback is F10's toast (R-125) — both primitives shipped after
         this plan was written. The confirm says what dies, and carries §7's photo sentence.
  [x]    ExpenseEditor gains one prop, shareLinkSlot. Both slots rendered by the SERVER page.
Task 11/12  Layout isolation
  [x] −  app/s/[token]/layout.tsx NOT CREATED. /s lives in app/(bare)/, whose docblock already
         listed it (R-25 / R-51). Confirmed in the served HTML: no data-tabbar, no header menu.
Task 13  Read-only gallery
  [x]    PhotoGallery, no onDelete (R-80).
  [x] +  IMPORTED BY PATH, not through @/components/photos (R-123). The barrel re-exports
         PhotoManager, which imports deletePhoto — through it, R-80's property would rest on
         the bundler tree-shaking a re-export, on the one route served to strangers.
Task 14/15  The public page
  [x]    Shape check before the DB · one 404 for unknown AND revoked · CategoryCode on every
         row (R-111's condition, and this is the page it was written for) · the only outbound
         link is the footer's / · no form, no action, no session read.
  [x]    generateMetadata: noindex/nofollow/nocache + googleBot, canonical, og:* with the item
         count and date and NO rupiah figure, one static og-default.png (a per-link OG image
         would survive a revoke in Meta's cache).
  [x] +  export const dynamic = 'force-dynamic' KEPT, and it is load-bearing here (R-122).
         R-75/R-115 removed it from routes that read a cookie; this one reads none. No
         loading.tsx either, or the 404 becomes a streamed 200 (R-98).
Task 16  Headers and robots
  [x]    next.config.ts headers() for /s/:token — private/no-store, noindex nofollow noarchive,
         strict-origin-when-cross-origin. Verified on a live next start.
  [x]    app/robots.ts allows /s deliberately: disallowing it would kill the WhatsApp card and
         would not stop URL-only indexing. Verified: robots.txt carries no Disallow: /s.
Task 17  Freshness
  [x]    next build lists ƒ /s/[token]. Live: DELETE the row → 404 404 404 with no warm-up;
         re-share with a new token → 200 while the old token stays 404.
  [x] +  scripts/f09-audit.sh — 27 PASS, exit 0 (proxy matcher, no session read, no action in
         the graph, barrel bypass, no PhotoManager, force-dynamic, no caching machinery, no
         loading.tsx, both headers, robots, requireUserId ×2, anchor ×2, no re-declared
         ownership, bare onConflictDoNothing, no Math.random, no console, no window.location,
         client-safe config, no hex, CategoryCode, no per-link OG image)
  [x] +  tests/share.bundle.test.ts — walks the real import graph from the route entry and
         asserts it reaches no app/actions/* at all, plus a non-vacuity check. The walker moved
         to tests/support/importGraph.ts, shared with F06's (R-128).
Ship
  [x]    npm test 736 passed | 15 skipped (31 new) · next typegen && tsc --noEmit · eslint ·
         prettier · next build (ƒ /s/[token])
  [x] +  A REAL GROUP RENDERED END TO END — the gap R-108.1 and R-119.3 both recorded. /s needs
         no session, so f09-seed.sql was applied to the (empty) database, the canonical example
         fetched from a live next start (Rp 266.350, six rows, MJ/HB/LN codes, Selasa 18
         Agustus 2026), leak-swept to 0 hits, and the fixture torn down back to 0 rows.
  [ ]    navigator.share HAS NEVER RUN. No jsdom, no browser in this repo: warming, the sheet,
         AbortError silence, the clipboard fallback are reasoned from the contract (R-129.1).
  [ ]    IDEMPOTENCE HAS NOT BEEN TAPPED TWICE ON A PHONE. QA step 7 is the one that matters —
         a fresh token silently breaks a link the user already sent (R-129.2).
  [ ]    No photo rendered; the fixture's blob does not exist (R-129.3).
  [ ]    The WhatsApp card has never been scraped (R-129.4).
  [ ]    Production headers unconfirmed; x-vercel-cache never observed, og:url was localhost
         because AUTH_URL is unset locally (R-129.5).
  [ ]    THE 22-STEP QA SCRIPT (§5) is outstanding in full, on a real iPhone, both schemes.
```
