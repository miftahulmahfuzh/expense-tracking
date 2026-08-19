# Design integration — pulled 2026-08-19

Source: Claude Design project `8c505e75-e97a-4c8e-b7c0-04aeb074bc7f`, files
`00 Foundations`, `01 Components`, `02 Sheet and Media`, `03 App Prototype`.
Pulled via `DesignSync`. Normalised tokens live in `docs/design/tokens.css`.

**The design wins over F10's plan wherever they disagree**, except where an iOS
constraint from F10 §3 is at stake — and in the one place that mattered, the design
had already got the constraint right. Rulings continue the reconciliation numbering.

---

## The direction, in one paragraph

Warm paper (`#f0ede4`) and near-black ink, not white-and-grey. **Source Serif 4** for
anything that is *language* — expense titles, day headings, prose, empty states — and
**IBM Plex Mono** for anything that is *bookkeeping* — every amount, date, count, label,
button and the tab bar. Money is bookkeeping, so money is always mono, which produces the
whole hierarchy from one rule and gives tabular figures by construction rather than by CSS
trick. Eight muted earthy category hues, each also carrying a **two-letter code** so colour
never carries meaning alone. **No shadows anywhere.**

---

## R-34 · Category identity is a two-letter mono code, not an emoji. ⚠️ contract change

The roadmap §4.1 and F03's `CATEGORY_META` specify an `emoji` per category. The design
replaces it with a **ledger mark**: `MJ`, `BH`, `TR`, `TG`, `TT`, `HB`, `KS`, `LN`.

**Ruling: adopt the codes; `emoji` is removed from `CategoryMeta`.** This is better on
three independent grounds, not just aesthetics:

- Emoji rendering varies by OS, vendor and font-version; a two-letter code is the same
  glyph everywhere and can be tinted with the category colour, which an emoji cannot.
- It is the accessibility channel. In the item row the code *is* the category — there is no
  room for a full chip — so the redundancy that makes the palette safe for colour-blind
  users comes free on every screen, not just the picker.
- It sets in IBM Plex Mono at 10px and aligns in a column. An emoji does neither.

```diff
  export type CategoryMeta = {
    id: Category
    label: string          // 'Makan & Jajan'
-   emoji: string          // '🍜'
+   code: string           // 'MJ' — two chars, uppercase, unique
    color: `--color-cat-${Category}`
    hint: string
  }
```

| key | code | label |
|---|---|---|
| `food` | `MJ` | Makan & Jajan |
| `groceries` | `BH` | Belanja Harian |
| `transport` | `TR` | Transport |
| `bills` | `TG` | Tagihan |
| `housing` | `TT` | Tempat Tinggal |
| `entertainment` | `HB` | Hiburan |
| `health` | `KS` | Kesehatan |
| `other` | `LN` | Lainnya |

**Blast radius:** F03 (`lib/categories.ts`), F05 and F07 (item rows, picker), F08 (bar-list
row heads), F09 (shared page). All were going to read `CATEGORY_META` anyway; they read a
different field.

## R-35 · Two webfonts, self-hosted through `next/font/google`. Reverses F10's system stack.

F10 chose the system stack for zero bytes. The design is **built on** the serif/mono split —
drop the fonts and the entire hierarchy collapses into one voice.

**Ruling: take the fonts, but not the way the design loads them.** The design HTML uses a
`<link>` to `fonts.googleapis.com`, which is a render-blocking third-party round trip.
`next/font/google` downloads both families at **build** time, self-hosts them from our own
origin, and emits `font-display: swap` with zero external requests:

```ts
import { Source_Serif_4, IBM_Plex_Mono } from 'next/font/google'
export const serif = Source_Serif_4({ subsets: ['latin'], display: 'swap', variable: '--font-source-serif' })
export const mono  = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500'], display: 'swap', variable: '--font-plex-mono' })
```

Latin subset only, two mono weights only, no italic on the mono. F10's performance concern
was legitimate; this answers it without giving up the design.

## R-36 · Zero shadows. Tightens F10's "two shadows".

Elevation is `--card` sitting lighter than `--paper` plus a hairline `--rule`. The bottom
sheet earns its layer from the `--scrim` behind it; the toast from inverting to ink. The
raised **Tambah** button is an ink circle breaking the tab bar's top rule — still shadowless.
This survives dark mode, where shadows are invisible anyway.

## R-37 · `inputMode="numeric"`, and R-32 is reversed.

R-32 accepted F10's `decimal`. The design specifies `numeric` **with dots inserted as you
type, never typed** — so there is no separator for the user to enter and no decimal to
reach for. `numeric` is correct; my original brief was right for a reason I hadn't
articulated. The `Rp` prefix sits *outside* the editable value, as a static mono span.

## R-38 · No tab bar on `/e/[id]`. Reverses F07.

The prototype shows the tab bar on `month`, `add` and `stats` only. Detail gets a header
with `‹` back, a mono "Detail" label, and **Bagikan** as a text button top-right.

**Ruling: the design is right** — detail is a pushed view, not a tab destination, and this
is the platform convention the user's thumb already expects. F07's route group holds; `/e/`
moves outside it, joining `/new` and `/s/`.

