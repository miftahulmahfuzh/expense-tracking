# Simpulan (/stats)

## Sub-features

- Month switcher (`?m=YYYY-MM`, clamped to the chart window), the month total and the delta
  against the same days of the previous month ("Turun 96% dari ...", "vs 1–4 Okt 2026 (periode sama)").
- "4 bulan terakhir" bar chart with a "Lihat angka" table; "Rincian Kategori" with percentages;
  "Pengeluaran Terbesar".
- Three written summaries ("Simpulan Minggu Ini", "Simpulan Bulan Ini", "Simpulan 2 Bulan
  Terakhir") by z.ai over the last 62 days, stored in `expense_insights` with a `data_key`
  (the data changed) and a `scope_key` (the calendar moved). A view regenerates when either key
  moved and the last summary is over 60 s old; otherwise it serves the stored text (marked stale
  if a key moved). A failed call writes nothing and keeps the old text.
- Empty account: "Belum ada data" and no summary, no call.

## How to get to it (user POV)

Tap "Simpulan" in the tab bar.

## Driving it with verify.sh

```sh
$V budget RUN
$V api RUN GET /stats
$V budget RUN
$V sql RUN "select user_id, model, generated_at, data_key, scope_key, left(week_text, 80) from expense_insights"
```

End state (first view of a run): `200`, `Simpulan`, the month total, `Rincian Kategori` rows,
`Pengeluaran Terbesar`, and three paragraphs under the three headings, each quoting real items and
amounts from the seed. Budget `spent` +1. One `expense_insights` row for `et-verify-demo`,
`model glm-5.2`, `scope_key` like `2026-W45|2026-11`, `data_key` `<epoch ms>:<group count>`.

```sh
$V ui RUN $S/stats.mjs
$V budget RUN
```

End state: `result: PASS`, `-1-top.png` with the total and the 4-month chart, `-2-summary.png`
with the written summaries; budget unchanged (served from the row).

```sh
$V api RUN --as newcomer GET /stats
```

End state: `Rp 0`, `Belum ada pengeluaran`, `Belum ada data`, no summary headings; budget unchanged.

Cooldown (1 call): change the data (`$V ui RUN $S/edit-item.mjs -- demoGroup001 + 'kopi sore' 20000`),
view `/stats` within 60 s of the last summary (budget unchanged, same `generated_at`), wait past
60 s, view again (budget +1, new `generated_at` and `data_key`).

## Gotchas

- The summary text is the model's: assert the row, its keys, the budget delta and that the text
  names seeded items; quote it only as support.
- The seed is dated relative to today, so the week summary always has something to say; on a
  Monday "this week" holds only today's `demoGroup001`.
- `/stats` is the only page that spends on a plain view. A recipe that opens it for another
  reason (navigation, layout) spends a call if the data moved more than 60 s after the last one.
