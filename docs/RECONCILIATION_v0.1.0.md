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

---

## Addendum — rulings from F05 (landed after the first pass)

### ⚠️ R-31 · `PhotoPicker` must publish upload-busy state, or photos vanish silently.

**Raised by:** F05. **Confirmed by reading F06**, which computes an `inFlight` value internally and
explicitly records that it *did not* expose it.

F05 owns the "Simpan" button; F06 owns the uploads. With no channel between them, a user who taps
Simpan while a photo is still uploading gets a saved expense whose gallery is missing that photo —
**no error, no retry, no trace.** Silent partial data loss is the worst failure mode we have, and it
lands on the tap the user cares most about.

**Ruling. F06 adds one prop:**

```ts
onBusyChange?: (busy: boolean) => void   // fires on every inFlight transition
```

F06 already tracks `inFlight`; this only publishes it. F05 disables Simpan while `busy` is true and
shows "menunggu foto selesai diunggah…". This is the one case in the whole plan set where the save
button is legitimately disabled — F05's own rule is that validation never disables it, because a
dead button with no explanation is worse than an inline error.

### R-32 · `inputMode` on the amount field: `decimal`, not `numeric`.

My F05 brief mandated `inputMode="numeric"`; F10's `MoneyInput` ships `decimal`, alongside a
documented refusal to use `type="number"` (which rejects the loose input — `45k`, `1,5jt` — that
makes manual entry as forgiving as the LLM path).

**Ruling. F10 wins.** On iOS both render a digits-only pad, so the user-visible difference is nil,
and overriding a design-system component on a single screen is how design systems rot. My brief was
the less-considered of the two.

### R-33 · F05 ships zero shared components.

F05 had specified `MoneyInput`, `Chip` and `CategoryPicker` under `components/expense/` — all three
already published by F10. It deleted its own and rewired `DraftItem` from `amountText`/`amountIdr`
to `amountIdr`/`amountRaw` to match `MoneyInput`'s callback contract. **Recorded so nobody
reinstates them.** This is the correct resolution of the same class of collision as R-7 and R-8.

### Note on F05's provenance

F05 reported damaging its file mid-edit and rebuilding the body. **Verified after the fact:** 2,797
lines, 18 task headings, all four required sections present exactly once, code fences balanced, and
every remaining `photoIds` occurrence is discussion of the R-2 conflict rather than stale
specification. The file is sound.

---

## Addendum — rulings from F03a (landed during implementation)

F03a shipped `lib/categories.ts`, `lib/id.ts`, `lib/format.ts` and `lib/schema/expense.ts` under
R-9. Five decisions were forced that no earlier ruling covered. **F10 reads this section before
importing anything.**

> **Renumbered R-34…R-38 → R-42…R-46 by F10.** This addendum originally reused numbers the
> Claude Design pull had already taken (`docs/design/DESIGN_INTEGRATION.md`, committed first
> and cited by roadmap §4.1), so there were two R-34s and two R-38s in the same arbitration
> record. The design's numbering wins because it was there first and is referenced from the
> roadmap; these five moved. **All rulings, from every source, now live in one sequence** —
> DESIGN_INTEGRATION.md holds R-34…R-41 and this file holds the rest.

### R-42 · `lib/id.ts` wraps `nanoid`. F03's D-E is overturned by F01 and F06.

D-E hand-rolled a 64-symbol generator on the argument that `nanoid@5` "is not in the pinned stack
table (§3)". That premise expired before F03a executed:

- **F01 pinned `nanoid@5.1.16`** in `package.json` — it is already a production dependency.
- **F06 imports `nanoid` directly**, `nanoid(21)`, for blob pathnames (its plan §Task 7).

So the dependency ships either way, and hand-rolling would leave **two CSPRNG id generators with
different alphabets** in one tree — the precise duplication R-7, R-8 and R-33 each struck down.

**Ruling. `lib/id.ts` re-exports nanoid's generator.** Nothing observable changes: the default
alphabet is the same 64 URL-safe symbols drawn from `crypto.getRandomValues` with no modulo bias, so
F09 §2.2's 72-bit figure is unaffected. Only the symbol *ordering* differs, and no consumer may
depend on it. `ID_ALPHABET` is now exported so `isValidId` and `ID_ENTROPY_BITS` are derived from the
generator rather than asserted beside it.

### R-43 · `formatJakartaLong` is an alias of `dayLabel`, not a second Intl implementation.