## R-39 · The category breakdown was already a bar list. R-3 confirmed independently.

The design's `/stats` renders each category as a row — code, label, amount, then a 4px
progress bar tinted with the category colour. That is exactly what F08's validator forced
us to. Two independent processes reaching the same answer is the strongest signal we have
that R-3 was right.

The 12-month chart is plain bars: current month in `--accent`, the rest in `--rule`,
single-letter labels beneath. Zero-height months are visible as bare labels.

## R-40 · Copy is now fixed, in Indonesian.

The prototype settles wording that was `TBD` across five plans. These strings are canonical:

| Where | String |
|---|---|
| Sign-in eyebrow / title / sub | `expensetracking.online` · `Expense Tracking` · `Catat pengeluaran dengan sekali tempel.` |
| Google button | `Lanjut dengan Google` |
| Month meta line | `6 catatan · 18 item` |
| Empty state | `Belum ada catatan` / `Bulan ini masih kosong. Tempel catatan pertamamu di tab Tambah.` |
| Parse button / loading | `Rapikan` · `Merapikan catatanmu…` |
| Draft actions | `Simpan` · `Ulangi dari teks` · `+ Tambah item` |
| Field labels | `Judul` · `Nama` · `Jumlah` · `Foto` · `Total` |
| Sheets | `Pilih kategori` · `Ubah item` |
| Toasts | `Item dihapus` · `Pengeluaran dihapus` · `Tersimpan` · `Urungkan` |
| Destructive | `Hapus pengeluaran` |
| Share footer | `Dibagikan lewat expensetracking.online` |
| Photo badge | `⧉ 3` (glyph + count, inside the mono meta line) |

## R-41 · Measurements to build to

Screen gutter **22px**; 4pt spacing base. Buttons **52px** tall, small variant **44px**.
Inputs **48px** tall at **17px** text. Item rows **min 52px**, group rows **min 56px**.
Delete target a full **44×44**. Photo thumbnails 3-up at **6px** gaps; the draft strip uses
**74×74** tiles. Sheet: grabber 36×4, `--r-card` top corners, no close button — tapping the
scrim dismisses. Lightbox goes true black `#0d0d0b` **in both schemes**, because photos want
a dark room.

---

## Still to verify before `/stats` ships

**R-28 stands and now has real numbers to check.** F08 validated its palette against
surfaces `#fcfcfb` / `#1a1a19`; the design's actual surfaces are `--card` `#fbfaf5` /
`#1e1e1a` and `--paper` `#f0ede4` / `#131311`. Close, but not identical, and three
light-mode slots were already near the 3:1 relief floor. **Re-run the `dataviz` validator
against `docs/design/tokens.css` before building the chart**, and treat a failure as a
reason to nudge a hue, not to ship it.

The design claims ≥4.5:1 for every category on its own surface. That is a claim to verify,
not an assumption to inherit — the same standard I held F08 to.

---

## Verified by F10 (2026-08-19)

**R-28 is discharged.** `scripts/palette-check.py` now measures the design's real surfaces
(`--card` `#fbfaf5` / `#1e1e1a`, `--paper` `#f0ede4` / `#131311`) rather than the ones F08 guessed at.

The design's claim of ≥4.5:1 for every category on its own surface **holds** — and it was held to the
stricter standard on purpose, because the two-letter code renders the category colour as *text*, not
as a chart fill:

| | light, on card | light, on paper | dark, on card | dark, on paper |
|---|---|---|---|---|
| range across the eight | 5.08 – 7.10 | 4.53 – 6.34 | 5.78 – 7.76 | 6.43 – 8.63 |

`paper` on a selected chip's fill also clears 4.5:1 in both schemes (4.53 – 6.34 light, 6.43 – 8.63
dark), so the "text flips to paper" trick in R-34 is sound rather than lucky.

**Two failures elsewhere in the palette were found and fixed, not waived:**

- `--ink-3` measured **2.85:1** on paper. It is every label, meta line, placeholder and inactive tab
  label — small text with no large-text exemption. Darkened along its hue to `#6e6c61` / `#86857b`
  (R-48).
- A third line token, `--rule-strong`, was added for the border that *identifies a control*, which
  WCAG 1.4.11 holds to 3:1 and `--rule` misses at 1.28:1 (R-49).

**One waiver, with an expiry.** Pairwise separation between the eight hues is ΔE 0.065 light / 0.042
dark, below the 0.10 categorical floor. Accepted because nothing in this design keys a category by
colour alone — the code is always present, the 12-month chart has no categorical series, and the
breakdown is a labelled bar list. The checker prints the waiver and its expiry on every run: **it
lapses the moment a view identifies a category by colour alone** (R-50).

Also corrected: `tokens.css` declares the eight category values as `--color-cat-<key>` and then
re-declares those same names inside `@theme inline`, which is a circular reference that computes to
nothing. `app/globals.css` splits the raw value from the alias (R-47). The values here are unchanged
and remain the provenance record.

**On the numbering:** these rulings, R-34…R-41, are the canonical R-34…R-41. F03a's addendum in
`RECONCILIATION_v0.1.0.md` had independently reused the same five numbers and has been renumbered to
R-42…R-46. F10's own rulings continue at R-47.
