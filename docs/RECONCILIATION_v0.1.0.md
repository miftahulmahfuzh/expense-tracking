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

---

## Addendum — rulings from F02 (landed during implementation)

R-1 and R-5 had already retargeted F02 before it ran; what follows is what implementation
found on top of them. Numbering continues from R-60.

### ⚠️ R-61 · `unstable_doesProxyMatch` does not exist in the shipped `next@16.3.1`.

The Next 16.3.1 proxy docs — the copy in `node_modules/next/dist/docs`, so not a stale
tutorial — document the matcher unit-test helper as `unstable_doesProxyMatch`. The shipped
build exports **`unstable_doesMiddlewareMatch`**; the rename landed in the documentation
ahead of the code. Same signature, same module (`next/experimental/testing/server`).

**Ruling.** `tests/auth.proxy.matcher.test.ts` calls `unstable_doesMiddlewareMatch` and says
why in a comment. Recorded because the docs will eventually catch up and the call will then
look like the stale one.

Two further things that bite anyone importing that module from Vitest, both worked around in
the test rather than in `vitest.config.ts`:

1. It throws **at import time** — `Invariant: AsyncLocalStorage accessed in runtime where it
   is not available` — unless `globalThis.AsyncLocalStorage` already exists. Next's own
   runtimes install it as a global; plain Node does not. The test assigns it from
   `node:async_hooks` first, which forces the import of the helper to be dynamic, because a
   static `import` would hoist above the assignment.
2. Importing `@/proxy` pulls in `next-auth`, whose internals import the bare specifier
   `next/server`, which Vitest's resolution cannot follow the way the Next bundler can. The
   test stubs `next-auth`; it only wants the `config` export. The handler half is covered by
   the live dev-server run below.

### R-62 · The build artefact is still `.next/server/middleware.js`, from a `proxy.ts` source.

F02's plan §Task 14 greps `.next/server/middleware.js` to prove the database layer never
reached the proxy bundle. That path is still correct in Next 16.3.1 — the *file convention*
renamed, the build output did not. Looking for `.next/server/proxy.js` finds nothing and
reads as "the check no longer applies".

Run as R-1 demoted it, a bundle-size check rather than a correctness gate. Measured: the
proxy graph is one 384 KB chunk (Auth.js core, unavoidable) with **zero** occurrences of
`drizzle-orm`, `@neondatabase` or `neon-http`. The split config is doing the job it is now
kept for.

### R-63 · `safeNext()` is a fourth additive file, because `'use server'` forbids the third.

F02 §9 lists three additive files. There is a fourth: **`lib/auth/safeNext.ts`**.

The plan put the open-redirect guard inside `lib/auth/actions.ts` as a module-private
function. Two things make that impossible as written: every export of a `'use server'` module
must be an async function, so the guard cannot be exported from there — and
`app/(bare)/page.tsx` needs it, because it honours `?next=` for an *already signed-in*
visitor too. A private copy in the page would be the same guard written twice, which is how
one of the two copies later stops matching the other.

Type-only widening while moving it: the parameter is `unknown`, not `FormDataEntryValue |
null`, so the page can pass a `searchParams` value (`string | string[] | undefined`) without
a cast. Unit-tested in `tests/auth.safeNext.test.ts`, including the `string[]` case Next
hands back for a repeated query key.

### R-64 · `lib/env.ts` already carried the `AUTH_*` block. F02 supplies only the call site.

Plan Task 4 has F02 add four entries to `lib/env.ts`'s Zod schema. F01 had already shipped
them, deliberately, behind a lazy `authEnv()` with the comment *"F02 owns these. Validated on
first call, which F02's `auth.ts` makes module-scope."*

**Ruling. F01's arrangement stands and F02 honours it**: `auth.ts` calls `authEnv()` at module
scope, and Task 4 is already done. This is the only spot that works — `auth.config.ts` is
imported by `proxy.ts`, and `lib/env.ts` opens with `import 'server-only'`, which throws
outside a React Server Components graph. The plan's rule "`lib/env.ts` must not be imported by
`auth.config.ts` or `proxy.ts`" therefore survives R-1 intact, for a reason that has nothing
to do with the Edge runtime it was originally written about.

### R-65 · `GET /api/auth/session` answers `null` when signed out, not `{}`.

Plan §8 step 2 expects an empty object. `next-auth@5.0.0-beta.32` returns the JSON literal
`null`. Both are falsy and no application code reads that endpoint, but a verification step
whose stated pass condition never occurs is a step people learn to skip.

### R-66 · The plan's UI is written against a token set that does not exist.

`app/page.tsx`, `SignOutButton` and `AccountMenu` in F02's plan are styled with
`text-neutral-500`, `bg-red-50`, `border-neutral-200`, `dark:bg-neutral-900` and a full-colour
Google `<svg>`. R-52j removed exactly those names — the palette is `paper*` / `ink*` / `rule*`
/ `accent` / `red` — and design R-34/R-40 replaced the mark with a serif `G` on a secondary
button reading `Lanjut dengan Google`.

**Ruling. The design wins, as R-6 always said it would**: F10 supplies the presentation, F02
supplies the session logic. All three files render through `@/components/ui`. The plan's
instruction to "keep the structure — form → hidden `next` → submit button" is honoured
exactly; only its classes are gone.

Consequence for F07, which R-6 leaves owning the header: `AccountMenu` ships unused. It is
`px-gutter py-3`, a 44px `Button size="md"`, and no chrome of its own, so it drops into a
sheet or a header row without a fight.

### Verification: what F02 actually proved, and what it could not