R-21 accepted F09's `formatJakartaLong(iso)` into `lib/format.ts`. F09's body used
`Intl.DateTimeFormat('id-ID', …)` anchored at Jakarta midnight. Its output — `Selasa, 18 Agustus
2026` — is **character-for-character what `dayLabel(iso)` already returns** from the hardcoded name
tables, and plan D-F rules out `Intl` for Indonesian names precisely so the string cannot drift with
an ICU release.

**Ruling. `formatJakartaLong = dayLabel`.** The export exists, F09 needs no edit, and there is one
implementation. A unit test asserts the two agree across five dates so an "optimisation" that
un-aliases one of them fails loudly.

### R-44 · `isAfterCurrentMonth` moves into `lib/format.ts`.

R-10 deleted `lib/month.ts` and listed seven symbols F07 imports from `lib/format.ts` instead. F07
also used `isAfterCurrentMonth(monthKey)` to disable the "next month" arrow, and that symbol was on
neither list — deleting the module would have stranded it.

**Ruling. Added**, as `isAfterCurrentMonth(month, now?)`. The optional `now` makes it testable, which
F07's version was not.

### ⚠️ R-45 · `isValidMonthKey` has no year bound. F07's `/m/<year>` 404 behaviour changes.

F07's `isMonthKey` rejected years outside 2000–2100; F03's `isValidMonthKey`, which R-10 makes the
survivor, checks shape only. **Consequence F07 must absorb:** `/m/1899-01` and `/m/9999-12` now
render an empty month instead of a 404.

**Ruling. F03's shape wins** — it is also `MonthKeySchema`'s regex and F04/F08 already build against
it. If F07 wants the 404 it adds the range check at the route boundary, where a routing decision
belongs, rather than inside a shared validator three other features share.

### R-46 · `NewPhotoInputSchema` lives in `lib/schema/expense.ts`, with dimensions **required**.

R-2 changed `createExpense` to take `photos?: NewPhotoInput[]` but left the Zod object unowned — F06
publishes only the TypeScript type, in `lib/photos/types.ts`.

**Ruling.** F03a owns the Zod mirror, named `NewPhotoInputSchema`, next to the `CreateExpenseInput`
that consumes it. It mirrors F06's `StagedPhoto` **field for field, with `width`/`height`/`sizeBytes`
required** — F06's client compresses before upload and always has them. Note this differs from
`AttachPhotoInput`, where the same three are optional: that path also serves `onUploadCompleted`,
which does not see the image. The asymmetry is deliberate; do not "harmonise" it.

### R-60 · A unique violation reaches you on `error.cause`, not in `error.message`.

Plan Open question 6 asks whether F09 should retry a share-token collision. It must, and the
detail it needs is one layer down: Drizzle wraps the driver error, so the outer `message` is
only `Failed query: insert into "share_links" …`. The `NeonDbError` on **`.cause`** is what
carries `code: '23505'` and `constraint: 'share_links_group_id_unq'`.

**Ruling.** Any retry or friendly-error path keys off `error.cause.code`, never a regex over
the outer message — a message regex silently never matches, which turns a formality into an
unhandled 500 exactly as that open question warned. Measured against the live database and
asserted in the integration suite. The recommendation in Open question 6 stands: F03 does not
publish `mintShareToken`, because a mutation helper here would break the "F03 ships no
mutations" boundary; F09 owns the retry, with this ruling as its spec.

### Test-suite provenance

218 tests, all green, plus `tsc --noEmit`, `eslint .`, `prettier --check` and `next build`. The
§8.1/§8.1b/§8.2/§8.3 money tables are transcribed row for row, including the
`parseIdrLoose(formatIdr(n)) === n` round-trip property. F07's TZ-independence suite was kept per
R-10 and now runs under Pacific/Kiritimati (UTC+14), Pacific/Midway (UTC-11), UTC and
America/New_York; a runtime `process.env.TZ` change was confirmed to actually move Node's local-time
getters, so that suite fails a naive implementation rather than passing vacuously.

---

## Addendum — rulings from F10 (landed during implementation)

F10 shipped `app/globals.css`, `lib/cn.ts`, `app/fonts.ts`, `components/ui/**`,
`components/AppShell.tsx`, the root layout, both route-group layouts, `app/manifest.ts`, the icon
set and `scripts/palette-check.py`.

