# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Rulings
`R-1…R-130` in `docs/RECONCILIATION_v0.1.0.md`, and `R-34…R-49` plus `R-131…R-137` in
`docs/design/DESIGN_INTEGRATION.md`, remain the arbitration record for *why* a thing landed
the way it did; this file records only *what* landed. The two files collide across the
`R-42…R-49` band and are deliberately not renumbered, so shipped comments cite the second
as `design R-nn`.

## [Unreleased]

### Fixed

- **The amount field on `/new`'s review table clipped its own value (F13, #3).** Every amount
  past four glyphs lost its tail: `38.500` rendered `38.50`, `4.500.000` rendered `4.500.`. The
  running Total was right the whole time, which is the worse way round — the row read as a
  smaller number than it was and the total then looked like it disagreed with the rows it is
  the sum of. `/new` puts `MoneyInput` in a fixed `w-[9.5rem]` column, and v0.2.0's design pull
  added R-34's yellow `IDR` badge to a `9.5rem` measured before that badge existed: ~110px of
  the 152 went on chrome, leaving the input 43 against the 81 `4.500.000` needs. The badge is
  gone — the static `Rp` prefix was already doing its stated job, so the field had been stating
  the currency twice on one control — and the input measures **100px** on the row, with the
  column, the row's geometry and the category chip's full label all untouched. Keeping the badge
  would have needed a 190px column, leaving the chip 150 against the 171 `Tempat Tinggal` and
  162 `Belanja Harian` actually measure: a clipped category in place of a clipped amount.

### Changed

- **`MoneyInput`'s input carries `min-w-[6rem]` rather than `min-w-0` (F13).** `min-w-0` is why
  the clipping above went a release unseen: it lets a flex child shrink below its content, so
  the input absorbed the whole 38px shortfall in silence, and a clipped `<input>` throws no
  error, logs nothing and looks like a smaller number. An explicit `min-width` overrides the
  automatic minimum exactly as `0` does, so an `<input>`'s intrinsic ~20-character width never
  becomes the floor; 96px sits 4px under the 100 the column affords, so it constrains nothing
  today and makes the next too-narrow container overflow visibly instead. `scripts/f05-audit.sh`
  holds the floor in place with the width budget written out above the check — and note that
  none of the `f0X-audit.sh` sweeps run in CI, which is the other half of why the guard had to
  be CSS rather than a grep.

- **The per-group photo cap is configuration, not a constant (F06).** `MAX_PHOTOS_PER_GROUP`
  was 10 on a guess — "ten photos is already a lot for one meal" — and real use disagrees: a
  shopping trip's worth of receipts routinely runs past it, and the cap is a hard stop rather
  than a nudge. The default is now **20**, and `PHOTO_MAX_PER_GROUP` moves it without a commit.

  Optional, so a deployment that has never heard of the variable keeps working; a whole number
  in `1..PHOTO_CAP_CEILING` (50), validated in `lib/env.ts` alongside everything else, because
  the failure mode of a too-large cap is a storage bill and the failure mode of `0` is an
  upload button nobody can use — both cheaper to hit at boot than in front of a user.

  **It needs a redeploy, not a commit.** Vercel applies an environment change only to *new*
  deployments, never retroactively to a running one, so the loop is Project Settings >
  Environment Variables, then Redeploy (or `vercel --prod`).

  The number is **server-only and reaches the browser as a prop**. `@/lib/env` is `server-only`
  and `lib/photos/constants.ts` is imported by client components, so the resolver lives in a
  third module, `lib/photos/cap.ts`, and `/new` and `/e/[id]` read it in their Server
  Components and hand it to `PhotoPicker` — `/new` drilling it through `AddExpenseClient` and
  `ReviewStage`. The `NEXT_PUBLIC_` alternative was rejected twice over: it inlines the value
  at BUILD time, and `.env.example` rules out that prefix without exception.

  Enforcement is two layers, and the split is the point. `.max(PHOTO_CAP_CEILING)` is
  structural and static, so a malformed variable cannot widen the action's input; the product
  cap is a `.refine()` that reads the env at PARSE time, i.e. per request. A `.max()` there
  would freeze the value into the schema at module load — which happens to work while the cap
  is per-deployment and would silently stop the day it becomes per-user. The picker's cap is
  UX; this is the boundary.

  One bound had to move with it: `CreateExpenseInput` in `lib/schema/expense.ts` capped the
  photos array at 20, which would have become the *real* ceiling and made the env var stop
  working above 20 with every test about the cap still green. It is now 50 — deliberately a
  literal, since importing F06's constants would give that wave-1 module an edge into wave-3
  code — and `tests/photos.cap.test.ts` asserts it never undercuts `PHOTO_CAP_CEILING`.

  Storage, since the constants file exists to make this argument: at the ~300 KB compression
  target a full 20-photo group is ~6 MB against the 1 GB `BLOB_FREE_TIER_BYTES` that
  `npm run blob:usage` reports. Raising the variable raises that number linearly.