Green: `npm test` **306/306** (19 new — 5 `safeNext`, 8 `requireUserId`, 6 matcher),
`next typegen && tsc --noEmit`, `eslint`, `prettier --check .`, `next build`.

Against a live `next dev`, signed out: `/api/auth/providers` lists exactly one provider;
`/new`, `/stats`, `/m/2026-08` and `/e/abc123` all 307 to `/?next=<encoded>`; **`/s/abc` does
not redirect**; `/api/health` still answers 200; `/api/auth/signin` is not intercepted; `/`
renders all four R-40 strings; `?error=` renders the alert; and the hidden `next` field holds
`/` for `https://evil.com`, `//evil.com`, `/\evil.com` and `javascript:alert(1)`, but
`/new?a=1` for `/new?a=1`.

Signed in, using a **synthetic session cookie** minted with `@auth/core/jwt`'s `encode()` at
the same `AUTH_SECRET` and salt — which is a real test of our own callbacks precisely because
the JWT strategy means a session read touches no database: `/api/auth/session` returns
`{"user":{…,"id":"usr_synthetic_test"}}`, so `token.sub` → `session.user.id` works end to
end; the four protected routes stop redirecting and 404 instead, which is correct, F05/F07/F08
have not built them; `/` redirects to `/m/2026-08`; `/?next=/stats` redirects to `/stats`;
`/?next=https://evil.com` redirects to `/m/2026-08`.

**Not verified, and unverifiable from here:** the Google round trip itself. Nothing in this
session opened a browser, so the OAuth consent screen, the `redirect_uri` Google actually
accepts, and the `user`/`account` rows the adapter writes on first sign-in are all untested.
Plan §8 steps 7, 8, 12 and 13 remain outstanding and need a human with a browser. The
credentials in `.env.local` are real and the console walkthrough in the plan was already
completed, so this is one manual pass, not a blocked task.

---

## Group I — F04 (LLM parsing engine), recorded during execution

Wave 3. Rulings R-67…R-76. The plan is `docs/plans/F04-llm-parsing.md`; where it is wrong
about the codebase it has been corrected in place, for the same reason F03's §5.8 was —
copying the original text forward ships the bug a second time.

### ⚠️ R-67 · `parseExpense.ts` cannot import `./client` at module scope.

The plan's Task 9 has `parseExpense.ts` do `import { llm, LLM_MODEL } from './client'`, and its
Task 8 tests then `import { parseExpenseWith } from '../parseExpense'`. That combination cannot
work. `client.ts` opens with `import 'server-only'` (F04 Contract delta #2, and the whole point
of the module being separate) and imports `lib/env.ts`, which does the same. Both throw outside
a React Server Components graph, and **Vitest is not one** — F03 hit this exact wall in
`lib/db/index.ts` and R-55 records it. The plan anticipated only a missing-env-var failure and
proposed `.env.test`, which does not address the marker at all.

**Ruling. The client is injected, and the production wrappers resolve it lazily.**

- `parseExpenseWith(client, input, { model })` is the testable core; `client` is a parameter,
  typed as the three-method-deep `LlmClientLike`.
- `parseExpense()` / `parseExpenseWithMeta()` reach the singleton through
  `await import('./client')` inside the function body. Node caches the module, so only the
  first call pays anything, and Next still sees a server-only edge at build time.
- `model` is a required option rather than a module-level constant read from the environment.
  A silent default is how a typo in `.env.local` becomes a mystery 404 (§4.8).

This is what makes the route test possible too: it stubs `parseExpenseWithMeta` on top of the
**real** module via `importActual`, which would be unloadable under the plan's arrangement.

### R-68 · The route's auth import and its 401 body both differ from the plan.

Plan Task 12 imports `requireUserId` from `@/lib/auth`. Two problems: there is no `@/lib/auth`
barrel (F02 ships `lib/auth/requireUserId.ts`), and `requireUserId()` signals by calling
`redirect()`, which its own docblock forbids in a Route Handler — a 307 to an HTML page is a
terrible answer to `fetch()`. F02 published `requireUserIdApi()` + `UnauthorizedError` for
precisely these two routes.

**Ruling. `requireUserIdApi()`, and F04's error envelope for the 401.** F02 also publishes
`unauthorizedJson()`, whose body is `{ error: 'Unauthorized' }`; `/api/parse` does **not** use
it. F05 branches on `body.error.code` and renders `body.error.message`, and the other six
statuses on this route all answer `{ ok: false, error: { code, message } }`. Answering 401 in a
second shape would force every caller to special-case the one path it exercises least in
development. The status code is identical either way, so this is a two-line reversal if strict
cross-route consistency with F06's upload handler is preferred later — but then F05 must handle
both shapes, which is the trade being made.

### R-69 · `ParseRequest`'s cap contradicted the route's cap.

`lib/schema/expense.ts` (F03a) capped `ParseRequest.rawText` at 20.000 characters; F04's
published contract and `MAX_RAW_TEXT_CHARS` say 8.000. `ParseRequest` is the schema F05's
client validates with before spending a round trip, so a paste of 9.000 characters would have
passed locally and come back 413.

**Ruling. F04's 8.000 wins and F03a's schema is amended** (the smaller change, and the number
is load-bearing: it is what bounds the cost of a single LLM call). The literal is repeated
rather than imported, because `lib/schema/expense.ts` is a pure wave-1 module and must not gain
an edge into F04's tree. `app/api/parse/__tests__/route.test.ts` ties the two caps together so
a future divergence fails a test.

### R-70 · OQ-6 answered, unexpectedly: z.ai caches the prompt on its own.