It executed **after** the Claude Design pull, so its plan file was two documents out of date: the
reconciliation rulings above supersede parts of it, and `docs/design/DESIGN_INTEGRATION.md`
(R-34…R-41) supersedes more. Where all three disagreed the order of precedence was the one
DESIGN_INTEGRATION states — iOS constraints, then roadmap §4, then accessibility floors, then the
design's aesthetics, then F10's plan. **Anyone reading `docs/plans/F10-design-system.md` for the
component contract should read its *Interfaces I publish* section, which has been rewritten to
match what shipped; the task list above it is now a historical record of a palette that was
replaced.**

### ⚠️ R-47 · `tokens.css` declares the category colours circularly. Fixed in `globals.css`.

`docs/design/tokens.css` — the normalised pull — declares the eight category values as
`--color-cat-<key>` at `:root`, then declares the *same names* inside `@theme inline`:

```css
:root { --color-cat-food: #9c4a2a; }
@theme inline { --color-cat-food: var(--color-cat-food); }   /* refers to itself */
```

Tailwind emits its `@theme inline` colours into its own `:root`, so the shipped property would
have resolved to itself — invalid at computed-value time, i.e. every chip, code and category bar
painting nothing. Verified against a real build: the emission is real, and it is what forced this.

**Ruling. Split the name from the value.** `app/globals.css` holds the raw value as `--cat-<key>`
plus an explicit `--color-cat-<key>: var(--cat-<key>)` alias at `:root`, and maps the alias through
`@theme inline`. Both consumers work: `var(--color-cat-food)`, which is the name
`CategoryMeta.color` publishes under R-7, and the `bg-cat-food` / `text-cat-food` utilities.
`tokens.css` keeps the pulled values as the provenance record and is not a build input.

Related build fact, recorded because it looks like a bug the first time you see it: Tailwind v4
prunes theme variables nothing references, so `--color-paper` is absent from the CSS until
something uses `bg-paper`. Only the `:root` aliases above are emitted unconditionally.

### ⚠️ R-48 · `ink-3` failed WCAG 1.4.3 at 2.85:1. The token is amended, not waived.

`scripts/palette-check.py` (new, and the tool R-28 asks for) measured the design's `--ink-3`
`#8f8d81` at **2.85:1 on paper** and 3.19:1 on card. `ink-3` is every field label, every meta line,
every placeholder, the inactive tab label and the ghost-button text — all of it small text the user
reads, so 4.5:1 applies with no large-text exemption available.

**Ruling. Darkened along its own hue until it passes**: `#6e6c61` light (4.51 on paper, 5.05 on
card) and `#86857b` dark (5.01 on paper, 4.50 on card). Accessibility floors sit above the design's
aesthetic choices in DESIGN_INTEGRATION's own precedence list, and the conflict table already
prescribes exactly this move for a colour that misses a threshold — keep the hue, change the
lightness, re-run the checker.

The cost, stated plainly: `ink-2` and `ink-3` now sit close together in light mode (ΔE 0.057). That
is affordable **only** because this design does not use colour for hierarchy — a label reads as a
label because it is 10px mono uppercase at 0.2em tracking. Do not "restore" the pale grey.

### R-49 · `--rule-strong` is added, because a 1.28:1 hairline cannot identify a control.

The design ships two line tokens, both soft. `rule` at 1.28:1 on paper is right for a card edge or
a row separator: decorative, and backed up by layout and by the card's own fill. But WCAG 1.4.11
wants 3:1 for the boundary that *identifies a user-interface component*, and an input's fill
differs from the page by only 1.09:1 — so on a text field the border is doing that job alone, and
failing it.

**Ruling. A third line token, used by controls only**: `#8d887b` light / `#696962` dark, 3.02:1 and
3.36:1 respectively. Applied to `Input`, `TextArea`, `MoneyInput`, `Button variant="secondary"` and
the `CategoryPicker` cell. Container edges, row separators and the sheet's grabber keep the soft
`rule`. This restores the distinction F10's own palette had as `--app-border` /
`--app-border-strong` and the pull collapsed away.

This is the most visible aesthetic change F10 made to the design, and it is a one-line revert:
point `--rule-strong` at `var(--rule)` and re-run `scripts/palette-check.py` to see the cost.

### R-50 · Categorical separation is below the 0.10 floor, with a waiver that can expire.

The eight hues sit as close as **ΔE 0.065 (light) / 0.042 (dark)** in Oklab — worse than the
numbers that condemned the donut in R-3. This is nonetheless accepted, because in this design
colour never identifies a category on its own: `Chip`, `CategoryCode` and `CategoryPicker` have no
colour-only mode, every row carries the two-letter code, the 12-month chart has no categorical
series at all (`accent` for the current month, `rule` for the rest), and the breakdown is a labelled
bar list rather than a ring of eight competing wedges.