## [v0.2.0] - 2026-08-21

One feature card (F11, F12) and one design revamp, on top of v0.1.0's ten features. The
revamp replaces the entire visual system — every screen looks different — and F12 adds the
photo viewer's four controls, a second share-token type, Judul presets and LLM-written
summaries. No API, route or schema of v0.1.0 changed shape, so this is a minor release.

### Added

**The photo viewer's four controls (F12).** `✕` top-right; download · share · delete
bottom-right. Download is pure client — `navigator.share({ files })` reaches the iOS
sheet's *Save Image*, the only path a web page has to the Photos library — and is warmed on
`pointerdown`, because awaiting a fetch spends WebKit's activation window and would fail on
exactly the slow connection where it matters. Share is a Server Action, so it *cannot* live
in the viewer; it arrives as a prop wired only by `PhotoManager`. Each icon renders only if
its prop is present, so "public pages get download only" is a property of the module graph
rather than a runtime check.

**The photo-only share link (F12).** A second, narrower token type at `/f/<token>` —
`photo_share_links`, `nanoid(12)`, shape-for-shape with `share_links` including the unique
index, so a second tap of the share icon copies the *same* url. `/s/<token>` publishes a
whole group — title, every item, every amount — and sending someone a receipt should not
also publish what you spent. `getPhotoByShareToken`'s projection **is** the privacy
boundary: three columns, no second gate behind it. Public-route discipline is copied
wholesale from `/s/[token]` — `force-dynamic`, no `loading.tsx`, no `og:image`, a deep
import of the viewer, the same three headers.

**Wrap-around swipe in the lightbox (F12).** Two sentinel clones plus one scroll-jump on
settle (`lib/photos/carousel.ts`), which keeps every word of the Lightbox's scroll-snap
docblock true. On settle, never during momentum: rewriting `scrollLeft` mid-fling makes iOS
reapply the remaining velocity from the new offset.

**Judul presets (F12).** Seven title chips, ordered by tap frequency rather than
alphabetically, because only ~2.5 fit before the scroll edge on a 414 px screen. The strings
are verbatim values, not labels.

**LLM summaries — Simpulan (F12).** `Statistik` becomes `Simpulan` (the `/stats` path
stays), and three model-written paragraphs — this week, this month, the last two months —
render below `Pengeluaran Terbesar` in the page's only Suspense boundary. Stamped on write,
generated on read: the save path pays nothing and five rapid edits collapse into **one**
call rather than five. Freshness is two keys because neither subsumes the other — `dataKey`
(`max(updated_at)` *and* the row count, since deleting a group below the max leaves the max
untouched while the data changed) and `scopeKey` (Jakarta ISO week and month, for Monday
morning when nothing changed but "Simpulan Minggu Ini" is now about last week). No fallback,
deliberately: a regex can approximate a parse, nothing approximates prose. A failure writes
no row and the page says so.

**An icon set (F12).** `lucide-react` 1.33.0 arrives, but `components/ui/Icon.tsx` exports
**finished** components rather than a generic adapter, and is the only module allowed to name
the package — enforced by ESLint and `tests/icon.contract.test.ts`. An adapter would have
left `lucide-react` legal at every call site, and once it is, `<Trash2 className="size-5" />`
is less typing than the sanctioned path and renders fine. The 2.5-stroke / square-cap /
mitred-join argument the three old docblocks made is now props on every glyph instead of
remembered in three files. The contract test found five sites the plan had missed, including
**four** independent copies of a typed guillemet chevron at three different weights.

