# Reconciliation — v0.1.0 plan set

Ten feature plans were written in parallel against `ROADMAP_v0.1.0.md` §4. This document is the
**arbitration record**: every place two plans disagreed, plus every place a plan proved the roadmap
itself wrong. Rulings here **supersede** the individual plan files. Where a ruling changes §4, the
roadmap has been amended in the same commit.

Legend: **R-n** = ruling. ⚠️ = would have broken a build or shipped a bug.

---

## Group A — the roadmap was wrong (agent beat the contract)

### ⚠️ R-1 · `middleware.ts` does not exist in Next.js 16. It is `proxy.ts`.

**Raised by:** F01 (verified by scaffolding a real Next 16.3.1 project).
**Verified independently** against the official docs for `next@16.3.1`.

`middleware.ts` is deprecated and renamed to **`proxy.ts`**; the exported function renames
`middleware` → `proxy`; `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`. Codemod:
`npx @next/codemod@canary middleware-to-proxy .`

**Ruling.** Roadmap §5/F02 and F02's plan both say `middleware.ts`. Both are corrected to `proxy.ts`
with `export function proxy(...)`. F09 Task 11's cross-check is retargeted at the same file.

**Consequence F02 must absorb, and it is not cosmetic:** *"Proxy defaults to using the Node.js
runtime. The `runtime` config option is not available in Proxy files. Setting the `runtime` config
option in Proxy will throw an error."* F02 built its entire split-config (`auth.config.ts`, a second
adapter-free `NextAuth()` instance) to keep the Drizzle adapter out of an **Edge** bundle. **That
constraint no longer exists.**

- **Keep the split** — it still buys a smaller bundle and faster cold start on a file that runs on
  every matched request.
- **Rewrite the stated rationale.** F02 §3 currently justifies it with an Edge constraint that is
  false in Next 16. Left as-is, a future reader "simplifies" it away for the right reason and the
  wrong outcome, or worse, trusts the other Edge claims around it.
- F02's build-gate grep (asserting `drizzle-orm` never appears in the proxy bundle) is **demoted
  from a correctness gate to a bundle-size check**. Keep it; relabel it.

### ⚠️ R-2 · `createExpense({ photoIds })` is unimplementable. It becomes `photos`.

**Raised by:** F06 (CD-1). **Independently agreed by F05** after cross-reading F06. **Contradicts F03.**

`expense_photos.group_id` is `NOT NULL` with an FK, so no photo row — and therefore no photo id —
can exist before its group does. `photoIds` points at nothing.

**Ruling. F06 and F05 are correct; §4.4 and F03's `CreateExpenseInput` are amended:**

```diff
- createExpense(input: ParsedExpense & { note?, rawText?, photoIds? }) → { id }
+ createExpense(input: ParsedExpense & { note?, rawText?, photos?: NewPhotoInput[] }) → { id }
```

Bytes upload while the user is still editing the parsed table; `createExpense` inserts group + items
+ photo rows in **one** `db.batch()`. The rejected alternative (create-then-attach) costs atomicity
and 1+N round trips on the single tap that most needs to feel instant.

### ⚠️ R-3 · An 8-slice category donut fails accessibility. It becomes a bar list.

**Raised by:** F08, which ran the `dataviz` skill's validator rather than eyeballing:

```
8-slot palette, all pairs:  light [FAIL] CVD ΔE 3.2 (protan) · normal-vision floor 7.1 (needs ≥15)
                            dark  [FAIL] CVD ΔE 1.6 (deutan) · normal-vision floor 7.1
```

In a donut, colour is the **only** identity channel, so this is real information loss — and the
normal-vision failure means it degrades for full-colour readers too, not just colour-blind ones.
Re-validated as a horizontal bar list (emoji + label + amount + % as text, colour redundant):
**all checks pass, both modes.**

**Ruling.** Roadmap §4.6 "category donut" → **category bar list**. The SQL is unchanged; only the
mark changes. F03's `getCategoryBreakdown` docstring ("Powers the F08 donut") is corrected.

### R-4 · `db.transaction()` does not exist on the `neon-http` driver.

**Raised by:** F03. Multi-statement atomic writes use `db.batch([...])`, which Neon executes as one
transaction in one HTTP request. **Binds F05 (`createExpense`) and F09 (`createShareLink`).**
Accepted into §4.

### R-5 · Server Actions are not covered by the proxy matcher.

Surfaced while verifying R-1, from the Next.js docs: *"Server Functions are not separate routes...
a Proxy matcher that excludes a path will also skip Proxy coverage... Always verify authentication
and authorization inside each Server Function rather than relying on Proxy alone."*

**Ruling.** This promotes `requireUserId()`-at-the-top-of-every-action from good hygiene to **the
actual security boundary**. F02 and F03 independently wrote this rule; it is now recorded in §4.4 as
non-negotiable, with `proxy.ts` explicitly labelled a UX redirect and *not* a boundary.