We send no `cache_control` — it is outside the portable surface §0.1 commits to — yet a warm
request reports `input_tokens: 36` with `cache_read_input_tokens: 4288`, against a
`countTokens` measurement of 4,302 for the same request. The endpoint is caching the ~4,300-token
system prompt + tool schema automatically.

**Ruling. Nothing to implement, and `usage` must report both numbers.** `ParseResult.usage`
gains `cachedInputTokens` (additive; `/api/parse` strips `usage` from the response either way),
because logging `inputTokens` alone understates the request by ~50×. The corollary matters more
than the field: the prompt's length is **not** the cost lever it appeared to be, so nobody
should trim the prompt to save tokens — its length is exactly what keeps the 1000× money bug
away. Measured figures live in `lib/llm/COST.md`.

### R-71 · OQ-7 answered: z.ai accepts the standard repair shape.

An assistant `tool_use` turn followed by a user `tool_result` with `is_error: true` is the
least-exercised corner of the wire protocol on a non-Claude backend, and the whole recovery
path depends on it. It works. The live suite proves it by taking a **real** first response and
stringifying its `amount_idr` values in flight, so the `tool_use_id` the repair turn references
is one the server actually issued; the second call returns exact amounts and
`source: 'llm_repair'`. The plan's fallback shape (a plain user text turn) is not needed.

### R-72 · OQ-8 answered, and the 25 s timeout genuinely fires.

Forced `tool_choice` was honoured on every one of ~90 live calls — no run ever came back as
prose. What did happen twice, on different fixtures (`rp-prefixed` at 25.014 s, and
`single-line` in an earlier run), is the primary call exceeding the 25 s client timeout and
degrading to the regex fallback. That is the p99 the fallback exists for, and it is the only
failure mode observed in development.

**Ruling. The timeouts stand, and the live suite retries once — on degradation only.**
`liveParse` re-parses when and only when the first attempt returned `source: 'fallback'`, i.e.
the model never answered. No accuracy assertion is retried: amounts, dates, counts and titles
still get exactly one shot at a real response, so the plan's "fix the prompt, never the
assertion" rule is intact. Failing the *prompt* over a transport timeout would be reading the
wrong signal.

Also recorded: we send `glm-5.2` and the endpoint echoes `"model": "glm-5.3"`. It aliases
upward, which means a future GLM release can change parser behaviour with no change on our
side. `npm run test:live` is the check to run against any unexplained parsing complaint.

### R-73 · Plan Tasks 0 and 2 are largely no-ops, as OQ-10 suspected.

`vitest`, `@vitest/coverage-v8`, `@anthropic-ai/sdk`, `server-only` and the three npm scripts
were already in `package.json`, and `vitest.config.ts` already unions the `tests/**`,
`lib/**` and `app/**` globs (R-11: F01 owns the runner). `tests/setup.ts` already seeds dummy
`LLM_*` values. Nothing was installed and no second config file was created.

Task 2's `parseIdrLoose` gate passed **25/25 against F03's implementation as shipped**,
including `1.5jt → 1500000`, which OQ-2 left open. The gate file is kept but deliberately
trimmed: `tests/format.money.test.ts` stays the canonical 46-case table, and F04's copy pins
only the behaviours the regex fallback is structurally built on. Duplicating the full table
would be the R-7/R-8 anti-pattern applied to tests.

### R-74 · The header-detection guard is mandatory, and needed a third branch.

Plan Task 4 offers a guard "if the Indonesian-month test fails". It always fails without it:
`belanja bulanan 18 Agustus 2026` ends in `2026`, which `TAIL_AMOUNT_RE` reads as an amount, so
the header becomes a Rp 2.026 item and the title is lost. The plan's proposed guard is also
insufficient — for a line that is *only* a date (`18/8/2026` on its own) it evaluates false and
the date line itself becomes a Rp 2.026 item.

**Ruling. Strip the date from line 0 first, then branch three ways** — empty ⇒ the line was a
bare date, skip it and synthesise a title; unpriced ⇒ it is the header; still priced ⇒ there is
no header and line 0 is an item. `fallbackParse.ts` carries this as a comment, because it is
the single least obvious thing in the module.

### R-75 · No `dynamic = 'force-dynamic'` on `/api/parse`.

