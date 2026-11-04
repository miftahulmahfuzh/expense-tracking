# Add an expense by pasting a note

## Sub-features

- `/new`: one textarea; "Rapikan" sends the paste to `POST /api/parse` (z.ai, forced tool call,
  one repair round-trip at most), "Isi Manual" skips the model.
- Shorthand: `18k` and a bare small number (`kopi susu 25`) both mean thousands (b110a9d).
- Categories come from the closed list in `lib/categories.ts`; the model picks one per item.
- Review stage: editable title (with presets), date, items, photos, note; "Simpan" calls the
  `createExpense` server action (group + items in one `db.batch()`) and lands on `/e/<id>`.
- Failure path: when the model fails or is refused, the parser falls back to a regex parser and
  answers `source: "fallback", degraded: true` (every item `other`).
- `/api/parse` refuses signed-out callers (401) and bursts over 10 a minute (429).

## How to get to it (user POV)

Tap the red "+" (Tambah) in the tab bar, paste the shopping note, tap "Rapikan", check the rows,
tap "Simpan".

## Driving it with verify.sh

```sh
$V parse RUN "jajan sabtu
kopi susu 25
nasi goreng 18k
parkir 5000"
```

End state (measured): `200`, `"source": "llm"`, `"degraded": false`, title `jajan sabtu`,
`occurred_on` = Jakarta today, items `kopi susu 25000 drinks`, `nasi goreng 18000 meals`,
`parkir 5000 parking`. `$V budget RUN` shows one more call spent.

```sh
$V ui RUN $S/add-expense.mjs                 # or: -- "your own paste"
$V sql RUN "select g.id, g.title, g.occurred_on, i.name, i.amount_idr, i.category from expense_groups g join expense_items i on i.group_id = g.id where g.title = 'jajan verify' order by i.sort_order"
```

End state: the transcript ends `saved /e/<id>` and `result: PASS`; `-3-saved.png` shows the detail
page with the three rows and `Total Rp 48.000`. The SQL returns three rows for one new group:
`kopi susu 25000 drinks`, `nasi goreng 18000 meals`, `parkir 5000 parking`, `occurred_on` today.

Failure path, on an `up --offline` run (or a spent budget):

```sh
$V parse RUN "jajan offline
kopi susu 25
nasi goreng 18k"
$V logs RUN REFUSED 5
```

End state: `200`, `"source": "fallback"`, `"degraded": true`, amounts 25000 and 18000, both
`category: "other"`; the log shows `et-verify: paid call REFUSED POST https://api.z.ai/api/anthropic/v1/messages`.

## Gotchas

- Each parse is a real, paid call. The default budget (10) covers this file several times over;
  do not loop it.
- The model's category choices can vary run to run; assert they are in `lib/categories.ts`'s list
  and that amounts are exact. Amounts are the regression that matters (the 1000× money bug).
- The review screen's draft is kept in the browser's storage; a second run of the steps file in
  the same browser profile would restore it, but every `ui` call starts a fresh context.
- Photos staged on `/new` before "Simpan" are not covered here; `photos.md` drives photos on a
  saved expense.