**Fullscreen month mode (R-133).** A floating toggle bottom-right of `/m/[month]` sends the
header up and off the top and the tab bar down and off the bottom, leaving the list scrolling
over the cutout art. Sticky across reload and app restart, and only that button ends it. A
**cookie**, not `localStorage`: the preference decides whether the header is on screen at
first paint, and `localStorage` can only be read after hydration — the header would paint
full height and collapse a frame later. `active` is gated on the pathname, which is the
load-bearing line: the tab bar's layout is shared with `/stats`, and honouring the preference
group-wide would hide the navigation there with no button anywhere to restore it.

**Two tables, one migration.** `photo_share_links` and `expense_insights` in
`drizzle/0001_tricky_young_avengers.sql`, both cascading from their parent. `expense_insights`
is one row per user, not one per section: all three summaries come from a single call over a
single window and go stale together.

**A CI gate.** No `.github` directory existed — every check in the plan's §11 gate was run by
whoever remembered, and `format:check` never was. The workflow runs lint, typecheck, test,
`db:check`, build and `format:check` on pushes to `main`, on pull requests, and on demand.
It **needs no secrets**, and that is a property rather than an oversight: `lib/env.ts` parses
eagerly at import so `next build` does abort without those variables, but every rule in that
schema is a *shape* rule — non-empty, a `postgres` prefix, a parseable URL. None dials
anything. So a fork's PR runs the full gate, nothing can reach the production database, and
nothing can spend z.ai tokens. Adding `format:check` found seven files F12 had left
unformatted; `npm run lint` does not check formatting, because `eslint-config-prettier` only
disables conflicting rules and asserts nothing.

### Changed

**The whole visual system.** The warm-paper / Source Serif / IBM Plex Mono system of v0.1.0
is replaced by the 2026-08-21 Claude Design pull, "flat, loud, graphic": cool grey paper,
near-black ink, one grotesque (Archivo) at 500–900, red as the brand and the one primary
action per screen, yellow as the highlighter. Cards lose their hairline — elevation is
contrast alone, exactly like print. Every token *name* survives (`paper`, `card`, `ink`,
`rule`, `cat-*`) and the whole `--text-*` scale is re-pointed rather than renamed, so five
features' worth of markup keeps compiling; `accent*`, `--font-serif` and `--font-mono`
genuinely died and their ~50 call sites were changed by hand. **Weight is the hierarchy**:
each `--text-*` step now declares its own `font-weight` and `letter-spacing`, which is what
let `font-mono` / `font-serif` be deleted from ~84 call sites without replacing them with
anything. `Money` gets its column alignment from `tabular-nums`, now load-bearing. Six
colours were amended for contrast and four tokens added — `--red-ink`, `--red-fg`,
`--green-ink`, `--chart-bar`, each a second value for a job the single design value cannot do
— every number produced by `scripts/palette-check.py`.

**The cutout art ships.** The v4 wallpaper the revamp is named after was missing in
production: `CutoutArt` was wired and `public/art/` was empty, so the layer resolved five
404s and every screen painted plain paper. `scripts/install-art.mjs` now cuts the five
creatures from the plated originals in-repo (16.4 MB in, 1.4 MB out), so a re-export never
has to remember any settings. **Removal is a border-connected flood fill, not a threshold**,
and that distinction is the whole correctness of the script: a global "near-white becomes
transparent" rule punches holes through the sheep's cream wool and the mountain's snow.
Interior plate walled off from the border by the linework is separated from genuine white art
by **size** — the mountain's snow shatters into 2,957 components whose largest is 0.03% of
the frame, the real holes run 0.30–2.89%, and the gate sits at 0.15% — plus a one-pixel
feather to dissolve the anti-aliasing halo, which is far more visible on a black page. The
composition is scaled 1.35× about each creature's own centre; sign-in stays at 1.0, because
it is a composition framing the wordmark rather than wallpaper.