**Ruling. Waived and recorded in the checker's own output**, so the number cannot be rediscovered as
a surprise. `scripts/palette-check.py` prints the waiver and its expiry condition on every run and
excludes the figure from its exit code. **The waiver expires the moment any view keys a category by
colour alone** — a legend without codes, a pie, a stacked bar, a colour-only sparkline. F08 reads
this before adding any mark that is not the bar list.

All contrast checks pass otherwise, in both themes, including the one R-28 flagged: every category
colour clears **4.5:1 as text** on both surfaces (light 4.53–7.10, dark 5.78–8.63). The design's
claim was true; it is now measured rather than inherited.

### R-51 · The `(shell)` group holds two routes, not four.

R-25 put the TabBar in a route group with `/s/[token]` and `/new` outside it; design R-38 then moved
`/e/[id]` out too. Composing both leaves `app/(shell)/` owning only `/m/[month]` and `/stats`, with
`/`, `/new`, `/e/[id]` and `/s/[token]` in `app/(bare)/`.

**Noted, because the design prototype disagrees with the rulings and someone will spot it.** `03 App
Prototype` renders the tab bar on its Tambah screen (`showTabBar: ['month','add','stats']`). The
rulings win: they were written after that prototype, they say it twice independently, and `/new`
ends in a full-width Simpan exactly where the bar would sit.

**Consequence F05 must absorb:** `/new` has no tab bar, so it needs its own way back — the design's
header pattern of back chevron · mono label · optional action, as on the Detail screen. F10 does not
ship that header, because what flanks the label differs per route and F10 does not own screens.

`app/page.tsx` also moved to `app/(bare)/page.tsx` so the landing gets the centred column. The route
is unchanged — a route group never appears in a URL — and R-6 still gives it to F02, which must
render into that file rather than create a second `/`.

### R-52 · Deltas to F10's published component contract

Every one of these is a widening or a default change, not a removal, so nothing typed against the
old signatures fails to compile. Listed because a silently different default is worse than a
renamed one.

| # | Was | Is | Why |
|---|---|---|---|
| a | `Button size` default `md` (44px) | default **`lg`** (52px) | 52px is the design's normal button; 44px is its small variant (R-41). |
| b | `Spinner` | `LoadingDots`, with `Spinner` as an alias | The loading state is three pulsing dots. Nothing in this system spins. |
| c | `Card padded?: boolean` | `boolean \| 'rows'` | `'rows'` is the 16/6/2 inset a list of rows wants, so separators span the text column and a 44px delete target sits flush right. Used by F05, F07, F09. |
| d | `Sheet showCloseButton` default `true` | default **`false`** | The design has no close button; the scrim and Escape dismiss. Pass `showCloseButton` where a sheet is an editor rather than a picker. |
| e | `MoneyInput onValueChange` fires on blur | fires on **every accepted change** | The running total must not lag the field. Follows from the component being fully controlled. Handlers must be idempotent. |
| f | `MoneyInput` shows plain digits while focused | always shows the grouped form | R-37: dots are inserted as you type, never typed. |
| g | `CategoryDot` for dense rows | **`CategoryCode`** added; `CategoryDot` kept | The code carries colour *and* identity. Prefer it everywhere; the dot survives only for a legend that has room for nothing else. |
| h | `max-w-app` = 480px | **416px** | The design canvas is 414px. |
| i | `--radius-sm/md/lg/xl`, `--shadow-raise/sheet` | `rounded-chip/field/card`, no shadow tokens | R-36: zero shadows. The radius names come from the design. |
| j | token names `surface*`, `text*`, `accent`, `danger` | `paper*`, `card`, `ink*`, `rule*`, `accent`, `red` | The design's names, already normalised into `docs/design/tokens.css`. **This is the delta most likely to bite waves 3–5** — the old names do not exist, and neither does `bg-gray-100`. |

### R-53 · Next 16 emits `mobile-web-app-capable`, not the Apple-prefixed legacy tag.

F10's plan expected `<meta name="apple-mobile-web-app-capable" content="yes">` in the served HTML.
`appleWebApp.capable` in Next 16.3.1 emits the standardised `mobile-web-app-capable` instead, which
Safari has honoured since iOS 16.4. The target device runs up to iOS 18, so this is not a defect —
but standalone mode is the entire PWA pitch, so the legacy tag is also emitted via `metadata.other`
as one line of insurance against an un-updated phone.