---

## Group B — two plans claimed the same thing

### ⚠️ R-6 · `app/page.tsx` had three claimants (F01, F02, F07) plus F10's landing design.

A duplicate route is a build failure, not a style disagreement.

**Ruling. F02 owns `app/page.tsx`.** It is the only feature that must read the session to decide
between rendering the landing page and redirecting to `/m/<currentMonthKey>`. F10 supplies the
*presentational* landing components that page renders; F01 ships only a throwaway placeholder that
F02 replaces; F07 owns the redirect **target**, not the route.

### ⚠️ R-7 · `lib/categories.ts` — F10 (D-1) vs F03.

Both authored it. F08 has already built against **F03's** shape (`CATEGORY_META`, and
`CategoryMeta.color` typed as `` `--color-cat-${Category}` `` — leading dashes included).

**Ruling. The exported shape is F03's, verbatim.** Ownership moves to the wave-1 prelude (R-9) so
F10's `Chip`/`CategoryPicker` can import it. F03 and F10 both delete their private copies. F10 still
owns the *values* of the `--color-cat-*` custom properties; F03 owns the module that names them.

### ⚠️ R-8 · `lib/format.ts` — F10's money half (D-2) vs F03's full module.

F03's version is **verified, not asserted**: it executed 46/46 `parseIdrLoose` cases including
`1,5jt`, `Rp 1.250.000,-`, `38.500,00`, plus the UTC+7 midnight-boundary case and a
`parseIdrLoose(formatIdr(n)) === n` round-trip property. F08 already imports the richer surface.

**Ruling. F03's `lib/format.ts` is canonical and complete.** F10 does not author a money half; it
imports. **F10's D-3 is accepted on merit:** `formatIdrDigits(n) → "38.500"` is added, and
`formatIdr` becomes `` `Rp ${formatIdrDigits(n)}` `` — this lets `Money` typeset the `Rp` at a
smaller optical size, which is a genuinely better result than a single opaque string.

### R-9 · Wave 1 gains a shared prelude, because R-7 and R-8 create an ordering problem.