**Frosted glass on every surface (R-137).** The 32 surfaces that were `bg-card` — cards, the
month and screen headers, `/new`'s sticky footer, fields, the paste box, chips and the sheet
panel — become a translucent tint over a 14 px backdrop blur, so the five creatures show
through the app rather than only behind it. Opaque on the canvas's own authority: the tab bar,
the stickers, the category discs, the picker cells and the primary red button, because a block
of colour is opaque. The tint is .72/.80 rather than the canvas's .55/.50 — the artboards paint
glass over flat grey where alpha is free, but over the real wallpaper the canvas values put
ink-2 at 3.26/2.39 and dark mode at .50 cannot reach 4.5:1 with pure white type at all. On
glass, ink-3 takes ink-2's value. A field's error border moves from `red` to `red-ink`, since
the brand red is 2.69:1 against light glass over the art. All of it layers over an opaque base
inside an `@supports` guard, so a browser without `backdrop-filter` — and anyone who has set
`prefers-reduced-transparency: reduce` — gets the flat card and the third grey tier back.

**No caps anywhere (R-131, F11).** No string was ever authored in uppercase: the caps came
entirely from `text-transform` in `eyebrow` / `sticker` / `sticker-lg` plus 12 raw `uppercase`
classes, and Archivo is a variable font with a full lowercase set, so the typeface stays. What
was real is that casing was a function of *size*. Now it depends on what a string **is** —
Title Case for labels, headings and nav; sentence case for prose; lowercase for data phrases
(`3 catatan · 12 item`). Indonesian Title Case leaves function words lowercase, hence `Ulangi
dari Teks`. Two exceptions keep their caps because they are not text: the two-letter category
glyphs (`MJ`, `BH`) and the `expensetracking.online` domain. Tracking was tuned for caps so it
collapses to ~0.005em, and three small tokens gain a step, because caps carry more optical
presence than the words replacing them.

**One 8 px edge rule for every first and last row (R-132).** Every screen stops the same 8 px
past whatever boundary the system hands it, with a control's own ~14 px of tap-target slack
carrying the rest — 22 px of type off each edge on an XS Max. The asymmetry is deliberate: the
notch is hardware and the status bar paints over the page, so the top keeps
`env(safe-area-inset-top)`; the home indicator is a hint drawn on a screen the app owns, so the
bottom measures from the real edge. Bottom text-to-edge goes 40/62/74/68/60 → 22 across the tab
bar, `/e/[id]`, `/s/[token]`, the sheet footer and the lightbox; every `pt-safe-header` goes
72 → 52. Structurally, `(bare)/layout` stops wrapping every screen in `pb-safe` — that blanket
34 px was the cause on three of its four screens — and the `pb-safe` utility is retired with it.

**The docked sheet footer bends that rule, and only it.** The item editor came back from an
iPhone with the indicator pill drawn across *Hapus* and *Simpan*. A row of 44 px buttons on a
filled background is not the bare link the rule was written for, so "level with the pill" means
the system bar is drawn *on* the fill. That one footer pads by
`calc(env(safe-area-inset-bottom) + 0.5rem)`, which collapses to the plain 8 px on a flat phone
and in the desktop column. The carve-out is recorded next to the rule it bends.

**`/e/[id]` (R-134).** Opens with the same 30 px `text-title` that `Tambah` wears, rather than
an 11 px eyebrow — the old comment argued a second large heading would fight the expense's own
title, but that title is a 17 px `Input` inside a `JUDUL` field. Two icon actions in the header:
share as a hand-drawn tray glyph, and delete as a grey trash, retiring the full-width red block
at the foot of the page. That supersedes design R-38 and R-124, both reversals argued with their
cost — the delete target is now a thumb-width from one the user taps on purpose, and
`DeleteExpenseSheet`'s title-quoting confirm is what makes the trade acceptable. Grey rather
than red, so a page usually just being read has no permanent alarm on it. And `CATATAN` is
earned rather than reserved: an empty note rendered the biggest blank rectangle on the screen
for the least-used field, so it is now one mono `+ Tambah catatan` row that becomes the real
field when tapped and folds back if nothing is typed.

**A per-day total prints only when the day holds more than one expense (R-135).** A
one-expense day printed the identical rupiah figure twice, ~30 px apart — a sum of one addend
presented as a summary — and most days in this app are one-expense days, so this is the common
case. `bucketByDay` is untouched: the decision is presentational, and a day that later earns
its total needs no query change.