Verified in the served HTML: `viewport-fit=cover`, both `theme-color` media variants, the
`apple-touch-icon` link at 180×180, `apple-mobile-web-app-title`, `-status-bar-style`,
`format-detection`, and `/manifest.webmanifest`.

### What F10 did NOT verify, and cannot

The Visual QA and Accessibility checklists in `docs/plans/F10-design-system.md` are **outstanding**.
Everything in them that a build can prove was proven — the namespace reset, the token emission, the
contrast figures, the production 404 on `/dev/ui`, the metadata, the utilities compiling. Everything
that needs eyes or a touchscreen was not:

- **Zoom on input focus.** The 17px floor is in the base layer where a class cannot override it, but
  only a real iPhone proves no field slipped through.
- **Tabular figures.** IBM Plex Mono is monospaced and `tnum` is applied, but the whole money rail
  rests on that assumption. `/dev/ui`'s alignment card is the test.
- **Sheet motion, scrim tap, overscroll containment, and open → Escape → open.**
- **Safe areas on a notched device**, which is the only place `viewport-fit=cover` can be observed.
- **Both colour schemes by eye.** `document.documentElement.dataset.theme = 'dark'` forces one.

`/dev/ui` exists for exactly this pass and 404s in production.

---

## Addendum — rulings from F03b (landed during implementation)

F03b shipped `lib/db/schema.ts`, `lib/db/index.ts`, `lib/db/queries.ts` and
`drizzle/0000_clear_edwin_jarvis.sql`, applied to Neon. The generated migration matches the
plan's §6.2 expectation statement for statement, and all six §6.4 verification queries
pass against the live database (8 tables, 6 FKs all `confdeltype = c`, the four indexes
including the `DESC NULLS LAST` composite and the UNIQUE on `share_links.group_id`).

Six decisions were forced that no earlier ruling covered. **F05, F06, F07, F08 and F09 read
R-54 and R-58 before writing a query.**

### ⚠️ R-54 · A correlated aggregate written as a raw `sql` fragment silently returns Rp 0.

The plan's §5.8 source for `getMonthGroups` writes its three aggregates as
`` sql`... where ${expenseItems.groupId} = ${expenseGroups.id}` `` in the select list. In a
select list with **no join**, Drizzle renders columns *unqualified*, so that emits:

```sql
select "id", coalesce((select sum("amount_idr") from "expense_items"
                       where "group_id" = "id"), 0)   -- ← both names resolve INSIDE expense_items
from "expense_groups"
```

`expense_items` has an `id` column of its own, so Postgres resolves both sides to the inner
table and the correlation degrades to `expense_items.group_id = expense_items.id`. That
matches nothing, every group total on `/m/[month]` reads **Rp 0**, and nothing anywhere
errors. Verified by printing the emitted SQL for both forms.

**Ruling. Correlated subqueries are built as sub-BUILDERS, never as raw fragments**, because
a builder's `WHERE` is always fully qualified:

```ts
const totalSub = db.select({ v: sql`coalesce(sum(${expenseItems.amountIdr}), 0)` })
  .from(expenseItems).where(eq(expenseItems.groupId, expenseGroups.id))
// select list: sql<number>`(${totalSub})`.mapWith(Number)
//   → (select coalesce(sum("amount_idr"), 0) from "expense_items"
//      where "expense_items"."group_id" = "expense_groups"."id")
```

`tests/db.queries.sql.test.ts` counts the qualified correlation predicates, so the raw form
cannot come back unnoticed. Two consequences worth knowing:

- A `.limit(1)` inside a select-list subquery is parameterised, so `getMonthGroups`'
  parameters are `[1, userId, startISO, endExclusiveISO]` — the `1` arrives *first*, because
  the select list is rendered before the `WHERE`.
- The same trap does **not** apply to the ownership predicates or to any of the other five
  reads: `WHERE`-clause columns are always qualified, and every other read has a join.

### R-55 · `lib/db/index.ts` reads `process.env.DATABASE_URL`. Plan Open question 1 is closed.

The plan left open whether the client should import F01's validated `env` object. It must
not: `lib/env.ts` opens with `import 'server-only'`, whose default export condition *throws
on import*, and Vitest resolves the default condition. Routing the client through it would
take every `lib/db` unit test down with it, and drizzle-kit plus `scripts/*.mjs` cannot
import it either. `lib/env.ts` still validates both connection strings at app boot; the
client reads the same variable one layer lower and keeps its own loud throw as the backstop.

