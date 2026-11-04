# Expense detail: items, note, delete

## Sub-features

- `/e/<id>`: title (with "Preset judul"), date, items with category chips and per-row
  "Hapus <name>", "+ Tambah Item", Total, photos, the note ("Catatan").
- Item sheet: tapping a row opens "Ubah item" (Nama, Jumlah, category); "+ Tambah Item" opens a
  blank "Item baru" sheet every time (bb919b3). "Simpan" calls `updateItem` / `addItem`.
- Deleting a row shows "Item dihapus" with "Urungkan" for 7 s.
- The note renders read-only with URLs auto-linked (`target="_blank" rel="noopener noreferrer"`,
  F20); "Edit catatan" switches to the editor.
- "Hapus pengeluaran" → confirm "Hapus": items, photos, share links cascade, the group's blobs
  are deleted from the store, and the user lands on `/m/<month>`.

## How to get to it (user POV)

Tap an expense in the month list.

## Driving it with verify.sh

```sh
$V api RUN GET /e/demoGroup005
```

End state: `200`, `Detail`, three rows (`steak wagyu Rp 285.000`, `mocktail Rp 45.000`,
`service charge Rp 33.000`), `Total Rp 363.000`, `Foto 0 / 20`, and the note text
`lokasi: https://example.com/steak-house reservasi jam 7`. In the saved `.html`:
`grep -o '<a[^>]*href="https://example.com/steak-house"[^>]*>' <file>.html` finds
`target="_blank" rel="noopener noreferrer"`.

```sh
$V ui RUN $S/edit-item.mjs -- demoGroup004 'martabak manis' 41000
$V ui RUN $S/edit-item.mjs -- demoGroup004 + 'es kelapa' 15000
$V sql RUN "select name, amount_idr, category from expense_items where group_id = 'demoGroup004' order by sort_order"
```

End state: the first transcript reads `before: Total Rp 50.000`, `row: JJ Jajan martabak manis
Rp 41.000`, `after: Total Rp 53.000`; the second `row: LN Lainnya es kelapa Rp 15.000`,
`after: Total Rp 68.000` (run in this order). SQL: `martabak manis 41000 jajan`,
`cireng isi 12000 jajan`, `es kelapa 15000 other`. The add journey fails if "Item baru" opens
with a non-empty Nama.

```sh
$V ui RUN $S/delete-expense.mjs -- demoGroup002
$V sql RUN "select (select count(*) from expense_groups where id = 'demoGroup002') groups, (select count(*) from expense_items where group_id = 'demoGroup002') items"
```

End state: `deleted "bensin + parkir"; now on /m/<month>`, `result: PASS`; SQL `0 | 0`. With
photos attached first (`photos.md`), `$V blobs RUN` lists none of them afterwards and
`zz-standin.log` / `standin.log` has one `blob del photos/...` line per photo.

## Gotchas

- `demoGroup002` is consumed by the delete journey: run `photos.md` on it first if you want the
  blob deletion proven too, and pick another group for anything after.
- The Jumlah field has a "Kosongkan jumlah" clear button that also matches the label "Jumlah":
  address the field as `getByRole('textbox', { name: 'Jumlah' })`.
- Amounts are typed as plain digits (`41000`); the field formats them (`41.000`).
