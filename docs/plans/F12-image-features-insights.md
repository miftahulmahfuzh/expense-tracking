# F12 — Image features & LLM insights

**Card** [#2](https://github.com/miftahulmahfuzh/expense-tracking/issues/2) · round 1 ·
2026-08-21

Four features that arrived as one card, and they are unrelated except that all four touch
screens the owner uses every day: the photo viewer grows real controls, the swipe wraps,
`Judul` gets presets, and `Statistik` becomes `Simpulan` with three LLM-written summaries.

Each section below records the decision **and the reason**, because three of them overturn
something this repo previously wrote down.

---

## 0. Decisions taken during brainstorming

| # | Question | Decision |
| - | -------- | -------- |
| D-A | 1f asks for an icon library; three files argue against one | **lucide-react, restyled** through one `<Icon>` adapter that forces the existing stroke contract |
| D-B | What does the copied photo link show? | A **new photo-only link** at `/f/<token>` — no title, no items, no amounts |
| D-C | "1 click will save to gallery" | **Share sheet with the image file**; the web cannot write to Photos directly |
| D-D | How do presets appear? | **Chip row under the field**, frequency-ordered |
| D-E | When does the insight LLM call fire? | **Stamp on write, generate on read** — not `after()` on every mutation |
| D-F | What does the model see? | **Every item row for the last 62 days** — merchant names included |
| D-G | Does `/stats` become `/simpulan`? | **No.** Three strings change; the path does not |

---

## 1. The icon layer (card 1f)

### 1.1 Why this overturns three docblocks

`FullscreenToggle.tsx`, `ShareButton.tsx` and (per their citations) `TabBar` all argue
against an icon dependency, and the argument was correct at the time:

> adding lucide for two glyphs would import a library to use 0.2% of it … a 2.5 stroke, not
> the 1.5 an icon library ships: the system is Archivo at 800-900 weight and a hairline
> glyph next to it reads as a different app.

**Both halves are still true. Only the arithmetic changed.** This card takes the app from
3 glyphs to 8 (download, share, trash, close, two chevrons, plus the three that exist), and
hand-drawing eight is where the dependency starts paying. The *stroke* half of the argument
is not conceded at all — it is promoted from a comment into a component.

### 1.2 The adapter

```tsx
// components/ui/Icon.tsx
import type { LucideIcon } from 'lucide-react'

export function Icon({ as: Glyph, className }: { as: LucideIcon; className?: string }) {
  return (
    <Glyph
      strokeWidth={2.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={cn('size-5.5', className)}
    />
  )
}
```

Three props carry the whole design contract, and they are forwarded to the `<svg>` by
lucide. `size-5.5` (22px) inside a `size-touch` (44px) target — unchanged from today.

**One choke point, enforced.** An eslint `no-restricted-imports` rule bans `lucide-react`
outside this file, plus a source-reading test in the manner of `tests/share.bundle.test.ts`.
Without the rule the contract survives until the first person in a hurry, and a 1.5-stroke
glyph in one corner of the app is exactly the failure the old docblocks predicted.

### 1.3 Retirements

| Was | Becomes |
| --- | ------- |
| `ShareGlyph` (ShareButton.tsx) | `Share` |
| `ExpandGlyph` (FullscreenToggle.tsx) | `Maximize` |
| `CollapseGlyph` (FullscreenToggle.tsx) | `Minimize` |
| `GLYPH` const | absorbed into `Icon` |
| `✕` / `×` text glyphs — PhotoPicker, UploadTile, Lightbox, KitchenSink | `X` |

Those typed characters are the "self drawed icons" 1f is really complaining about: a `✕` is
whatever the system font decides it is, at whatever weight, with no stroke control at all.

Each retired docblock is **rewritten, not deleted** — it must record that eight glyphs is
where the arithmetic flipped and that the stroke contract survived the move. A future reader
finding `lucide-react` in `package.json` needs the reason next to it.

---

## 2. The Lightbox chrome (card 1a–1e)

```
┌────────────────────────────────┐
│  3 / 7                      ✕  │   counter left (unchanged), X floats right   1d
│                                │
│           [ photo ]            │
│                                │
│                    ⬇   ⇪   🗑   │   the cluster, bottom right                  1e
└────────────────────────────────┘
```

All four are `size-touch` circles on `bg-white/15`, matching today's `✕`. The cluster is
horizontal and right-aligned — right-thumb reach on a 414px screen — with `pb-2` and no
safe-area inset, per the 8px edge rule the current footer comment already explains.

### 2.1 Delete keeps its confirm (1b)

Tapping `Trash2` swaps the three-icon cluster for the existing `Hapus Foto Ini` / `Batal`
pair. That behaviour and its two locally-styled buttons are already written and already
justified — every design-system `Button` variant is coloured for `paper`, and this footer
floats over a true-black surround. A `Sheet` would drag paper chrome into that room.

### 2.2 Download is client-only (1a)

`navigator.share({ files: [file] })` after fetching `blobUrl` into a `File`. It imports no
Server Action, so it lives in `Lightbox` directly.

It reuses `ShareButton`'s error taxonomy **verbatim**, because that file already paid for it:

- `AbortError` — the user dismissed the sheet. Do nothing. No toast, no log, no state change.
- anything else, or no `navigator.canShare({ files })` — fall back to `<a download>` on an
  object URL. On iOS that lands in Files rather than Photos, which is the honest degradation.

`canShare` is checked **inside the handler, never at render.** Branching what is rendered on
a `navigator` capability is the SSR hydration mismatch `ShareButton` documents.

### 2.3 Share is a Server Action, so it cannot live here (1c)

`tests/share.bundle.test.ts` enforces that `PhotoGallery` imports no action, because
`/s/[token]` renders it and a Server Action reference in a public bundle is a callable id.

So `onShare?: (photo: PhotoDTO) => Promise<string>` joins `onDelete` as an optional prop,
wired only by `PhotoManager`. **Each icon renders only when its prop is present**, so on
`/s/[token]` and `/f/[token]` the cluster is download-only — the security property is the
module graph, not a runtime check.

---

## 3. Wrap-around swipe (card 2)

```
 [ Gn ]   G1   G2   G3   …   Gn   [ G1 ]
   ↑                                 ↑
 clone of last                 clone of first

 real photo i  →  scrollLeft = (i + 1) × width
```

### 3.1 Why clones and not a rewrite

`Lightbox`'s docblock chose CSS scroll-snap over a gesture library for momentum,
rubber-banding and fling velocity — "better than any JS gesture library, in six lines". A
hand-rolled transform pager would make wrapping trivial and throw all of that away. Two
sentinel nodes keep every word of that docblock true.

### 3.2 The clones are dumb `<img>`, not `Slide`

No pinch handlers, no zoom state, no double-tap. You cannot inspect a photo you are
mid-wrap through, so duplicating ~90 lines of touch maths onto a node that exists for one
frame would be all cost and no benefit.

### 3.3 The index maths, extracted

`lib/photos/carousel.ts` — pure, unit-tested at n = 1, 2, 3, 7:

```ts
trackIndexFor(realIndex, n)   // realIndex + 1
realIndexFor(trackPos, n)     // ((trackPos - 1) + n) % n
wrapTarget(trackPos, n)       // 0 → n ; n+1 → 1 ; else null
```

`realIndexFor` is the one line that fixes the counter, the `eager` neighbour hint and the
`active` zoom reset simultaneously. On mount the track scrolls to `(startIndex + 1) × width`.

### 3.4 The wrap fires on settle, never during momentum

Jumping while a fling is in flight fights the scroller and stutters visibly. The signal is
`scrollend` (Safari 18+, Chrome 114+) with a ~120ms `scroll` debounce as the fallback for an
older iOS on the XS Max. On settle, `wrapTarget` returns a track position and we
`scrollTo(target × width, { behavior: 'auto' })`.

The jump is invisible because both ends show an identical image at an identical snap
alignment. `scroll-snap-stop: always` — already set — guarantees a fling advances exactly
one slide, so we always settle *on* a sentinel rather than sailing past it.

**Exemptions:** `n === 1` skips the mechanism entirely (nothing to wrap to, no clones
rendered). Zoom needs no special case — `overflowX` is already `hidden` while zoomed, so no
wrap can fire mid-pinch.

---

## 4. The photo-only share link (card 1c)

### 4.1 Why not the group link

`/s/[token]` publishes a whole group: title, every item, every amount. Sending someone a
receipt photo should not hand them the total. So this is a second, narrower token type
rather than a deep link into the first.

### 4.2 Schema

```ts
export const photoShareLinks = pgTable(
  'photo_share_links',
  {
    token: text('token').primaryKey(),              // newShareToken(), 72 bits
    photoId: text('photo_id').notNull()
      .references(() => expensePhotos.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull().defaultNow(),
  },
  (t) => [uniqueIndex('photo_share_links_photo_id_unq').on(t.photoId)],
)
```

Shape-for-shape with `share_links`, so there is one pattern to learn rather than two.

### 4.3 `createPhotoShareLink(photoId)`

`createShareLink` with the nouns changed, and that is deliberate — it inherits the whole
argument in that file:

- **get-or-create, idempotent.** A second tap copies the *same* URL. A link already sent
  keeps working; minting a fresh token would silently break yesterday's message.
- **fast-path read first**, so the common tap is one `SELECT` and no write.
- **`onConflictDoNothing()` with no conflict target**, absorbing both the PK collision and
  the `photo_id` unique violation in one path.
- **the raced re-read** is what tells the two constraints apart.
- **no `catch` on `23505`** — R-60: Drizzle carries the code on `error.cause`, so the
  obvious message-regex handler silently never matches.

Ownership comes from `photoOwnedBy(userId)`, which already exists in `queries.ts`. It is
never re-declared here (R-99), and the second copy of an ownership check is the R-77 failure
mode.

### 4.4 The projection is the privacy boundary

```ts
export const getPhotoByShareToken = cache(async (token: string) => …)
//   returns { blobUrl, width, height }   — and NOTHING else
```

No title. No date. No amounts. No owner name. A field added to that `select` is a field
published to the open internet; there is no second gate behind it.

### 4.5 The route

`app/(bare)/f/[token]/page.tsx`, force-dynamic, mirroring `/s/[token]`.

It **deep-imports `./Lightbox`, not the barrel.** `components/photos/index.ts` re-exports
`PhotoManager`, which imports `deletePhoto`; routing a public page through the barrel would
rest R-80's property on the bundler tree-shaking a re-export — which it very likely would,
and would fail silently, on the one route served to people with no account.
`tests/share.bundle.test.ts` grows a case for `/f/[token]`.

`Lightbox` gains `dismissible?: boolean` (default `true`). On this route it is `false`: no
`✕`, no tap-to-dismiss, no Escape — there is nowhere to dismiss *to*, and a control that
does nothing is worse than no control. The barrel's "do not build a second viewer" rule is
precisely what forbids the alternative, so its docblock is updated to name this second
sanctioned caller and to say why the import is deep.

### 4.6 No `og:image`

A receipt thumbnail would render in the recipient's chat list, on their lock screen, and in
every forward — the same reasoning `SHARE_PREVIEW_SHOWS_TOTAL` already carries for the
rupiah total. Generic title, no image.

### 4.7 Accepted cost: no revoke UI

Deleting the photo cascades the row, so card 1b **is** the revoke. A dedicated
`revokePhotoShareLink` is a later one-liner and is not built now, because an action with no
caller is dead code that reads as a feature.

---

## 5. Judul presets (card 3)

```ts
// lib/titlePresets.ts
export const TITLE_PRESETS = [
  'pengeluaran harian',      // daily   — the most-used, therefore first
  'bakar duit minggu',       // weekly
  'bensin motor',            // weekly
  'air & listrik bulanan',   // monthly
  'parkir motor tokyo',      // monthly
  'parkir motor asg',        // monthly
  'IPL tokyo',               // per 3 months
] as const
```

**Ordered by tap frequency, not by the card's a–g order.** Only ~2.5 chips are visible
before the scroll edge on a 414px screen, so frequency-descending is what keeps the common
case zero-scroll. The card says `pengeluaran harian` is "the most title I will ever use".

**Strings are verbatim**, lowercase and mixed-case `IPL tokyo` included. The Title Case rule
in `globals.css` and `F11-title-case.md` governs *labels* — `Judul`, `Item`,
`Tautan Publik`. These are values, and a value is whatever the user typed.

### 5.1 `components/ui/TitlePresets.tsx`

A horizontally scrolling row using the same hidden-scrollbar utilities as the Lightbox
track. Each chip is a 44px touch target to honour the design's touch floor, costing ~52px of
vertical space below the field.

A chip whose text exactly matches the current title renders in the **yellow sticker**.
`stickers.ts` reserves yellow for "you are here", so the row doubles as a read-out of which
preset is active rather than being a write-only control.

### 5.2 Two callers, one difference

| Route | Wiring |
| ----- | ------ |
| `/new` `ReviewStage` | under the `Judul` `Field`; calls `props.onTitleChange(preset)`. Does **not** pre-empt the LLM's guessed title — you tap only if you want to. |
| `/e/[id]` `TitleField` | there is no blur to commit on, so a tap sets the local draft *and* calls `onCommit(preset)` immediately, keeping the existing `!== value` guard so a re-tap writes nothing. |

---

## 6. Freshness for the insights (card 4c)

No `after()`, no queue, no cron. Card 4c offered "always call the LLM on every edit"; this is
strictly better and honours the same cost tolerance, because five rapid edits collapse into
one call instead of five, and the save path never waits on a model.

### 6.1 The watermark is `MAX(expense_groups.updated_at)`

One indexed aggregate, no new column — but it is **currently a lie for item edits.**
`app/actions/items.ts` updates `expense_items` and never touches the parent row, so fixing an
amount would leave a stale insight looking fresh. So `addItem`, `updateItem`, `deleteItem`
and the two photo actions each grow one statement:

```ts
await db.update(expenseGroups)
  .set({ updatedAt: new Date() })
  .where(eq(expenseGroups.id, anchor.groupId))
```

**Explicit, not relying on `$onUpdate`** — the schema comment already warns those two do not
always agree. It is a PK update on a row the action has already proven ownership of,
alongside the two or three statements it runs today.

### 6.2 The cache is one row per user

```ts
export const expenseInsights = pgTable('expense_insights', {
  userId: text('user_id').primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  weekText: text('week_text'),
  monthText: text('month_text'),
  twoMonthText: text('two_month_text'),
  watermark: timestamp('watermark', { withTimezone: true, mode: 'date' }).notNull(),
  scopeKey: text('scope_key').notNull(),          // '2026-W34|2026-08'
  generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' }).notNull(),
  model: text('model').notNull(),
})
```

One row, not three: all three sections come from one call and expire together. Upserted with
`onConflictDoUpdate` on the PK.

### 6.3 `scopeKey` is the non-obvious half

Watermark alone is not enough. **On Monday morning, with no new expense, the watermark is
unchanged but "Simpulan Minggu Ini" is now describing last week.** So:

```ts
stale = watermark !== maxUpdatedAt || scopeKey !== currentScopeKey
```

`scopeKey` is the Jakarta ISO week plus the Jakarta month. ISO weeks run Monday–Sunday,
which is exactly what card 4b asks for; the two-month window derives from the month, so two
keys cover all three sections. `lib/insights/freshness.ts` holds this as pure functions.

---

## 7. The insight call and its rendering (card 4b)

### 7.1 `lib/llm/insights.ts`

Built to `parseExpense.ts`'s pattern, not a new one:

- the **portable Messages surface only** — no `thinking`, no `output_config`, no `speed`, no
  `betas`, no `cache_control`, no `strict` (F04 §0.1). GLM-5.2 is not a Claude model; those
  either 400 or are silently ignored.
- **one forced tool** for structured output, which is the portable mechanism.
- 25s timeout, `maxRetries: 0`, reusing the shared `llm` client and `LLM_MODEL`.
- **Zod on the tool input**, all-or-nothing.

```
tool record_insight → { minggu: string, bulan: string, duaBulan: string }
```

Three short Indonesian paragraphs, each ending in one concrete piece of advice.

### 7.2 Input: `getItemsForWindow(userId, 62)`

One new SQL query returning `occurredOn, name, amountIdr, category` for every item in the
last 62 days, ordered by date, **capped at 1500 rows** — the same instinct as the parser's
8.000-char paste cap: a bounded prompt is a bounded bill.

62 days covers all three windows: this week, this month, and the two-month comparison.

Merchant names reach the model on purpose (D-F). Card 4b's examples — cordoba across the
weekdays, trikayo at dinner, bensin motor month-over-month — are only answerable if they do,
and no pre-defined merchant list can keep up with where the user starts eating next.

### 7.3 The prompt

Carries today's Jakarta date, the explicit bounds of all three windows, an instruction to
name the merchants it can see, and — non-negotiably — that **amounts are whole rupiah
integers.** F04's long system prompt exists precisely to keep the 1000× money bug away, and
COST.md's ruling stands: *do not trim the prompt to save tokens.* z.ai caches it for free.

### 7.4 There is no fallback, and that is deliberate

`fallbackParse.ts` exists because a regex can approximate a parse. Nothing approximates
prose. So a failed or timed-out call renders an honest empty state with a retry, writes **no
cache row** (so the next visit retries), and never dresses a stale insight up as current.

### 7.5 Rendering

`/stats` keeps its four SQL aggregates in one `Promise.all` and paints hero, chart,
breakdown and Pengeluaran Terbesar immediately. Below `BiggestExpenseTile`, per card 4b, the
three cards sit inside one `<Suspense>` with a skeleton, fed by an async `InsightSections`
server component.

`InsightSections` is wrapped in `cache()` — the same per-request dedupe
`getGroupByShareToken` already uses, and what stops a double render firing two calls.

**One guard against a regenerate loop:** if `generatedAt` is under 60 seconds old, serve the
cached text even when stale. Edit-view-edit-view then costs one call, not ten. This matters
because roadmap D3 lets any Google account sign in, and COST.md's abuse-surface section is
the reason to bound every LLM path rather than only the obvious one.

`_revalidate.ts` already busts `/stats`; nothing to add.

---

## 8. The rename (card 4a)

**Three strings, not a route move.** `metadata.title`, the `<h1>`, and the `TabBar` label
become `Simpulan`.

The path stays `/stats`: the app runs standalone with no URL bar, `_revalidate.ts`
hard-codes `revalidatePath('/stats')`, and the test suite references it. Renaming buys a
redirect and some dead bookmarks for nothing the user can see. **D-G, reversible on request.**

---

## 9. Migrations

Two, via `drizzle-kit generate`:

1. `photo_share_links` — table + unique index on `photo_id`
2. `expense_insights` — table

---

## 10. Tests

Pure logic extracted into testable modules; gestures and LLM calls left at the boundary —
the habit `sheet.geometry.test.ts` and `revealAboveBar` already established.

| Module | Test |
| ------ | ---- |
| `lib/photos/carousel.ts` | `trackIndexFor` / `realIndexFor` / `wrapTarget` at n = 1, 2, 3, 7 |
| `lib/insights/freshness.ts` | Monday rollover on an unchanged watermark; watermark change; the 60s guard |
| `lib/llm/insights.ts` | Zod contract test mirroring `llm/__tests__/contract.test.ts` |
| `lib/llm/insights.ts` | live test behind `LLM_LIVE_TEST=1`, like `parseExpense.live.test.ts` |
| `lib/titlePresets.ts` | every preset under `MAX_TITLE` |
| `components/ui/Icon.tsx` | renders `stroke-width=2.5`, `square`, `miter` |
| — | source-read test: nothing outside `Icon.tsx` imports `lucide-react` |
| `tests/share.bundle.test.ts` | new case — `/f/[token]` carries no Server Action |
| `photo_share_links` | schema + ownership tests, mirroring `db.schema` / `db.ownership` |

---

## 11. Verification gate

The card does not reach Completed until this passes and the user confirms the work:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

`next build` must still list `/stats` and `/f/[token]` as **`ƒ`, not `○`**. The stats page
docblock is explicit: an `○` there means the `requireUserId()` call was lost and the page is
being cached across users.

---

## 12. Open questions

1. **`/simpulan` as a real path?** D-G says no. One word from the user flips it.
2. **Revoke for photo links.** §4.7 leans on the cascade. If a link needs killing without
   losing the photo, that is a `revokePhotoShareLink` + one button.
3. **Insight tone and length.** The three paragraphs are unseen until the first live call.
   Expect one prompt iteration after reading real output — and note that a `prompt.ts` edit
   costs exactly one full-price uncached request, then goes free again (COST.md).

---

## 13. Reconciliation — what changed while building it

Written after the fact, in the manner of `docs/RECONCILIATION_v0.1.0.md`: the plan above is
left as it was proposed, and every departure is recorded here with the reason. Eleven items.

### R12-1 · The icon set is CLOSED, not an adapter

§1.2 proposed `<Icon as={Download} />`. Shipped: `Icon.tsx` exports **finished components**
(`DownloadIcon`, `TrashIcon`, …) and nothing else.

The adapter form has a hole. Call sites still have to import the glyph from `lucide-react` to
pass it, so `lucide-react` is legal at every call site — and once it is, `<Trash2
className="size-5" />` is *less* typing than the sanctioned path, renders fine, and is a
hairline. The contract would have been bypassed by writing less code. A closed set means the
stroke contract is not a rule anyone has to obey; there is no other glyph to render, and the
eslint rule can ban the whole module rather than four of its names.

### R12-2 · Twelve glyphs, not eight — and five sites the plan missed

§1.3 listed the retirements. `tests/icon.contract.test.ts` then found five more, every one a
typed character standing in for a picture:

| Site | Was |
| ---- | --- |
| `ExpenseEditor` item row | `×` U+00D7 at 20px/700 |
| `ExpenseEditor` header back | `‹` U+2039 at 22px/800 |
| `BiggestExpenseTile` | `›` U+203A at 22px/800 |
| `Sheet` close | `×` U+00D7 at 22px/800 |
| `KitchenSink` "ganti ›" | `›` U+203A inline |

So the app had **four independent copies** of a typed guillemet chevron, at three weights.
That is the strongest argument for the dependency the plan did not know it had, and it is why
the test asserts the property from outside the module rather than trusting the retirement list.

The test matches by SHAPE — a glyph as an element's sole child, or alone on a line — not by
codepoint, because `44×44` in `KitchenSink`'s prose wants a real multiplication sign. Forbidding
the character outright would have made the rule wrong rather than strict.

### R12-3 · `dismissible` collapsed into the absence of `onClose`

§4.5 proposed `dismissible?: boolean`. Shipped: no such prop — omitting `onClose` is what makes
the viewer undismissable.

Two props that must agree are two props that can disagree, and there was a harder reason:
`/f/[token]` is a **server** component, and React refuses to serialise a function prop across
the client boundary. `onClose={() => {}}` would have been a runtime crash on every visit
("Functions cannot be passed directly to Client Components") on the one page with no test that
renders it. Asserted now by a `share.bundle` case that forbids any inline function prop there.

### R12-4 · `ViewablePhoto`, so the privacy projection did not have to grow

The Lightbox took `PhotoDTO[]`, which requires `blobPathname`, `sizeBytes` and `sortOrder` —
none of which `SharedPhoto` carries, by design. Rather than fabricate three fields to satisfy a
type (which is how a projection quietly grows back the columns it excluded), the viewer now
takes a four-field `ViewablePhoto` that `PhotoDTO` satisfies structurally.

`downloadNameFor` was rewritten to derive the filename from `blobUrl` instead of
`blobPathname`, which is what removed the last reason to need the wider type. A Vercel Blob URL
ends in exactly that pathname, so nothing was lost.

### R12-5 · Photo mutations do NOT bump the watermark

§6.1 said "`addItem`, `updateItem`, `deleteItem` and the two photo actions". Wrong on the photo
actions, and reading `app/actions/photos.ts` is what showed it: an insight is written from
**item rows only**, so attaching or deleting a receipt would invalidate a perfectly good summary
and pay for a model call that produces identical text. Only the three item actions touch.

### R12-6 · `max(updated_at)` alone is not a sufficient key

§6.1's watermark had a hole: **deleting a group whose `updated_at` sits below the maximum leaves
the maximum untouched.** The data changed, the key would not, and the summary would keep quoting
a deleted expense forever.

So the timestamp column became a text `dataKey` of `<max epoch ms>:<group count>`, and
`getInsightWatermark` returns both. The residual — deleting the newest group and creating another
inside the same microsecond — is documented at `insightDataKey` and costs one stale paragraph.

### R12-7 · The ISO week formula was wrong, and a test caught it

`jakartaWeekKey` was written as `1 + Math.round((thursday - jan1) / 7 days)`. That is only
correct when 1 January happens to be a Thursday. With jan1 on a Friday, ISO week 1's Thursday is
six days later, `round(6/7)` is 1, and **every week that year is reported one too high** — which
would make two different weeks share a `scopeKey` and silently overwrite each other's summary.

`Math.ceil((dayOffset + 1) / 7)` is the standard form. The failing case was `2027-01-04`.

### R12-8 · The Lightbox got its own status slot instead of the Toast

The plan assumed a toast for "Tautan disalin". `ToastProvider` does render after `{children}`,
so it paints above the overlay — but `--toast-bottom` puts it 22px off the bottom edge, centred,
and the new icon cluster occupies 8–52px, right-aligned. On a 414px screen they overlap between
x≈236 and x≈277.

So the viewer carries one status slot of its own, above the cluster, with three states: copied,
manual-copy (a selected read-only input when both clipboard paths fail), and error. No z-index
to win, no `paper` colours dragged over a black surround.

### R12-9 · Two React anti-patterns, fixed rather than suppressed

`react-hooks/set-state-in-effect` rejected two effects the plan implied:

- **status/confirming reset on photo change.** Now KEYED to a photo id and derived during
  render. Better as well as legal: the effect version rendered the stale pill for one frame, so
  swiping away from "Tautan disalin" flashed it onto the next photo.
- **post-delete reposition.** Now scrolls the element and lets `handleScroll` pick the new
  position up, rather than writing state. Gated on the count *shrinking* via a ref, because
  running it on `trackPos` would re-scroll during momentum — the exact thing §3.4 forbids.

### R12-10 · Preset chips cost ~44px, not ~52px

§5.1 assumed 44px-tall chips. `globals.css` already has `touch-target`, which expands a
visually-small control to the 44px floor without changing its painted size — its docblock names
this case. So the chips are 36px painted like `Chip size="sm"`, and the row costs ~44px with its
gap. The Judul field above dropped `mb-4` → `mb-2` to pay for it.

### R12-11 · One pre-existing lint breakage, fixed to make the gate readable

`npm run lint` reported **20,892 problems** before any of this work — confirmed by stashing.
A stale `.worktrees/fix-item-sheet-footer/` from an already-merged branch put minified Turbopack
chunks through eslint, because `globalIgnores(['.next/**'])` is a path pattern and does not match
a nested worktree. `'.worktrees/**'` added, for the same reason `public/vendor/**` is there:
real findings buried under vendor noise.

---

## 14. Verification, as run

```
npm run lint       ✓ clean
npm run typecheck  ✓ clean
npm test           ✓ 879 passed, 17 skipped (2 live suites skipped without LLM_LIVE_TEST=1)
npm run build      ✓ /f/[token] ƒ · /stats ƒ · /s/[token] ƒ
```

`next build` lists both public routes and `/stats` as **`ƒ`**, which is the specific thing §11
asked for: an `○` on `/stats` would mean the `requireUserId()` call had been lost.

**NOT run:** `npm run db:migrate` (needs the live Neon credentials) and `npm run test:live`
(spends real tokens against z.ai). The migration is generated and reviewed —
`drizzle/0001_tricky_young_avengers.sql`, two `CREATE TABLE`s, two cascading foreign keys, one
unique index, no destructive statement. §12.3 stands: the summaries' tone and length are unseen
until the first live call.

---

## 15. R12-12 · The swipe never worked, and F12 sat on top of it

Found by the user testing on a phone, after everything above had shipped and passed.

`Slide`'s `<img>` carried `touch-action: none` from F06, under the comment *"hands every touch
to the handlers above; without it Safari claims the pinch for the page."* The second clause is
true. The first is the bug.

Per spec, `touch-action: none` means the browser performs **no default touch behaviour for a
touch starting on that element — including scrolling an ancestor scroll container.** The
scroll-snap track is an ancestor. So a one-finger horizontal swipe beginning on the photo never
paged, and had never paged since F06.

**Why five months of use did not surface it.** The image is `object-contain`. A portrait receipt
on a wider viewport leaves letterbox bars, and a swipe on *those* lands on the host `div`, which
sets no `touch-action`, and pages perfectly. It is broken only where it matters: a phone held in
portrait, where the photo fills nearly the whole width and there is almost no bar left to grab.

**Why the F12 work did not surface it either.** §3's sentinel clones, `wrapTarget`, the settle
handler and eighteen unit tests are all about *where the scroller goes when it settles*. Every
one of them is correct. None of them can observe that nothing ever asked the scroller to move —
`lib/photos/carousel.ts` is pure arithmetic, and jsdom has no scroll-snap, no momentum and no
`touch-action`. The plan verified the wrap and never verified the swipe.

**The fix** is `pan-x` at rest, flipping to `none` while zoomed (written in `apply()`, beside the
transform, so it stays off React during a 60 Hz gesture). `pan-x` permits exactly the one
default behaviour wanted — horizontal panning, i.e. the snap track — and still withholds
`pinch-zoom`, so Safari cannot page-zoom. That was the half of F06's reasoning that was right,
and it is preserved.

`tests/photos.lightbox.contract.test.ts` now pins this value and thirteen other things about the
viewer that are invisible in review and invisible in CI. It is a source assertion, deliberately:
a component test in jsdom would have reported the broken swipe as passing, which is precisely
how it lasted this long.

**The standing lesson for this plan:** §11's gate — lint, typecheck, tests, build — cannot see a
gesture. Nothing in it could ever have caught this. A touch feature is not verified until it has
been touched.

---

## 16. CI, and the deploy gate that does not exist yet

Added after the fact, when the icons turned out to be missing from the phone rather than from
the code.

### 16.1 What was actually wrong, and what I got wrong about it

The icons were in `d5b8bd9`. A probe of `https://expensetracking.online/f/aaaaaaaaaaaa` returned
Next's generic *"This page could not be found"* rather than our `Foto tidak ditemukan`, and I
read that as "the push never deployed". **That diagnosis was wrong.** The Vercel project has been
git-connected since 19 August, `productionBranch: main`, and the deployment list shows a `git`
deploy for every push including that one, READY twelve minutes before I probed.

The likelier cause is a **CDN-cached static 404**. Before that deploy `/f/*` matched no route, so
it fell to Next's `/_not-found` — which `next build` lists as `○ (Static)` and is therefore
cacheable at the edge. After the deploy the path matches a dynamic route carrying `no-store`.
The manual `vercel --prod` did not supply a missing deploy; it invalidated a stale edge entry.

Worth keeping because it generalises: **a 404 from a path that did not exist yet is not evidence
about what is deployed.** Probe something the new build serves with `no-store`, or read the
deployment list.

### 16.2 What genuinely did not exist: any CI at all

No `.github` directory. Every check in §11 was run by whoever remembered to run it — and one of
them never was, which §16.3 covers.

`.github/workflows/ci.yml` now runs `lint`, `typecheck`, `test`, `db:check`, `build` and
`format:check` on every push to `main`, every pull request, and on demand.

**It needs no secrets, and that is a property rather than an oversight.** `lib/env.ts` parses the
environment eagerly at import, so `next build` genuinely aborts without those variables — but
every rule in that schema is a SHAPE rule: non-empty, a `postgres` prefix, a parseable URL. None
dials anything. Verified rather than assumed: `.env.local` was moved aside and `npm run build`
run with exactly the dummy values in the workflow; it compiled and listed all 17 routes. So a
fork's PR runs the full gate, nothing can reach the production database, and nothing can spend
z.ai tokens — the two live suites skip themselves without `LLM_LIVE_TEST=1`.

Node is pinned to **24** to match the Vercel project's `nodeVersion: 24.x`, not the 22 that
`engines.node: >=22` merely permits. CI on a runtime production does not use can be green on a
build that breaks.

### 16.3 `format:check` was never in the gate, and it was already failing

`npm run lint` does not check formatting. `eslint-config-prettier` only *disables* rules that
would conflict with Prettier — it asserts nothing. So §11's gate never read formatting, and
adding `format:check` to CI immediately found **seven files** left unformatted by this very
feature, all of them ones edited by script rather than by hand.

The gate had a hole the whole time. It cost nothing to close and it was red before it ever ran.

### 16.4 The deploy is not gated, and that is the remaining gap

Every push to `main` deploys to production, in parallel with CI rather than after it. A commit
with failing tests ships and the workflow reports the failure afterwards.

Closing it is two settings and a habit, none of which this plan changes unilaterally because they
alter how the repo is worked in day to day:

1. **Branch protection** on `main` requiring the `lint · typecheck · test · build` check.
2. **Pull requests into `main`** instead of pushing to it — which is also what makes the preview
   deployment per PR worth anything.
3. Optionally Vercel's *Ignored Build Step* to skip a production build whose commit is red.

Until then CI is a smoke alarm, not a lock: it tells you the branch is broken, it does not stop
the broken branch reaching the phone.

---

## 17. Closing: four bugs, none of which any check could see

F12 passed its §11 gate on the day it merged, and then needed four fixes. Every one was found by
a person holding a phone, and not one of them could have been caught by lint, typecheck, 907
unit tests, `next build` or the CI workflow added in §16.

| # | Bug | Only visible |
| - | --- | ------------ |
| R12-12 | `touch-action: none` — swiping never paged, since F06 | on a touchscreen |
| §16.1 | a CDN-cached static 404 read as "not deployed" | over HTTP, not in the repo |
| R12-13 | `fixed` anchors to the layout viewport; the cluster sat under Safari's toolbar | on iOS, in a browser with chrome |
| R12-14 | `pb-2` on a floating pill put the cluster on the home indicator | on a device with one |
| R12-15 | `navigator.share({files})` on desktop turned Download into a share sheet | with a mouse |
| R12-16 | a 15% white scrim under white glyphs is invisible over white paper | with a real receipt open |

Three of those were *my* new code. Two — the swipe and the geometry — were latent from F06 and
F10 and were merely uncovered by putting controls where nobody had put controls before.

**The pattern is not "test more".** Each of these is a property that no assertion available in
this repo can express: whether a finger can page a scroller, whether a fixed element's bottom
edge is on screen, whether a white mark is legible on a white photograph. What the test suite
CAN do — and now does, in `tests/photos.lightbox.contract.test.ts` — is pin the *values* that
were wrong, so the next person who "tidies" `bg-black/60` back to something translucent, or
restores `inset-0`, gets told which bug they are re-opening and why.

**What to actually take from this.** The §11 gate is necessary and it is not sufficient. For a
touch feature, the last line of the gate is a phone. Every one of these six was reported in
under a minute by someone looking at the screen, and every one of them cost a deploy cycle to
find because nobody looked before merging.