### R-56 · `npm run test:int` could not collect a single file. Fixed in the one Vitest config.

F01's script was `vitest run --dir tests/integration` while its `exclude` named
`tests/integration/**`. Two separate reasons that never worked, both verified:

1. `--exclude` on the CLI **appends** to the config's list rather than replacing it, so the
   exclusion could not be lifted from the command line.
2. `--dir` re-roots file discovery, so the `tests/**/*.test.ts` include pattern no longer
   matched anything under it.

**Ruling.** R-11's "do not write a second config file" holds. The single config gates the
exclusion on `VITEST_INTEGRATION=1`, and `test:int` becomes
`VITEST_INTEGRATION=1 vitest run tests/integration` — an env flag plus a path filter, no
`--dir`. `npm test` still never reaches a database, and the suite still `describe.skipIf`s
itself when `TEST_DATABASE_URL` is unset, so both gates must be open for it to run.

### R-57 · `getMonthToDatePair` brackets its `WHERE`; `throughDay` is validated.

Additive to F08's Delta 3. F08's SQL sketch filters only on `user_id`, which scans every
group the user has ever had in order to sum two 19-day windows. The shipped version keeps
the two FILTERed sums but adds `occurred_on >= previousMonthStart AND < monthEnd`, so the
`(user_id, occurred_on DESC)` index still drives the scan. `throughDay` must be an integer
in 1..31 or it throws `RangeError` before the round trip, matching `getMonthlyTotals`'
treatment of `months`. Return shape is unchanged: `{ currentIdr, previousIdr }`, both
`.mapWith(Number)`, both `0` rather than `undefined` for an empty pair of windows.

### R-58 · Two stale F03 references in F07's plan, and one additive field.

F07 §"Interfaces I consume" was written against a draft of F03 and is wrong in two places
that will not compile:

- It imports `newId()` from **`lib/db/ids`**. There is no such module — R-42 put the
  generator in **`lib/id.ts`**, re-exporting nanoid. Import from `@/lib/id`.
- Its `MonthGroupRow` omits `note`, which the shipped row includes (it always did). Purely
  additive; F07 may ignore the field.

Recorded rather than silently absorbed because F07 is the next feature to consume this
module and its Task 0 tells it to compare shapes and "stop and raise it with F03's owner".

### R-59 · The unscoped read still names `user_id` — as a join key, not a filter.

`getGroupByShareToken` must join `user` to resolve `ownerName`, so its first statement
contains `"user"."id" = "expense_groups"."user_id"`. That is the join key, not a predicate:
no user id is ever bound, and the only parameter in all three statements is the token. The
test asserts the *predicate* form `"user_id" = $` is absent and that the bound string
parameters are exactly `[token]`, rather than banning the substring — a substring ban would
have to be weakened later by someone who no longer remembers why it was there.

### Test-suite provenance

287 unit tests green (69 new: 21 schema, 4 client, 10 ownership, 34 read-layer), plus
`tsc --noEmit`, `eslint .`, `prettier --check .` and `next build`. The read-layer tests run
the **shipped functions** against a fake Neon client (`tests/support/probeDb.ts`) and assert
the SQL and parameters actually emitted, rather than rebuilding the query inside the test
and asserting that the test agrees with itself — which is what caught R-54.

`tests/integration/queries.int.test.ts` covers all twelve assertions in plan §10 plus R-15
and the §9.2 cross-user `UPDATE`. **17/17 green against the live Neon database**, on the
user's explicit go-ahead to use `main` rather than a branch (plan Open question 4) — the
database held nothing but the freshly applied schema, and the suite deletes its own two users
in teardown, which is assertion 10. Verified afterwards: every table back to zero rows.

Re-run under `TZ=America/New_York` (UTC−4), `TZ=Pacific/Kiritimati` (UTC+14) and
`TZ=Pacific/Midway` (UTC−11): **17/17 in all three**. That is the run that proves plan D-B —
`occurred_on` is a `'YYYY-MM-DD'` string end to end and no process timezone can move it a
day. Also proven rather than asserted: `SUM(bigint)` arriving as a JS `number`,
`ON DELETE CASCADE` on all six FKs, the `share_links` UNIQUE constraint, cross-user isolation
on every read plus the nested `UPDATE`, and the round-trip counter — `getGroupDetail` and
`getGroupByShareToken` cost exactly **one** `fetch` each.