**`Pengeluaran Terbesar` is typeset like the rows it sits above**, dropping from 17/800 to the
15/600 step every `Rincian Kategori` row uses. The two cards hold the same kind of thing, and
at the larger step the single row read as a heavier *class* of number than the eight beneath it.

**Node 24 across the stack.** Vercel already builds this project on `nodeVersion: 24.x`, while
`engines.node` said `>=22.0.0` and `@types/node` was 22.20.1 — the declared floor and the types
disagreeing with the only runtime that ships the app. Now `>=24.0.0`, `@types/node` 24.13.3
exact, and a new `.nvmrc`. `engines` stays advisory (`engine-strict` is deliberately unset), so
a machine on Node 22 still installs and merely warns.

### Fixed

- **Swiping between photos never worked, and never had since F06.** The lightbox `<img>`
  carried `touch-action: none` to keep Safari from claiming the pinch — true — but per spec
  that also suppresses scrolling an *ancestor* scroll container, and the scroll-snap track is
  an ancestor. It went unnoticed because `object-contain` leaves letterbox bars on a wide
  viewport and swiping those hits the host div, which pages fine; it was broken only on a phone
  in portrait, where the photo fills the width and there is no bar left to grab. `pan-x` permits
  exactly the horizontal panning wanted and still withholds `pinch-zoom`, flipping to `none`
  while zoomed. F12's own eighteen tests are all about where the scroller *settles* and every
  one is correct — none can observe that nothing ever asked it to move.
- **The floating viewer controls rendered below the fold on iOS.** `position: fixed` anchors to
  the *layout* viewport, whose bottom edge sits under Safari's toolbar, so a `fixed inset-0`
  overlay is taller than the visible band and the whole bottom cluster was behind browser
  chrome. The top-pinned counter was visible the whole time, which is what made it look like the
  buttons had never shipped. `inset-0` becomes `inset-x-0` — top + bottom + height is three
  constraints for two degrees of freedom and the browser drops one silently — plus the
  `--app-h` / `--vv-top` pattern `AddExpenseClient` had already solved this with. `useVisualViewport`
  is therefore **ref-counted**: without it, closing the lightbox removed `--app-h` from under
  `/new`, whose effect has an empty dependency array, so the *Simpan* bar would intermittently
  jump back behind the keyboard.
- **The control cluster sat on the home indicator.** It shipped `pb-2` citing the 8 px edge
  rule, but it is a floating pill, so the rule applies to its own bottom edge rather than to a
  line of type in a full-bleed bar. `pb-5.5` keeps the whole capsule clear.
- **Download opened a share sheet on desktop.** Chrome on Windows and ChromeOS implements
  `navigator.share({ files })`, and the iOS-specific reasoning had been inherited for no
  reason. Now gated on `(pointer: coarse)` — a media query rather than a UA test, because it
  asks the question actually meant and needs no platform-string list to rot.
- **The floating controls were invisible over a receipt.** `bg-white/15` is a 15% *white* scrim
  carrying *white* glyphs, legible over exactly one thing: the black letterbox. The photos in
  this app are receipts — mostly white paper. A dark scrim inverts the failure into a guarantee,
  because the disc and the glyph cannot fail together. Applied to all five translucent surfaces
  in the viewer, not only the reported cluster. Not yellow, which `stickers.ts` reserves for
  "you are here"; not red on the resting trash, so the screen you open to look at a receipt has
  no permanent red dot.
- **Fullscreen could be restored from a stale RSC payload.** Reported from prod: go fullscreen
  on Bulan Ini, come back out, walk to Tambah, edge-swipe back, and land in fullscreen — a state
  not reachable by hand, since the tab bar is `inert` and off screen while collapsed. `/new`
  lives in `(bare)`, so walking there unmounts the `(shell)` provider; the gesture remounts it
  from Next's client Router Cache, replaying a payload captured with `initial={true}` baked in at
  render time. `initial` is demoted to what it always should have been — a first-paint hint that
  keeps hydration from flashing — and an effect reads `document.cookie` and hands authority back
  to it. On the ordinary path React bails out of the re-render and it costs nothing. `pageshow` is
  listened to as well, for a page restored from iOS Safari's back-forward cache with its JS heap
  intact, where the component never remounts at all.
