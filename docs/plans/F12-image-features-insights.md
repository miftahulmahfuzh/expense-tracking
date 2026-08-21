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
