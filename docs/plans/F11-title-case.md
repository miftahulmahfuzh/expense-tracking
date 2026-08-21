# F11 — Retire the uppercase treatment

**Card:** [expense-tracking#1](https://github.com/miftahulmahfuzh/expense-tracking/issues/1) — "change UPPERCASE to Title Case"
**Date:** 2026-08-21
**Round:** 1

## What the card assumed, and what is actually there

The card reads: *"we mix and match some static text uppercase format. in some places
it is UPPERCASE but in other places it is Title Case. change every single uppercase
text to Title Case. if it is the fonts type limitation, then change the fonts type"*

Two of those premises did not survive contact with the repo, and the plan is shaped by
the correction:

1. **No string in the codebase is authored in uppercase.** Every piece of copy is
   already Title or sentence case — `'Judul'`, `'Simpan'`, `'Detail'`,
   `'Tautan publik'`. The caps are produced entirely at render time by
   `text-transform: uppercase`. So this is not a find-and-replace over strings; it is a
   change to three CSS utilities plus the casing convention behind them.

2. **There is no font limitation.** `app/fonts.ts` loads one typeface — Archivo
   variable, weights 100–900, full lowercase set. Nothing forces caps. The typeface
   stays.

What *is* true is the inconsistency the card is reacting to, and it has a precise
shape: **caps appear only at 10–11px.** Everything 14px and up is already Title or
sentence case, deliberately. `components/ui/Button.tsx:29` records why:

> A button is a flat BLOCK of colour with a heavy sentence-case label — no border, no
> shadow, no uppercase tracking. The previous system set every button in mono caps on
> the theory that an instruction is bookkeeping; this one gets its authority from
> weight (800) and size (17px) instead.

A caps→sentence migration already happened once, at the large sizes. This plan
finishes it at the small ones, so casing stops being a function of font size.

## The rule

Three tiers, decided by what the string *is*, not by how big it renders:

| Tier | Casing | Examples |
|---|---|---|
| Labels, headings, nav | **Title Case** | `Judul`, `Tanggal`, `Item`, `Total`, `Tautan Publik`, `Catatan (Opsional)`, `Bulan Ini`, `Agustus 2026` |
| Sentences & prose | sentence case (unchanged) | `Pengeluaran tidak ditemukan`, `Gagal menyimpan. Coba lagi ya.`, `Tempel catatan belanjamu apa adanya.` |
| Data phrases | lowercase (unchanged) | `3 catatan · 12 item`, `⧉ 2 foto`, `masih diproses…` |

**Sub-rule: Indonesian Title Case leaves function words lowercase** — `dari`, `di`,
`ke`, `dan`, `atau`, `yang`, `untuk`. So `Ulangi dari Teks`, never
`Ulangi Dari Teks`.

### Why the third tier exists

`MonthHeader.tsx:94` and `GroupRow.tsx:32` render a count joined to a noun —
`{summary.groupCount} catatan · {summary.itemCount} item`. Caps hid them as
`3 CATATAN · 12 ITEM`. Title-casing gives `3 Catatan · 12 Item`, which capitalises a
noun mid-phrase for no reason. These are measurements, not labels, so they stay
lowercase once uncapped.

### Scope line

**Only strings that render uppercase today are in scope.** The 17px `Button` labels
were never caps, so `Simpan`, `Rapikan`, `Batalkan tautan`, `Ya, ulangi` are
untouched — changing them would contradict `Button.tsx:29` and exceed the card.

Also explicitly out of scope:

- **Category chip glyphs** (`MJ`, `BH`, …) — two-letter codes, not text. Asserted by
  `tests/categories.test.ts:81` (design R-34). Stay uppercase.
- **`expensetracking.online`** (`app/(bare)/page.tsx:99`) — a domain. Loses the
  `uppercase` class but stays lowercase.

## 1. Token retunes — `app/globals.css` (~lines 309–322)

Wide letter-spacing is a caps convention and reads as amateurish on lowercase. Caps
also carry more optical presence at a given size, so each token gains a step to keep
the weight it had. Font weights are untouched — per `fonts.ts`, weight carries the
hierarchy.

| Token | Size | Tracking |
|---|---|---|
| `--text-label` | 10px → **11px** | 0.14em → **0.005em** |
| `--text-action` | 11px → **12px** | 0.10em → **0.005em** |
| `--text-meta` | 11px (unchanged) | 0.06em → **0.01em** |

Line-heights follow the size bumps where they would otherwise crowd.

## 2. Utility edits — `app/globals.css`

Drop `text-transform: uppercase` and align size/tracking with the retuned tokens:

| Utility | Line | Size | Tracking |
|---|---|---|---|
| `eyebrow` | 621 | 10px → **11px** | 0.14em → **0.005em** |
| `sticker` | 637 | 10px → **11px** | 0.12em → **0.005em** |
| `sticker-lg` | 659 | 12px → **13px** | 0.12em → **0.005em** |

`eyebrow` has 19 call sites, `sticker` 6, `sticker-lg` 3 — all inherit the change with
no per-site edit.

## 3. Copy edits

Nine strings. Three were *lowercase* and caps was hiding it.

| File | Constant | From | To |
|---|---|---|---|
| `app/(bare)/new/copy.ts` | `MANUAL_CTA` | `'isi manual'` | `'Isi Manual'` |
| `app/(bare)/new/copy.ts` | `RESTORED_DISCARD` | `'Mulai baru'` | `'Mulai Baru'` |
| `app/(bare)/new/copy.ts` | `RAW_DISCLOSURE` | `'Teks asli'` | `'Teks Asli'` |
| `app/(bare)/new/copy.ts` | `REPARSE_CTA` | `'Ulangi dari teks'` | `'Ulangi dari Teks'` |
| `app/(bare)/new/copy.ts` | `ADD_ITEM_CTA` | `'+ Tambah item'` | `'+ Tambah Item'` |
| `app/(bare)/e/[id]/copy.ts` | `ADD_ITEM_CTA` | `'+ Tambah item'` | `'+ Tambah Item'` |
| `app/(bare)/e/[id]/copy.ts` | `ADD_NOTE_CTA` | `'+ Tambah catatan'` | `'+ Tambah Catatan'` |
| `app/(bare)/e/[id]/copy.ts` | `NOTE_LABEL` | `'Catatan (opsional)'` | `'Catatan (Opsional)'` |
| `components/share/copy.ts` | `SHARE_PANEL_HEADING` | `'Tautan publik'` | `'Tautan Publik'` |

`SLOW_HINT` (`'masih diproses…'`) stays lowercase — prose tier.

### Four more, found by the visual pass

The nine above are the `copy.ts` constants. **Four heading strings are inline JSX, not
constants, and the first screenshot is what surfaced them** — the sign-in sticker still
read `Catat sekali tempel` after the caps came off:

| File:line | From | To |
|---|---|---|
| `app/(bare)/page.tsx:70` | `Catat sekali tempel` | `Catat Sekali Tempel` |
| `app/(shell)/stats/CategoryBreakdown.tsx:34` | `Rincian kategori` | `Rincian Kategori` |
| `app/(shell)/stats/BiggestExpenseTile.tsx:26` | `Pengeluaran terbesar` | `Pengeluaran Terbesar` |
| `app/(shell)/stats/EmptyStates.tsx:31` | `Tren bulanan` | `Tren Bulanan` |

Deliberately **not** changed, having been checked against the tiers:

- `MonthlyChart.tsx:80` — `{series.length} bulan terakhir` is a count joined to a noun,
  so it is the data-phrase tier, like `3 catatan · 12 item`.
- The inline `eyebrow` strings `Bulan tidak ditemukan`, `Gagal memuat pengeluaran` —
  statements, so prose tier.
- `s/[token]/page.tsx:174` `Expense Tracking`, and everything from `monthLabel()` /
  `dayLabel()` (`Agustus 2026`, `Selasa, 18 Agustus 2026`) — already Title Case.

Lesson for a round 2: **grepping `copy.ts` is not a complete inventory.** Headings that
were never expected to change wording were written inline, and caps hid their casing.

**`ADD_ITEM_CTA` must change in both files together.** `e/[id]/copy.ts`'s header
comment freezes R-40's vocabulary across `/new` and `/e/[id]`; editing one screen's
copy alone is exactly the drift that comment exists to prevent.

## 4. Class edits — 12 raw `uppercase` sites

| File:line | Change |
|---|---|
| `components/ui/TabBar.tsx:88,113,124` | drop `uppercase`; `Bulan Ini` / `Tambah` already Title |
| `components/photos/Lightbox.tsx:170,177,186` | drop `uppercase` **and** hardcoded `tracking-[0.14em]`; `'Hapus foto ini'` → `'Hapus Foto Ini'` |
| `app/(shell)/m/[month]/MonthHeader.tsx:94` | drop `uppercase`; counts stay lowercase |
| `app/(shell)/m/[month]/GroupRow.tsx:32` | drop `uppercase`; counts stay lowercase |
| `app/(bare)/page.tsx:99` | drop `uppercase`; domain stays lowercase |
| `app/(bare)/new/ReviewStage.tsx:242,260` | drop `uppercase` |
| `app/(bare)/new/PasteStage.tsx:83,168` | drop `uppercase` |
| `app/(bare)/e/[id]/ExpenseEditor.tsx:356,537` | drop `uppercase` |

`Lightbox` is the only site with tracking hardcoded inline rather than inherited from a
token — that is why it needs the extra removal.

## 5. Docs that become lies

| Location | Says |
|---|---|
| `docs/design/tokens.css:110–112` | old sizes and tracking, incl. `"small caps"` |
| `app/globals.css:619–620` | *"10px/800 at 0.14em uppercase — the ticket-stub voice"* |
| `app/globals.css:632` | *"tiny loud uppercase type"* |
| `components/ui/TabBar.tsx:25` | *"The label is 11px/800 uppercase"* |

`components/ui/Button.tsx:29` gains a line: its sentence-case rationale now describes
the whole app rather than an exception to it.

## 6. Layout risk

The size bumps are the only part that can break layout. Two tight places:

- **`TabBar`** — three columns in `grid-cols-3` at `max-w-app`. `--text-action` goes
  11→12px *and* `Bulan Ini` widens ~2× losing caps+tracking. Longest label is the
  constraint. Verify at **320px**, the narrowest real phone.
- **`MonthHeader` sticky pill** — `sticker-lg` 12→13px beside the 44px hero total.
  `Agustus 2026` uncapped is *narrower* than capped, so this has slack.

`Field.tsx:60` labels and the `eyebrow` section heads sit in normal flow and will not
reflow.

## 7. Verification

No test asserts casing, so the suite is a regression net, not proof of this change:

```bash
npm run typecheck && npm run lint && npm run test
npm run build
```

Proof is visual:

1. `/dev/ui` (`KitchenSink.tsx`) — renders the utilities directly; fastest single-screen
   check. It sits under `(shell)`, so it carries the real `TabBar` too, which is what
   makes the layout risk observable without a signed-in session.
2. The six real screens at **320px** and **390px**: `/`, `/m/[month]`, `/new` (paste
   and review stages), `/e/[id]`, `/stats`, `/s/[token]`.

### Results (2026-08-21)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass, exit 0 |
| `npm run test` | 773 passed, 15 skipped, 44 files |
| `npm run build` | pass, 12/12 static pages |
| `npm run format:check` | pass on every file this change touched¹ |

¹ `components/ui/Sheet.tsx` fails `format:check`, but it is **pre-existing** — untouched
by F11, empty diff against HEAD. Left alone rather than swept into this commit.

Driven with headless Chromium against `next dev`, at 320px and 390px, `deviceScaleFactor: 2`:

- **`textTransform: uppercase` element count is `0`** on every route rendered — the
  direct assertion that the treatment is gone, rather than an inference from grep.
- `document.scrollWidth === window.innerWidth` at 320px — no horizontal overflow.
- `TabBar`: all three labels `clipped: false`, `scrollWidth === clientWidth`, at both
  widths. `Bulan Ini` / `Tambah` / `Statistik` at 12px. The predicted tight spot held.
- Computed type confirmed live: `eyebrow` 11px / `0.055px` tracking / `none`;
  `sticker-lg` 13px / `0.065px` / `none`.
- No console or page errors on any route.
- The two-letter category glyphs still render uppercase in the chip row, as intended.

## 8. Follow-up

The `05 Shipped State` design canvas carries these artboards and goes stale with this
change. Push a `DesignSync` update after the visual check passes.