- **In fullscreen the first day sticker sat under the status bar.** The clearance was one token
  on the box that *collapses*, so collapsing the header took the notch inset with it. Split
  across the two levels: `pt-safe` on the `<header>`, where the collapse cannot reach it, and the
  decorative 1.75rem inside — the two halves sum to the old token, so the open header is
  unchanged to the pixel. Two things the obvious fix gets wrong, both found by rendering it: the
  collapsed band has to be **opaque** (it is still `sticky top-0`, so rows scroll straight
  through a transparent one), and the content has to travel 100% **plus the inset**, because
  overflow clips to the padding box and one content-height parks the bottom edge inside the
  header's own `pt-safe` band.
- **`JUDUL` was welded to the header hairline** on `/e/[id]` — a measured 0 px — while every
  other block floated clear of its neighbour. `pt-gutter` on the body div makes the top inset and
  the side insets one number, and `loading.tsx` gets the same token; it had `pt-4` against the
  real page's zero, shifting every block 16 px on handover.
- **`/new`'s footer painted one safe-area inset short of the bottom**, so the wallpaper showed
  through beneath the white sticky bar and it read as a floating slab. The column takes the full
  `100dvh` with the wrapper's padding cancelled by an equal negative margin. It then measured its
  own pad against the *reserved* inset rather than the indicator, leaving 35 px of blank white
  above a pill that sits 8 px off the edge; padding by 8 px puts the label level with it.
- **The wallpaper placement, from looking at the running app.** Mountain to dead centre as the one
  landscape-shaped creature, centred on the *scaled* box; snake and sheep trade places, with the
  snake lower so its head clears the month header; snake +15%, octopus +20%, sheep +20% and
  +15° — each growing about its **own centre**, since `left`/`top` are a top-left corner and
  bumping `width` alone would walk all three down and to the right by half the growth.
- **Two latent data bugs, found while designing the freshness watermark.**
  `app/actions/items.ts` never bumped `expense_groups.updated_at`, so any check keyed on it would
  read a stale summary as fresh — fixed, while the photo actions deliberately do not, since an
  insight is written from item rows only. And `jakartaWeekKey`'s `1 + round(diff/7)` is correct
  only when 1 January is a Thursday: with jan1 on a Friday every week that year reports one too
  high, so two weeks would share a `scopeKey` and silently overwrite each other. Caught by a test
  on 2027-01-04.
- **`npm run lint` reported 20,892 problems** before F12, all from a stale nested worktree's
  Turbopack chunks. `.worktrees/**` added to `globalIgnores`.
- **Prettier had been failing on the sheet's `{footer}` wrapper** since the 8 px edge-rule commit.
  Whitespace only; `format:check` now passes across the whole repo.

### Security

- `/f/<token>` resolves to one blob URL and nothing else. The projection in
  `getPhotoByShareToken` is the boundary — three columns, no second gate — so publishing a
  receipt cannot publish the group's title, items or amounts.
- Revoking a photo link **is** deleting the photo, via `onDelete: 'cascade'`. There is no
  separate control, and F12 §4.7 records that as an accepted cost.
- CI needs no secrets, so a fork's pull request runs the full gate without reaching the
  production database or spending z.ai tokens. The live suites skip themselves without
  `LLM_LIVE_TEST=1`.

### Known gaps

Carried forward from v0.1.0 unchanged: budgets, recurring expenses, multi-currency, export,
receipt OCR, search, tags beyond the eight categories, household accounts, offline writes, push
notifications, editing on the shared page, feature flags, an admin panel, a settings page, a
dark-mode toggle and an i18n layer.

New to this release, and each written down where it lives:

- **CI does not gate the deploy.** The project has auto-deployed every push to `main` since
  19 August, in parallel with CI rather than after it, so a red commit still ships. Closing that
  needs branch protection and PRs into `main`, both of which change how the repo is worked day to
  day.
- **`.sheet-panel` is not verified on hardware.** It now carries `backdrop-filter` alongside a
  transform, `will-change` and top-layer stacking — the same neighbourhood as the iOS dialog
  painting bug documented on `.sheet`. The revert is one line and is written down there.