F10 ships in wave 1 and needs `lib/categories.ts` + the money formatters; F03 owns both and ships in
wave 2. Splitting ownership by half-module (F10's original proposal) is how two divergent
implementations of `formatIdr` end up in one codebase.

**Ruling. F03's plan is split.** Its Tasks covering `lib/categories.ts`, `lib/format.ts`, `lib/id.ts`
and `lib/schema/expense.ts` — all pure, dependency-free modules — execute in **wave 1 as F03a**,
immediately after F01 and before F10. The DB half (`schema.ts`, `index.ts`, `queries.ts`, migrations)
stays in wave 2 as F03b. Execution order becomes:

```
F01 → F03a → F10 → F03b → F02 → {F04, F06} → {F05, F07} → {F08, F09}
```

### ⚠️ R-10 · Two month-arithmetic implementations: F03's `lib/format.ts` vs F07's `lib/month.ts`.

**Raised by:** F08, which was pointed at a different one by each plan. Both export `addMonths` and
Indonesian month labels.

**Ruling. `lib/month.ts` is deleted.** F07 imports `addMonths`, `monthLabel`, `monthLabelShort`,
`dateLabel`, `dayLabel`, `MONTH_NAMES_ID`, `isValidMonthKey` from `lib/format.ts`. F07's
TZ-independence unit tests are **kept** and moved onto F03's implementation — they are a better test
suite than the module they were written for.

### R-11 · Vitest was introduced by both F03 and F04.

**Ruling. F01 owns it** — it already owns `package.json` and the npm scripts, and it ships first.
F03 and F04 assume `vitest` + `vitest.config.ts` exist and add only test files.

---

## Group C — a plan asked for something that already existed

### R-12 · `getShareTokenForGroup` is not needed. F03 already returns `shareToken`.

F09 proposed a sixth query, explicitly rejecting "add `shareToken` to `getGroupDetail`" as a change
to a shape three features consume. **F03 had already added exactly that field** (`getGroupDetail →
shareToken: string | null`). F09 was reasoning about a version of F03 it hadn't read.

**Ruling.** Use `getGroupDetail().shareToken`. F09's `getShareTokenForGroup` is dropped — one fewer
query, one fewer indexed lookup, and `ShareControl`'s `initialToken` prop is fed from the group
detail F07 already fetched. F09's `ShareControl` interface is otherwise unchanged.

### R-13 · `getBiggestExpense` and zero-filled months already exist.

F08 expected to add both; F03 had shipped `getBiggestExpense` and a zero-filling `fillZeroMonths`.
No delta. Recorded so nobody re-adds them.

---

## Group D — accepted additions

| # | Addition | Origin | Ruling |
|---|---|---|---|
| R-14 | `getMonthGroups` gains `firstPhotoUrl: string \| null` | F07 needs the thumbnail badge; F03 shipped `photoCount` but not the URL | **Accept.** Same aggregate, no extra round trip. |
| R-15 | `getMonthToDatePair(userId, month, throughDay)` | F08's delta tile | **Accept.** Without it the in-progress-month comparison is misleading or absent. |
| R-16 | `addItem` gains optional `sortOrder?` | F07's undo | **Accept.** Omitted ⇒ unchanged behaviour. |
| R-17 | `deleteExpense` ends in server-side `redirect()` | F07 | **Accept.** Client-side redirect races revalidation and flashes a 404. Callers must never `try/catch` it. |
| R-18 | `deleteExpense` must call `deleteBlobsQuietly` | F06 CD-4 | **Accept, and it is load-bearing.** The FK cascade deletes rows and orphans the bytes forever — the fastest way to silently consume the 1 GB free tier. |
| R-19 | `discardStagedPhotos(pathnames)` | F06 CD-2 | **Accept.** |
| R-20 | `attachPhoto` idempotent on `(group_id, blob_pathname)` | F06 CD-3 | **Accept.** Required because `onUploadCompleted` never fires against localhost, so the client path must be able to run twice. |
| R-21 | `formatJakartaLong(iso)` | F09 | **Accept** into `lib/format.ts` (F03a). |
| R-22 | `getGroupByShareToken` wrapped in React `cache()` | F09 | **Accept.** It is called twice per request (`generateMetadata` + page). |
| R-23 | `/stats` accepts `?m=YYYY-MM` | F08 | **Accept.** Keeps month selection consistent with `/m/[month]`. |
| R-24 | Tailwind `--color-*` / `--text-*` namespaces reset | F10 D-4 | **Accept, with a warning.** `bg-red-500` and `text-sm` cease to exist. This is what keeps five parallel plans on one system, and it is the single item most likely to bite waves 3–5. Every feature author reads F10's token reference before writing a class name. |
| R-25 | `app/(shell)/` route group owns the TabBar | F07, required by F09 | **Accept.** `/s/[token]` and `/new` sit outside it. A root-layout TabBar cannot be removed by a nested layout. |
| R-26 | `PhotoGrid` (presentational) split from `PhotoManager` (actions) | F09 | **Accept.** Otherwise `deletePhoto`'s Server Action id ships in the public share page's bundle. |

---

## Group E — flagged, not silently accepted

### R-27 · `GET /api/health` is public and leaks deployment detail.

F01 added it (its own contract delta) returning db name, LLM base URL, model, commit SHA and env.
It answers a real question no other route can. **Ruling: keep it, trim the payload** to
`{ ok, db: boolean, commit }`. No credential was ever exposed, but the database name and LLM
provider are free reconnaissance for zero benefit.

### R-28 · F08's contrast numbers were measured against surfaces F10 did not pick.

F08 validated against `#fcfcfb` / `#1a1a19`; F10 subsequently computed its own OKLCH palette.
Three light-mode category slots already sit in the sub-3:1 relief band.
**Ruling: F10's surfaces win, and F08's validator must be re-run against them before `/stats`
ships.** This is a hard gate in F08's QA, not a note.

### R-29 · EXIF orientation is unverified.

F06 could not test it without a physical device, and warns that passing `exifOrientation`
speculatively causes a *double* rotation. **Ruling: QA step 4 is a hard gate.** Ship nothing until a
real portrait photo from the iPhone renders upright.

### R-30 · Rate limiting on `/api/parse` is consciously deferred.

Roadmap D3 lets any Google account sign in, so `/api/parse` is an authenticated but open door onto
metered LLM spend. F04's in-memory burst limiter is best-effort only — serverless instances do not
share memory, and its own code comment says so. **Ruling: accepted for v0.1.0, with a named
tripwire** — before the domain is publicised, either restrict sign-in to an allowlist or add a
persistent counter.

---

## Open questions for the user

1. **`perumahan laddaland 49k`** — F04 refused to guess. It sits beside `kungfu soccer 49k` at an
   identical price, and *Laddaland* is a 2011 Thai horror film, so two cinema tickets is the natural
   reading — but "perumahan" means *housing*, which collides with a category slug. This becomes a
   worked example in the parser's system prompt, so the wrong answer teaches the model a wrong rule.
   **What was that money actually spent on?**
2. **Neon region.** If the project is not in `ap-southeast-1` (Singapore), recreate it now while
   there is no data — every query from Jakarta otherwise crosses an ocean.
3. **The three `AUTH_*` values currently in `.env.local`** were copied from a different project.
   They must be replaced with credentials from the new Google Cloud project before anything real is
   stored.
4. **Credential hygiene.** `LLM_API_KEY` and both Neon connection strings were pasted in plain text
   into a chat transcript. Rotating them before launch is cheap; not rotating them is a decision, so
   make it deliberately.
