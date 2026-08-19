# Claude Design brief — Expense Tracking

## How to use this

1. Go to **claude.ai/design** and create a **new Design System project** named `Expense Tracking`.
2. Paste the prompt below as your first message.
3. Iterate on the generated components there until you're happy.
4. Come back to this Claude Code session and say *"pull the design"* — I read the project through the `DesignSync` tool (`list_projects` → `list_files` → `get_file`) and map it onto the tokens and primitives in `docs/plans/F10-design-system.md`. No copy-paste.

> The iOS constraints in F10 (16px minimum input font-size, safe-area insets, 44pt tap targets, `100dvh`) **win** over any conflicting design output. Everything else follows the design.

---

## The prompt (paste this into Claude Design)

I'm building a personal expense-tracking web app called **Expense Tracking** (expensetracking.online). I need a small, coherent design system for it. Design **mobile-first for an iPhone XS Max — 414 × 896 CSS px, notch at the top, home indicator at the bottom.** It is a phone app that happens to run in Safari. Desktop only needs to not look broken: centre the mobile column on a wide viewport.

**Who it's for:** one person — me — tracking everything I spend in Indonesian Rupiah. Outdoor food and snacks, motorbike petrol, internet and utility bills, quarterly building maintenance fees, monthly apartment rent, convenience-store runs.

**The single most important thing: simplicity.** I am a simple guy and I love simple things. This should feel calm, quick and obvious — not like a fintech dashboard, not gamified, not covered in gradients and glassmorphism, and not another generic AI-looking app. Restrained and confident. Every element earns its place. If you're deciding between adding something and leaving it out, leave it out.

**The signature interaction** — this is what makes the app worth building: instead of filling in a form, I paste messy free text and an LLM turns it into a clean table. A real paste looks like:

```
bakar duit tuesday - 18/8/2026
roti buaya 38500
ayam sambal hitam 45k
perumahan laddaland 49k
kungfu soccer 49k
fan fries plaza blok m 58850
pak gembus 26k
```

That becomes one expense group titled "bakar duit tuesday", dated 18 Aug 2026, with 6 line items totalling Rp 266.350. I can also attach photos to a group — food, movie tickets, screenshots of QR payment confirmations — so I can browse them later.

### Money is the hero

Amounts are the most important content on almost every screen. Rupiah is formatted `Rp 266.350` — dots as thousands separators, no decimals, and the numbers get long. Please:
- Pick a typeface with genuinely good **tabular figures** so amounts line up in a column
- Give me a clear typographic hierarchy for money: the huge month total, the medium per-expense total, the small per-item amount
- Design the month total as the biggest thing on the home screen

### Screens to design

1. **Sign in** — a nearly empty screen: app name, one line of purpose, one "Continue with Google" button. Nothing else.
2. **Month view (home)** — sticky header with month name in Indonesian ("Agustus 2026"), previous/next month chevrons, and the month total as the hero number. Below it, expense groups newest-first, sub-grouped under day headings ("Selasa, 18 Agustus"). Each row: title, total on the right, item count, and a small badge when photos are attached. Design the empty state too.
3. **Add expense** — the signature flow, all on one page in three stages: (a) a big autofocus textarea with the example above as placeholder and one primary button "Rapikan"; (b) a loading state while the LLM works — please design a **skeleton of the table it's about to produce**, not a spinner; (c) the editable result: title, date, one row per item with name / amount / category chip, a delete affordance per row, "+ Tambah item", a live running total, a photo picker strip, and a full-width "Simpan" button.
4. **Expense detail** — the same items but now read-and-edit, plus a photo gallery grid, a share button, and a destructive delete.
5. **Statistics** — a 12-month bar chart of monthly totals, a month-over-month change tile, and a category breakdown for the selected month across 8 categories.
6. **Public shared view** — what a friend sees when I send them a link over WhatsApp. Read-only, no navigation, no edit controls, no sign-in prompt. Just the expense, its items, the total and the photos, plus a quiet footer line.

### Components I need

`Button` (primary / secondary / ghost / destructive, plus a loading state and a full-width variant) · `Card` · **`Sheet`** — a bottom sheet, this is the most-reused interactive piece, used for picking a category and editing an item · `Chip` for a category · `CategoryPicker` — a 2×4 grid inside a sheet · `Field` — labelled input with error text · `MoneyInput` · `Money` (read-only amount) · `EmptyState` · `Toast` (for an undo action) · `TabBar` — a 3-tab bottom bar: **Bulan Ini** / **Tambah** (centre, raised) / **Statistik** · list rows for expense groups and for line items · a photo thumbnail grid and a full-screen photo lightbox · the LLM loading skeleton.

### The 8 categories

They need distinct colours that stay legible and distinguishable from each other in **both light and dark mode**, and that also work as chart series colours. Give each an emoji or simple icon:

| key | Indonesian label | what it covers |
|---|---|---|
| `food` | Makan & Jajan | warung, restaurants, coffee, snacks |
| `groceries` | Belanja Harian | Indomeret, Alfamart, supermarket |
| `transport` | Transport | petrol, parking, tolls, ride-hailing |
| `bills` | Tagihan | internet, electricity, phone credit, building fees |
| `housing` | Tempat Tinggal | apartment rent, boarding, service charge |
| `entertainment` | Hiburan | cinema, games, streaming subscriptions |
| `health` | Kesehatan | medicine, doctor, vitamins |
| `other` | Lainnya | everything else |

### Constraints you must respect

- **Light and dark mode**, driven by the system setting. Define every colour token in both — never define a colour only inside a dark-mode block.
- **Safe areas**: fixed headers and the bottom tab bar must account for the notch and home indicator.
- **Every input at 16px minimum font-size** — Safari zooms the whole page when you focus a smaller one, and it's jarring.
- **Minimum 44 × 44pt tap targets.**
- Colour must never be the only thing carrying meaning — categories need a label or icon alongside the colour.
- Keep the shadow and border-radius vocabulary tiny. Two or three steps, not eight.

### Deliver

A token set (colour, type scale, spacing, radii, shadows) plus previews of each component in its states, and the six screens assembled from those components. Show light and dark side by side where it matters. Please give each preview a short note on the reasoning behind the choice — I'd rather understand the system than just receive it.