- **`/new`'s `StickyBar` still carries the original edge ruling** and has not been re-checked on
  hardware, so the two footers now differ.
- **The rose lands behind the second card** on the month list rather than in the gap under it, an
  accepted consequence of the sheep's move. It was visible before that change.
- **The empty-month copy still points at "tab Tambah"**, which is off screen while the tab bar is
  collapsed. Left as product copy.

### Notes

907 tests pass and 17 skip across 52 files, up from 45 files at v0.1.0. The two skipped files are
the live LLM suites, which spend real tokens; `db:migrate` needs live Neon credentials and is
likewise not part of the gate.

The four bugs F12 needed after it passed its §11 gate were every one of them found by a person
holding a phone, and none is expressible as an assertion in this repo: whether a finger can page
a scroller, whether a fixed element's bottom edge is on screen, whether a white mark reads on a
white photograph. Two were latent and merely uncovered by putting controls where nobody had put
controls before. What the suite can now do — and does, in `tests/photos.lightbox.contract.test.ts`
and `tests/icon.contract.test.ts` — is pin the values that were wrong, so the next person who
tidies `bg-black/60` back to something translucent is told which bug they are re-opening. Every
`env(safe-area-inset-*)` resolves to 0 without a notched device and `viewport-fit=cover`, so the
verification harness now hard-codes the XS Max insets (44 top, 34 bottom) and paints the
status-bar band; an overlap is visible rather than inferred. The gate is necessary and not
sufficient: for a touch feature, its last line is a phone.

Also corrected from v0.1.0's deployment record: the earlier "the push never deployed" diagnosis
was wrong. Git deploys had fired for every push, and the generic 404 was almost certainly a
CDN-cached static `/_not-found` from before the route existed — which generalises. A 404 from a
path that did not exist yet is not evidence about what is deployed.

## [v0.1.0] - 2026-08-19