Plan Task 12 exports it, copying `app/api/health/route.ts`. Next 16 dropped `dynamic` from the
route-segment-config table (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`
lists only `dynamicParams`, `runtime`, `preferredRegion`, `maxDuration`), and a POST handler is
never prerendered regardless. `runtime = 'nodejs'` is kept, explicitly and redundantly, for the
same reason the health route keeps it: to document that this route must never be flipped to
Edge. `maxDuration = 60` is kept — it is the Hobby ceiling and Vercel reads it from the build
output.

### R-76 · OQ-1 — ANSWERED BY THE USER: `perumahan laddaland` is a film. It is a movie ticket.

`perumahan laddaland 49k` sits beside `kungfu soccer 49k` at an identical cinema-ticket price,
which read as two film titles (Laddaland is a 2011 Thai horror film) — but *perumahan*
literally means housing, which is also a category slug, and live GLM answered `housing` more
often than not. The fixture accepted `entertainment | housing | other` rather than encode a
guess.

**The user confirmed it was a cinema ticket, so the guess is gone.** Three changes:

1. `FIXTURES[0].expect.categories[2]` is now `['entertainment']` — exact, not an allow-list.
   Every category in the canonical fixture is now asserted exactly.
2. The system prompt names the title in its entertainment examples, spelling out that
   *perumahan* is part of the TITLE and not a housing payment.
3. The ambiguity rule gained the magnitude tell that generalises past this one title: rent and
   service charges are monthly amounts in the hundreds of thousands or millions, **not 49 ribu**.

Verified live: `entertainment` on **three consecutive runs**, 15/15 each. This is the loop the
plan's "fix the prompt, never the assertion" rule describes, run exactly once — and the only
category assertion F04 ever loosened is now tightened.

Incidental confirmation of R-70 from the same runs: the first live run after editing
`prompt.ts` reports `input_tokens: 4412, cache_read_input_tokens: 0`, and every run after it
reports `60 + 4352`. The cache is keyed on the prompt, so a prompt edit costs one full-price
request and is then free again.

Still open, unchanged: **OQ-4** (published GLM-5.2 rates, and whether z.ai's 429 body matches
the Anthropic error envelope — no 429 was ever provoked, so `Anthropic.RateLimitError` vs a
generic `APIError` is untested; its 401 body is `{"error":{"message":…,"type":"401"}}`),
**OQ-5** (durable rate limiting — R-30 defers it to post-launch monitoring), **OQ-9** (whether
`degraded: true` should block saving — F05's call).

### Verification: what F04 actually proved

Green: `npm test` **418/418** (112 new — 4 fixtures, 25 `parseIdrLoose` gate, 28
`fallbackParse`, 10 Zod contract, 10 prompt, 18 `parseExpense`, 18 route), `tsc --noEmit`,
`eslint`, `prettier --check`, `next build` (lists `/api/parse` as ƒ dynamic).

`npm run test:live` — **15/15, three consecutive runs**, no retry ever triggered. The prompt
needed **no tuning**: every fixture parsed exactly on the first live run, including all four
1000× traps (`38.500`→38500, `1.250.000`→1250000, `4,5jt`→4500000, `58.850`→58850), the
DD/MM/YYYY dates, the Indonesian month names, the `total 44000` line that must not become an
item, and the `2x nasi goreng 60k` quantity line that must not become 120000.

Against a live `next dev` on port 3999, using a synthetic session cookie minted with
`@auth/core/jwt`'s `encode()` — the same technique F02's verification used:

- signed out, `POST /api/parse` → **401** `{"ok":false,"error":{"code":"unauthorized","message":"Sesi kamu habis. Login lagi ya."}}`, no `location` header;
- signed out with a malformed body → still 401, so auth precedes body parsing;
- `GET /api/parse` → 405 (Next supplies it);
- signed in, the roadmap §1 canonical paste → **200**, `source: "llm"`, `degraded: false`, six
  items, amounts `38500, 45000, 49000, 49000, 58850, 26000`, total **266350** = `Rp 266.350`,
  `occurred_on: "2026-08-18"`, `title: "bakar duit tuesday"` — byte-identical to the plan's
  expected payload except that `perumahan laddaland` came back `housing` (see R-76);
- eleven oversized bodies in a row → 413 nine times, then **429** with `retry-after: 60` (ten
  per user per minute, and the earlier successful parse had already spent one hit). Oversized
  bodies never reach the model, so this cost nothing to verify.

The never-hard-blocked promise, against the real endpoint with a bogus key: z.ai answers
`401 token expired or incorrect`, and `parseExpense` returns `source: 'fallback'`,
`degraded: true`, **six items totalling 266350**, correct title and date, every category
`other`. `usage` is `null`, because no tokens were spent and reporting zeros would be a lie.

**Not verified:** nothing in F04 is blocked on a browser. The one thing no test covers is F05's
handling of these responses, which does not exist yet.

---

## Addendum — rulings from F06 (landed during implementation)

F06 shipped `lib/photos/*`, `lib/db/photos.ts`, `lib/blob/delete.ts`,
`app/api/photos/upload/route.ts`, `app/actions/photos.ts`, `components/photos/*` and
`scripts/blob-sweep.ts`. Numbering continues from R-76. **F05, F07 and F09 read R-77, R-80
and R-86 before writing a line against this feature.**

Every claim below was verified rather than reasoned: `npm test` (**540 green**, 121 of them
new), `tsc --noEmit`, `eslint`, `prettier --check`, `next build`, plus live probes against the
real Vercel Blob store and a live `next dev`.

### R-77 · F06 does not re-declare F03's primitives. Plan Task 10 is superseded in four places.

The plan's `lib/db/photos.ts` sketch carried its own `NotFoundError`, its own
`assertGroupOwned` with a hand-rolled join, and its own `PhotoDTO`; its `app/actions/photos.ts`
sketch declared a second `AttachPhotoInput`. All four already existed:

| Plan sketched | Shipped instead |
|---|---|
| local `assertGroupOwned` (join) | `assertGroupOwned` from `lib/db/queries.ts` |
| local `NotFoundError` | re-exported from `lib/db/queries.ts` |
| `findOwnedPhoto` (join) | ownership travels as `photoOwnedBy(userId)`, the same correlated EXISTS every other photo query uses |
| local `AttachPhotoInput` | F03a's published schema, `.extend()`ed to tighten `blobPathname` only |

**Ruling. Import, never re-declare.** Two copies of the app's ownership check is exactly what
R-7, R-8 and R-33 each struck down, and the failure mode is silent: the day one copy is
hardened the other is not.

`PhotoDTO` in `lib/photos/types.ts` is the ONE deliberate duplicate — it mirrors F03's
`PhotoRow` field for field because re-exporting `PhotoRow` puts a module that imports the
Drizzle client one careless `import { PhotoRow }` away from the browser bundle. Duplication is
only safe while divergence breaks something, so `tests/photos.types.test.ts` asserts mutual
assignability at the type level for both `PhotoDTO`/`PhotoRow` and
`StagedPhoto`/`NewPhotoInputSchema` (R-46). That guard was itself checked by feeding it two
shapes that really differ and confirming `tsc` rejects it.

### ⚠️ R-78 · `deletePhoto` is ONE `DELETE … WHERE id AND EXISTS(…) RETURNING`.

The plan's §10 sequence was `findOwnedPhoto(userId, id)` and then
`db.delete(expensePhotos).where(eq(expensePhotos.id, photo.id))`. Two problems, both structural:

1. The ownership check has gone stale by the time the delete runs — a TOCTOU window.
2. The mutation itself is scoped **by id alone**, which is the shape R-5 and F03 §9 both
   forbid. It is only safe because of the SELECT before it, i.e. for a reason that lives in
   another statement.

**Ruling.** `deleteOwnedPhoto(userId, photoId)` is a single statement carrying
`photoOwnedBy(userId)` with a `RETURNING` clause. No window, no unscoped mutation, one round
trip, and the `blob_pathname` the caller must `del()` comes back with it. Asserted over the
emitted SQL in `tests/photos.db.test.ts`.

Deletion ORDER is unchanged and remains row-then-bytes (§10). The test pins it by recording how
many statements had run at the moment `del()` was called, and a second test asserts that a
FAILING `del()` still reports success — the user-visible outcome is correct, and ~300 KB of
invisible, sweepable leakage beats telling someone an operation failed that they watched
succeed.

### R-79 · `vitest.config.ts` aliases `server-only` to a stub.

`server-only`'s default export condition **throws on import**; only a bundler selecting the
`react-server` condition gets the harmless branch, and Vitest selects the default. So every
module opening with that pragma was untestable as shipped — including `lib/db/photos.ts`,
which is where this feature's ownership SQL lives.

Rejected alternatives: dropping the pragma (removes the build-time guard keeping the Drizzle
client and `BLOB_READ_WRITE_TOKEN` out of a client bundle); `conditions: ['react-server']`
globally (changes how React and `next/navigation` resolve, to fix one import);
`vi.mock('server-only')` per file (works, but F07 and F09 must remember it, and forgetting
looks like a failing test rather than a missing incantation).

**Ruling.** One alias, in the one config R-11 allows, pointing at
`tests/support/serverOnlyStub.ts`. Production is untouched: `next build` resolves the real
package and still fails the build if a `'use client'` module reaches one of these.

### ⚠️ R-80 · R-26 is implemented as `PhotoGallery` (presentational) + `PhotoManager` (actions).

R-26 accepted F09's split but named it `PhotoGrid`/`PhotoManager`, while the F06 plan published
a single `PhotoGallery` with an optional `onDelete`. Both names cannot survive, and the plan's
single component leaves the security-relevant half to each caller — F07 would have had to build
a wrapper of exactly this shape anyway, or become a client component.

**Ruling.** The published names are **`PhotoGallery`** (presentational, imports no Server
Action, three features already build against the name) and **`PhotoManager`** (imports
`deletePhoto`, wires `router.refresh()`). R-26's *property* is what mattered and it holds; only
its provisional `PhotoGrid` label is dropped.

```tsx
/e/[id]      <PhotoManager photos={group.photos} />          // F07
/s/[token]   <PhotoGallery photos={group.photos} />          // F09 — no action in the bundle
```

`tests/photos.bundle.test.ts` walks the real import graph from each entry point and asserts it,
stopping at `'use server'` boundaries exactly where the bundler stops. It also asserts the
walker is **not vacuous** (`PhotoPicker` *does* reach the actions), because a graph test that
quietly stops resolving imports passes for the wrong reason forever.

### R-81 · `images.remotePatterns` is narrowed, and the narrowing is verified behaviourally.

F01 shipped `hostname: '**.public.blob.vercel-storage.com'` with no `pathname` and no `search`.
Per the Next 16 images docs, omitting those implies `/**` and `**`, which makes `/_next/image`
an open optimizing proxy for every blob in the store — and `**.` matches any number of leading
labels, so it also matches a host under an attacker-controlled registrable domain.

**Ruling.** `*.` (a store host is exactly one label), `pathname: '/photos/**'`, `search: ''`.
Confirmed against a live `next dev`:

```
/photos/x.jpg   → 404 "url parameter is valid but upstream response is invalid"   (allowed)
/avatars/x.jpg  → 400 "url parameter is not allowed"                              (blocked)
evil.public.blob.vercel-storage.com.attacker.test/photos/x.jpg → 400 not allowed   (blocked)
```

### R-82 · The stored-pathname regex is measured, and its suffix bound is loose on purpose.

`addRandomSuffix: true` rewrites the pathname, and the plan guessed at the result. A real
`put()` against the store turned `photos/Uk-igSGzS6rpPd1sRM9iz.jpg` into
`photos/Uk-igSGzS6rpPd1sRM9iz-yLUxdLWq3Zqn5lg62luYDWXkeAHvwn.jpg` — `-` plus 30 mixed-case
alphanumerics.

**Ruling.** `PHOTO_STORED_PATHNAME_RE` enforces our prefix, alphabet and extension but bounds
the suffix at 16..64 rather than pinning 30. Pinned, the day Vercel changes that length is the
day every upload dies at `attachPhoto` with "invalid pathname" **after the bytes are already
paid for**. The regex's job is stopping traversal, not pinning someone else's internal.

### R-83 · The 74×74 tile carries state; the sentence explaining a failure lives under the strip.

Design R-41 fixes the draft tile at 74×74. The plan's `UploadTile` put a three-line error
message plus "Coba lagi" and "Hapus" text links inside it, none of which is legible at that
size, and the plan's classes (`bg-black/5`, `text-sm`, `red-700`) do not exist since R-24 reset
the `--color-*` and `--text-*` namespaces.

**Ruling.** The tile shows a progress bar, a one-word mono label and one ✕ (cancel while in
flight, dismiss after); the failed tile *is* the retry button, which makes the target 74×74
instead of a 12px link; the readable message is listed below the strip. The picker is a
horizontally scrolling strip rather than a 3-column grid, so adding a tenth photo never pushes
the draft's running total off screen. The 3-up grid at 6px gaps stays where R-41 puts it: the
gallery.

Also: in `attached` mode a finished tile is dismissed when **`existingCount` grows**, not on a
timer. That number comes from the server component, so it moves only once the row is confirmed
and rendered — there is never a frame where a photo appears twice, or in neither place.

### R-84 · `/dev/photos` exists so F06's own gates can be run before F05 and F07 ship.

F06's Phase 8 is a 19-step manual table on a physical iPhone against a **preview deployment**,
plus the EXIF/GPS privacy gate and R-29's orientation gate. F06 ships no page: `/new` is F05 and
`/e/[id]` is F07. Without a harness, every one of those gates waits on two later features —
which is how a "hard gate" quietly becomes something nobody ever ran.

**Ruling.** A dev-only `/dev/photos` renders both picker modes, the owner gallery via
`PhotoManager` and the read-only gallery, against a real scratch `expense_groups` row. It is
gated on **`VERCEL_ENV`**, not `NODE_ENV`: a preview build sets `NODE_ENV=production`, so
`/dev/ui`'s test would 404 the harness on exactly the deployment the QA table requires. Off
Vercel it falls back to `NODE_ENV`, so a self-hosted production build stays closed. Verified: it
404s in a local production build and 307s to `/` when signed out.

**Delete `app/dev/photos/` when F07 ships** — at that point `/e/[id]` is the real harness. Its
scratch group is created by `app/dev/photos/actions.ts` and is the only mutation of
`expense_groups` outside F05/F07.

### R-85 · F06's open questions, answered.

| OQ | Answer |
|---|---|
| 1 — where is `requireUserId()`? | `@/lib/auth/requireUserId`, as assumed. The route uses `getUserId()` instead: a 307 to an HTML page is a terrible answer to `fetch()`. |
| 2 — where is the id helper? | `@/lib/id` (`newPhotoId()`), **not** `@/lib/db/ids`, which does not exist — R-58 already recorded this for F07. `nanoid(21)` is still used directly for pathnames, deliberately: 72 bits is right for a key behind an ownership check, 125 for the only thing protecting a public URL. |
| 3 — is the cap of 10 right? | Kept. One constant, cheap to revisit once there is real usage. |
| 4 — does F05 block Simpan? | Superseded by R-31 and **implemented**: `onBusyChange`. `/dev/photos` demonstrates the wiring F05 should copy. |
| 5 — cron the sweeper? | No. Manual stands; a scheduled job whose purpose is deleting storage is the larger risk on a personal app, and it would be a fourth route handler against D6. |
| 6 — pin the blob hostname? | Not pinned, but narrowed per R-81. Pinning is a redeploy every time the store is recreated, for a marginal gain over `*.` plus a pathname. |
| 7 — old Safari without OffscreenCanvas | Accepted as the plan proposed. The library falls back to the main thread: ~1.5 s of jank per photo, degraded not broken. |
| 9 — photo count on the month list | Already shipped by F03 as `photoCount`, plus `firstPhotoUrl` (R-14). Nothing for F06 to do. |

### ⚠️ R-86 · R-29 / OQ-8 — EXIF ORIENTATION IS STILL UNDISCHARGED. It needs the device.

R-29 says ship nothing until a real portrait photo from the iPhone renders upright, and F06
deliberately does **not** pass `exifOrientation` because passing it when the library has already
rotated causes a *double* rotation. That cannot be settled in this environment: it needs a real
iOS capture, a real canvas and a real decode.

**Ruling. The gate stands, unchanged and unmet.** What has been done is to make it runnable in
one sitting: `/dev/photos` prints each staged photo's `width×height` and labels it
`portrait`/`landscape`, so the gate is a glance rather than a Web Inspector session, and the fix
if it fails is in plan §6 ("If orientation is wrong"). The same applies to the EXIF/GPS check —
the code path (`preserveExif: false`) is in place and the assertion is a one-liner with
`exiftool` against a real uploaded blob, but no photo has been through it yet.

**Do not mark F06 done on the strength of the unit suite.** 540 green tests say the plumbing is
right; they say nothing about which way up the photo is.

---

## Addendum — rulings from F05 (landed during implementation)

F05 shipped `app/(bare)/new/*`, `lib/hooks/useVisualViewport.ts`, `app/actions/expenses.ts`
and two audit scripts. Numbering continues from R-86. **F07 reads R-87, R-88, R-90 and R-92
before writing a line** — the first two are files F07 also owns, and the last two are
patterns it will need verbatim.

Every claim below was verified rather than reasoned: `npm test` (**613 green**, 73 of them
new), `next typegen && tsc --noEmit`, `eslint`, `prettier --check .`, `next build`, the two
audit scripts, and probes against a live `next dev` with a synthetic session cookie.

### ⚠️ R-87 · `createExpense` did not exist. F05 wrote it, and §4.4's file has one export.

§4.4 lists `app/actions/expenses.ts` with three exports and F03b shipped without the file,
so `/new`'s save path had nothing to call. This was not an oversight anyone had recorded:
**F03's plan §9.4 assigns it to F05 by name** ("`app/actions/expenses.ts` (F05)") and
sketches the `db.batch` body, while §4.4's table reads as though F03 owned the whole file.

**Ruling. F05 owns `createExpense`; F07 owns `updateExpenseMeta` and `deleteExpense` in the
same file.** The shipped action follows F03 §9's five properties — session-derived `user_id`,
Zod before any statement, one `db.batch` (R-4), no unscoped mutation — and takes `photos`
per R-2.

Two tightenings over F03a's `CreateExpenseInput`, both for reasons a pure wave-1 module
structurally cannot encode:

| Field | F03a | F05 | Why |
|---|---|---|---|
| `photos[].blobPathname` | `string().max(500)` | `PHOTO_STORED_PATHNAME_RE` | The same tightening `attachPhoto` applies, for the same reason: only F06 knows what a blob pathname looks like, and F03a cannot import its constants without giving wave-1 code an edge into wave-3. |
| `photos` length | `.max(20)` | `.max(MAX_PHOTOS_PER_GROUP)` (10) | Ten is the per-group cap the picker enforces (F06 OQ-3). Accepting 20 here would let a crafted request walk straight past it. |

What is deliberately **not** checked: whether a `blobPathname` is already referenced by
another group's row. `attachPhoto` does not check it either, and a second divergent copy of
that policy is the R-7 / R-8 / R-77 failure mode. Duplicates **within one request** are
deduped, because two rows pointing at one blob is a state where deleting one photo silently
breaks the other — including on a share page already sent to someone.

### R-88 · `Input` and `TextArea` now type a `ref`. F05's contract delta 8, granted.

React 19 passes `ref` to a function component as an ordinary prop, so it already reached the
element through `Field.tsx`'s existing spread — only `InputHTMLAttributes` refused it at the
type level, which is enough to stop the call site compiling.

**Ruling. Widen the prop types, do not work around them.** F05's focus manager moves focus
to a new row's name field after `+ Tambah item` and to the paste textarea on mount. The
documented fallback was a bare `<input className={CONTROL_CLASS}>` inside the `Field`, which
means hand-wiring the label and `aria-describedby` — the one thing `components/ui/index.ts`
says never to do. `Chip` still forwards no ref and does not need to: `<dialog>` restores
focus to the trigger itself.

### R-89 · `/new` is `app/(bare)/new/`, and it ships its own header.

R-51 already put `/new` outside `(shell)`; this records the consequence R-51 flagged and
left open. The screen has no tab bar, so it supplies the design's pushed-view navigation —
back chevron plus mono label, as on the Detail screen. `NewHeader` links to
`/m/<currentMonthKey()>`, computed server-side, and there is no action on the right because
the primary action is the sticky Simpan at the bottom and a second one would compete with it.

**Consequence F07 must absorb:** `/e/[id]` is in the same group for the same reason (design
R-38) and needs the same header. `NewHeader` is deliberately **not** exported for reuse —
F07's header carries a **Bagikan** action on the right, so the two differ in exactly the way
that made F10 decline to own screen headers at all.

### ⚠️ R-90 · A fixed-height screen inside `(bare)` must subtract the layout's own `pb-safe`.

`app/(bare)/layout.tsx` wraps every screen in `<div className="pb-safe">`. F05's root is a
fixed-height flex column (`height: var(--app-h)`) with an internal scroller, which is the
only arrangement that keeps a sticky bar above the iOS keyboard — iOS shrinks the *visual*
viewport, never the layout one, so `100dvh` still measures the full screen while the bottom
third of it is covered by keys.

Composed naively those two are a bug: the column is `--app-h` tall **inside** a container
that then adds the safe-area inset below it, so the document scrolls by exactly that inset —
a ~34px wobble on a notched device, on the one screen where the bar must not move.

**Ruling.** The root height is `calc(var(--app-h, 100dvh) - env(safe-area-inset-bottom))`,
subtracting the same value the wrapper pads by, so it is exact rather than a guess whatever
`env()` resolves to. `StickyBar` therefore carries **no** safe-area padding of its own; the
wrapper's padding *is* the home-indicator clearance. **F07 hits this the moment `/e/[id]`
gets a sticky footer** — take the same subtraction, do not add a second inset.

### R-91 · The 8.000-character cap is pre-checked in the browser.

R-69 settled `MAX_RAW_TEXT_CHARS` at 8.000 and amended F03a's `ParseRequest` to match, so a
9.000-character paste no longer passes client validation and comes back 413. F05 goes one
step further and refuses it **before** the fetch, rendering F04's own
`PARSE_ERROR_COPY.input_too_long` rather than a second wording — one vocabulary, one place,
and no round trip spent to be told something already known. This is the only place F05
renders copy for a *server-side* code, and it does so by importing F04's constant, not by
restating it.

### R-92 · `restoredNotice` and `degraded` live in the reducer, not beside it.

Both started as `useState` in the host, which is where the plan put them. Two things made
that wrong, and the second is a rule worth keeping:

1. Setting `restoredNotice` sat in the localStorage-restore effect, beside a `dispatch`. The
   React lint rule against synchronous `setState` in an effect body is right — it is a
   second render for one logical change.
2. Both are read by a stage component and both are set as part of a transition, which is
   F05's own stated rule for what belongs in the reducer (`draft.ts` header). Leaving them
   out made the host responsible for keeping two sources in step: `degraded` in particular
   must be cleared on *every* `parse_failure` branch, because a fallback table is already
   explained by its own banner and two notices at once explain nothing.

**Ruling, generalised for F07 and F09.** State that a child reads and that changes as part
of a transition goes in the reducer. `useState` is for state one component owns and nothing
persists — which chip opened the sheet, whether a disclosure is expanded, whether an inline
confirm is showing. F05's remaining `useState` is exactly that plus `photosBusy`, which is
pushed in from F06's picker rather than derived.

### R-93 · Sign-in-again is F02's Server Action, not a link to `/api/auth/signin`.

The plan's 401 branch navigated with `window.location.href = '/api/auth/signin'`. F02
already publishes `signInWithGoogleAction`, which `/` uses, and which exists precisely so
`signIn` — server-only — never appears near a `'use client'` boundary. F05 renders a form
with a hidden `next=/new`, so the round trip lands back on `/new` where the draft is still
in localStorage waiting. Also silences a real `@next/next` lint warning.

### R-94 · F05's open questions, answered.

| OQ | Answer |
|---|---|
| 1 — who fixes `createExpense`'s photo parameter? | Moot: the action did not exist. F05 wrote it against `photos` (R-2, R-87). |
| 2 — will F06 add `onBusyChange`? | Already shipped (R-31). `/dev/photos` demonstrated the wiring and F05 copied it. |
| 3 — `inputMode` on the amount field | Superseded twice: R-32 chose `decimal`, design R-37 reversed it to `numeric` with dots inserted as you type. F05 overrides nothing and gets `numeric`. |
| 4 — how to distinguish a Server Action failure? | Not solved, and F05 stopped trying: Next redacts the message in production, so every `createExpense` rejection maps to one string and the draft is left untouched. **F07 will hit the same wall** — if it wants precise copy, `createExpense` has to return `{ ok, code }` and both features change together. |
| 5 — should signing out sweep drafts? | Not done. The key is per-user so no cross-user read is possible; the first user's draft lingers up to the 7-day TTL. One `Object.keys(localStorage)` loop in F02's sign-out handler still closes it. |
| 6 — one draft per user, or many? | One. A second unsaved `/new` overwrites the first, which matches the simplicity tenet. |
| 7 — is `/new` outside `(chrome)`? | Yes — `(bare)`, see R-89. |
| 8 — `todayJakartaISO()` across midnight | Left as-is. A tab open across Jakarta midnight pre-fills yesterday on a *new* draft; the field is visible and editable, and a background client clock is the worse trade. |
| 9 — does F06's `max` default suit `/new`? | Yes, 10 (`MAX_PHOTOS_PER_GROUP`). F05 passes no `max`. |
| 10 — who merges `categories.ts` / `format.ts`? | Already merged by R-7 / R-8 / R-9. F05 imports `CATEGORIES`, `Category`, `DEFAULT_CATEGORY`, `toCategory`, `todayJakartaISO`, `currentMonthKey` and `monthKey` from one path each. |
| 11 — do `Input`/`TextArea` honour an `id` and forward a ref? | `id`, yes, as shipped. `ref`, now — see R-88. |

### Verification: what F05 actually proved, and what it could not

Green: `npm test` **613 passed | 15 skipped** (73 new — 12 `createExpense` over the emitted
SQL, 61 over the reducer, storage codec and validator), `next typegen && tsc --noEmit`,
`eslint`, `prettier --check .`, `next build` (lists `ƒ /new`), and
`scripts/f05-preflight.sh` + `scripts/f05-audit.sh` both exit 0.

Against a live `next dev` on port 3998, using a synthetic session cookie minted with
`@auth/core/jwt`'s `encode()` at the real `AUTH_SECRET` — the technique F02 and F04 both
used:

- signed out, `/new` → **307** `/?next=%2Fnew`, so R-1's proxy still covers it;
- signed in, `/new` → **200**, and the served HTML carries the header, the back link to
  `/m/2026-08`, the canonical 7-line placeholder, `Rapikan`, `isi manual` and the labelled
  textarea;
- the only `100vh` in the response is Next's own dev not-found styling. F05's root is
  `calc(var(--app-h, 100dvh) - env(safe-area-inset-bottom))`.

**NOT VERIFIED, and this is the honest part:**

1. **No expense has ever been saved.** `createExpense` is asserted against the emitted SQL
   with a probe driver, not against Neon. A synthetic `user_id` cannot be inserted —
   `expense_groups.user_id` is an FK to `users.id` — so the round trip needs a real signed-in
   Google account, which needs a browser. The 12 tests prove the statement shape, the
   ownership source and the batching; they prove nothing about the database accepting it.
2. **The whole of plan §16's manual QA table (29 steps) is outstanding**, and the steps that
   matter most cannot be faked in DevTools: zoom-on-focus, the sticky bar riding above the
   keyboard (steps 3 and 10), the native date wheel, and `Ulangi dari teks`. R-90's
   subtraction is *reasoned* from the two files; only a notched device shows whether the bar
   sits where it should.
3. **No LLM call was made from the browser.** F04 verified the route; nothing has yet
   verified F05's handling of its responses against a real one — which is exactly what F04's
   own verification note flagged as the one thing it could not cover.
4. **The offline path was never run offline.** `fallbackParse` is asserted client-importable
   by the preflight and unit-tested by F04, but no run has gone through `navigator.onLine
   === false` in a real browser.

**Do not mark F05 done on the strength of 613 green tests.** They say the state machine is
right. They say nothing about whether a thumb can reach Simpan while the keyboard is up.
