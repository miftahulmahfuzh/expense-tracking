# F14 — Category taxonomy: 8 → 17

**Card:** [#6](https://github.com/miftahulmahfuzh/expense-tracking/issues/6) · round 1 · branch `task/6-replace-makan-jajan-with-11-specific` off `14819a4`

Replaces the catch-all `food` with five specific eating categories, drops `groceries`, and gives the recurring bills/services their own slots. The set goes from 8 to 17.

---

## 1. The two open questions on the card, decided

The card flagged both as "decide in the design pass, do not assume". Both are decided here, from the words on the card rather than from taste.

### 1a. `housing` (Tempat Tinggal) stays

The user named two removals explicitly — Makan & Jajan, and Belanja Harian — and `housing` was in neither list. **The narrowest reading that fully satisfies the card keeps it.** Removing a category the user never asked to remove is wider than what was written, and it is not free: apartment rent is a real recurring expense with nowhere else to go, and dropping `housing` would silently send it to `other` — the exact genericness this card exists to fix.

The new `utilities` ("Listrik & Air Apart") does overlap it, and that is resolved by 1b, not by deleting a category.

*Rejected:* fold `housing` into `utilities` as one "apartment" bucket. It conflates a monthly rent in the millions with a utility bill in the tens of thousands, which is precisely the granularity complaint the card opens with.

### 1b. Specific wins; the generic keeps the remainder

The user kept `transport`, `bills` and `entertainment` **and** asked for `bensin`, `sewa parkir motor`, `internet`, `listrik & air apart` and `bioskop` — which the old hints listed as examples *of* those three generics. Read literally, the specifics would never be chosen, because the generic still advertises itself as their home.

So each generic loses the examples that now have their own category and keeps the rest:

| Generic | Keeps | Loses to |
|---|---|---|
| `transport` | gojek, grab, angkot, krl, mrt, tol, service motor, tiket | `fuel`, `parking` |
| `bills` | pulsa, paket data, IPL, iuran, BPJS, asuransi | `internet`, `utilities` |
| `entertainment` | game, top-up, streaming, konser, karaoke, billiard | `cinema` |
| `other` | kado, transfer, admin bank, laundry, elektronik | `grooming` (potong rambut) |

**This is an inference from the card, not a quote from it.** It is recorded here and in the card comment so that if the user meant the other reading — generics disappear entirely — one comment reopens it. That reading lost because the user wrote "keep" next to all three.

---

## 2. The set

17 = 11 new + 5 kept + `other`. Slugs stay lowercase single words, matching the existing convention; labels stay Indonesian; every `code` is unique.

| # | slug | label | code | replaces |
|---|---|---|---|---|
| 1 | `meals` | Makan Harian | MH | part of `food` |
| 2 | `jajan` | Jajan | JJ | part of `food` |
| 3 | `dining` | Fancy Makan Berat | FM | part of `food` |
| 4 | `snacks` | Snack | SN | part of `food` |
| 5 | `drinks` | Beverage | BV | part of `food` |
| 6 | `groceries` | — | — | **deleted** |
| 7 | `transport` | Transport | TR | kept, narrowed |
| 8 | `fuel` | Bensin | BN | new |
| 9 | `parking` | Sewa Parkir Motor | PK | new |
| 10 | `bills` | Tagihan | TG | kept, narrowed |
| 11 | `internet` | Internet | IN | new |
| 12 | `utilities` | Listrik & Air Apart | LA | new |
| 13 | `housing` | Tempat Tinggal | TT | kept (§1a) |
| 14 | `entertainment` | Hiburan | HB | kept, narrowed |
| 15 | `cinema` | Bioskop | BS | new |
| 16 | `health` | Kesehatan | KS | kept |
| 17 | `grooming` | Pangkas Rambut | PR | new |
| 18 | `other` | Lainnya | LN | kept, migration target |

`jajan` keeps its Indonesian name as the slug: it has no English equivalent that is not `snacks`, which is a *different* category here (packaged snack vs. buying a treat out).

Ordering is by family — eating, transport, bills/home, leisure, health, other — because `CATEGORIES` order **is** the picker's grid order and F08's chart series order. Grouping the families means a colour and its neighbours mean related things in the same place.

---

## 3. Approaches considered

| | Convention | Scope | Verifiability | Reversibility | |
|---|---|---|---|---|---|
| **A. Edit `CATEGORIES` in place; keep one flat list** | ✅ exactly what the module is for | ✅ smallest change that satisfies the card | ✅ `palette-check.py` + `tests/categories.test.ts` prove it | ✅ one commit | **chosen** |
| B. Two-level taxonomy (parent + child) | ❌ nothing in the repo is two-level; `expense_items.category` is one text column | ❌ touches the schema, the zod contract, stats grouping and the LLM tool schema | ⚠️ needs new tests for a shape nothing else uses | ❌ a migration to undo | rejected |
| C. User-editable categories in the DB | ❌ no table, no CRUD UI, no seeding story | ❌ far past the card | ❌ the LLM prompt can no longer be static | ❌ | rejected |

B is what this becomes *if* the user later wants "makan" totals across all five eating categories. That is a real future need and it is cheap to add later — a `family` field on `CategoryMeta` — so nothing here forecloses it. It is not in this card.

---

## 4. The palette: 17 hues, measured

The hard gate is `--disc-ink` (**pure black**) on the category fill at **4.5:1** — the disc is a solid circle carrying a bold black two-letter mark, so every category colour must stay bright enough for black type in *both* schemes.

All 17 clear it (`scripts/palette-check.py`):

- **light** — lowest are `meals` 4.62, `transport` 4.66, `other` 4.62, `housing` 4.74; highest `snacks` 10.46
- **dark** — lowest are `meals` 6.82, `transport` 7.64, `housing` 7.82, `other` 7.84

Hues are assigned in **families** rather than 17 unrelated points: eating is red→orange→yellow, transport blue, bills/home violet, leisure pink, health teal, grooming green. Seventeen mutually distinguishable hues do not exist — categorical colour perception tops out well below that — so the family structure is what makes the palette readable, and the two-letter code is what makes it *unambiguous*.

Four values are inherited rather than reinvented, so nothing that already shipped moves: `meals` takes `food`'s red, `transport`, `housing`, `bills`, `entertainment`, `health` and `other` keep theirs, and `grooming` reuses the green freed by deleting `groceries`.

**Separation drops from 0.042 to 0.031 (Oklab ΔE), and the existing `WAIVER` in `palette-check.py` already covers it** — colour is never the only channel: every chip, picker cell, row, bar head and tooltip renders the code and an sr-only Indonesian label, and `CategoryDisc` has no colour-only mode to opt into. The waiver's stated expiry — "the moment a view identifies a category by colour alone" — is unchanged and still not met. The waiver text is updated with the new number and count rather than left claiming eight.

---

## 5. The picker stops being 2×4, and that invariant is retired on purpose

`CategoryPicker.tsx` documents: *"eight 52px cells fit on screen without scrolling — so the picker never scrolls and every category is one tap away."* **Seventeen cells cannot satisfy that on any phone-sized sheet**, in any column count. The invariant is not being broken carelessly; it is unachievable at this count and the comment is rewritten to say so.

- **Chosen:** keep `grid-cols-2`, let the sheet scroll. Smallest change; labels stay untruncated (the new "Listrik & Air Apart" and "Fancy Makan Berat" are longer than the two labels being deleted, so narrower columns are *worse* than before, not better).
- *Rejected:* 4 columns — the long labels truncate at 414px, and a truncated label defeats the point of having one, which is the original comment's own reasoning.
- *Rejected:* section headers per family — real improvement, but it adds sheet-layout work this card did not ask for. The family **ordering** lands here, so headers stay a one-file follow-up.

---

## 6. Work

1. `lib/categories.ts` — the 17, family-ordered, with labels, codes and hints. Everything else derives from it.
2. `app/globals.css` — `--cat-*` and `--color-cat-*` in all three blocks (light, `prefers-color-scheme` dark, `[data-theme='dark']`), plus the `@theme inline` declarations.
3. `scripts/palette-check.py` — `CATS`, `LIGHT`, `DARK`, and the two waivers' prose.
4. `lib/llm/prompt.ts` — the three hardcoded "eight" strings at `:83`, `:108`, `:270` **generated from `CATEGORIES`** so they cannot drift again, and the `## CATEGORIES` exemplar block rewritten for 17.
5. `ROADMAP_v0.1.0.md` §4.1 — it is marked AUTHORITATIVE and says "Exactly 8".
6. Tests — `tests/categories.test.ts`, `lib/llm/__tests__/prompt.test.ts`, `contract.test.ts`, fixtures.
7. `drizzle/` — a data migration, `UPDATE … SET category='other' WHERE category IN ('food','groceries')`.

## 7. Migration

`category` is `text`, not a PG enum, so no type change is needed — only data. `toCategory()` already degrades any unknown string to `other` and never throws, so the ordering is safe either way, but the migration runs so no row is left holding a slug the app no longer defines.

Dev DB at the time of writing: 36 items, 28 of them `food`. **Prod counts are unknown** — all 9 production env vars are Vercel `Secret` type and cannot be pulled — so the prod row count comes from the Neon console, not from here.

The user reassigns the migrated rows by hand after this ships; nothing is auto-mapped to a specific new category, per the card.