First release. Ten features (F01–F10) built in the order
`F01 → F03a → F10 → F03b → F02 → (F04, F06) → (F05, F07) → (F08, F09)`, live at
[expensetracking.online](https://expensetracking.online).

### Added

**Paste → parse (F04).** `POST /api/parse` turns a free-text Indonesian paste into a title,
a date and categorised items. GLM-5.2 through z.ai's Anthropic-compatible endpoint, driven
by a single forced tool (`record_expense`) rather than a JSON-mode prompt, so the mechanism
is portable across Anthropic-compatible servers. Handles `45k` / `45rb` / `1,5jt` /
`Rp 38.500` money notation, `DD/MM/YYYY` dates and day names.

**Never hard-blocked (F04).** Zod-validate the tool output → one repair round trip → a
deterministic regex fallback parser. A 25 s timeout or an LLM outage degrades to the
fallback instead of losing the paste. The route also carries auth, an input cap, a burst
limit and human-readable errors. A 12-paste fixture corpus covers both paths, plus a live
suite (`npm run test:live`) held green across three consecutive runs.

**Add-expense flow (F05).** `/new` in two stages — paste, then an editable review table.
Draft state is a reducer persisted through a versioned `localStorage` codec, so a mis-tap
does not cost the paste. Sticky total-and-*Simpan* bar tracks the visual viewport (iOS
keyboard). `createExpense()` writes group, items and photos in one `db.batch`.

**Auth (F02).** Auth.js v5 with Google as the only provider, JWT sessions and the Drizzle
adapter. `requireUserId()` is the boundary every action and page opens with. `proxy.ts`
uses a **positive** matcher (`/new`, `/m/:path*`, `/e/:path*`, `/stats`) so `/s/:token`
staying public is structural, not incidental — and it is a UX redirect, never the security
boundary. Sign-in redirects pass through an open-redirect guard.

**Data layer (F03).** Neon Postgres over `@neondatabase/serverless` with Drizzle ORM.
Four app tables (`expense_groups`, `expense_items`, `expense_photos`, `share_links`) beside
the four Auth.js adapter tables, one applied migration, and a read layer whose ownership
predicates (`itemOwnedBy`, `photoOwnedBy`, `shareLinkOwnedBy`) are exported from
`lib/db/queries.ts` for callers to import — never re-declare. Integration suite runs green
under four timezones.

**History and editing (F07).** `/m/[month]` lists groups newest-first, sub-grouped by day,
month total in the header. `/e/[id]` renders a group with every field inline-editable.

**Stats (F08).** `/stats` gives a 12-month bar chart, a month-over-month delta, a category
bar list and the biggest-single-expense callout — all aggregated in SQL, with empty months
drawn rather than closed.

**Photos (F06).** Compressed client-side in a web worker to ≤1600 px / ~300 KB / JPEG q0.8
with EXIF stripped, then uploaded straight to Vercel Blob so the 4.5 MB serverless body
limit never applies. `PhotoPicker` (74 px strip, progress, cancel, per-file retry),
`PhotoGallery` with a hand-rolled lightbox, and an orphan-blob sweeper
(`npm run blob:usage` / `blob:sweep`).

**Read-only sharing (F09).** Any group is shareable at `/s/<token>` — `nanoid(12)`, ~71 bits
— with no login, `noindex` headers and dynamic-only caching. `createShareLink` is an
idempotent get-or-create; revoking deletes the row. The public page omits raw paste text,
edit affordances and owner identity.

**Design system (F10).** Tailwind CSS v4 CSS-first `@theme` tokens from the Claude Design
pull, an iOS base layer with `viewport-fit=cover`, self-hosted Source Serif 4 and IBM Plex
Mono built at install time, and UI primitives — Button, Card, Money, Field, Input, TextArea,
MoneyInput, Sheet, Chip, CategoryPicker, EmptyState, Toast, TabBar. PWA manifest, generated
icon set, and a palette contrast gate. Dark mode comes from `prefers-color-scheme`; there is
deliberately no toggle.

**Eight categories (F03a).** Each with an Indonesian label, a colour token and a two-letter
mono code — `MJ`, `BH`, `TR`, `TG`, `TT`, `HB`, `KS`, `LN`. Exactly eight, so the picker
fits a 2×4 tap grid in a bottom sheet. Alongside them: `nanoid` ids with an `isValidId`
shape gate, `formatIdr` / `formatIdrCompact` / `parseIdrLoose`, and Asia/Jakarta date
helpers with Indonesian month names.

**Foundation (F01).** Next.js 16.3.1 App Router on a pinned dependency set, Node runtime
everywhere, Zod-validated environment that crashes the process at boot on a missing
variable, `/api/health`, Vitest 4 with 45 test files, ESLint flat config and Prettier.
Serverless functions pinned to `sin1` (Singapore).

**Docs.** `README.md` with captured screenshots and demo GIFs from the running app,
`ROADMAP_v0.1.0.md` as the shared contract, `docs/RECONCILIATION_v0.1.0.md` holding rulings
`R-1…R-130`, one plan file per feature, a Vercel + DNS deployment runbook, measured LLM cost
notes in `lib/llm/COST.md`, and `AGENTS.md` pointing at the Next.js 16 docs in
`node_modules/next/dist/docs/`.

### Security

- Every Server Action opens with `const userId = await requireUserId()`, and every query is
  filtered by that `userId` — including nested ones. An item update reaches back to
  `expense_groups.user_id` to prove ownership.
- `NotFoundError` deliberately cannot distinguish "does not exist" from "belongs to someone
  else", so it cannot be used as an ownership oracle for enumerating other users' ids.
- `.env.example` is the only committed env file; every variable in it is server-only and
  none may ever carry a `NEXT_PUBLIC_` prefix.

### Known gaps

Deliberately **not** in v0.1.0: budgets, recurring expenses, multi-currency, export, receipt
OCR, search, tags beyond the eight categories, household accounts, offline writes, push
notifications, and editing on the shared page. Also absent by the core tenet of simplicity:
feature flags, an admin panel, a settings page, a dark-mode toggle and an i18n layer.

### Notes

The eight `fix:` commits and one `revert:` commit in this range all corrected code that had
not yet been released, so they are folded into the entries above rather than listed
separately. The revert is worth naming: a ghost-click guard on the bottom sheet was dropped
because it fixed a bug that did not exist.

[v0.2.0]: https://github.com/miftahulmahfuzh/expense-tracking/releases/tag/v0.2.0
[v0.1.0]: https://github.com/miftahulmahfuzh/expense-tracking/releases/tag/v0.1.0
