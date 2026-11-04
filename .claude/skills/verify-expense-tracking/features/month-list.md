# Month list and navigation

## Sub-features

- `/` redirects a signed-in user to `/m/<this month>` (Jakarta).
- `/m/<YYYY-MM>`: the month total, `N catatan · M item`, day headers (`Rabu, 4 November 2026`),
  one row per expense (title, item count, amount) linking to `/e/<id>`.
- "Bulan sebelumnya" / next steps through months; an empty month shows "Belum ada catatan".
- Tab bar: "Bulan Ini", "+ Tambah", "Simpulan"; the fullscreen toggle ("Mode layar penuh").

## How to get to it (user POV)

Open the app signed in; it lands on this month. Tap the arrow beside the month to go back.

## Driving it with verify.sh

```sh
$V api RUN GET /m/2026-11            # use the current month
```

End state (measured 2026-11-04): `200`, `November 2026`, `Rp 237.000`, `4 catatan · 8 item`,
rows from `makan siang kantor 2 item Rp 37.000` (Rabu, 4 November 2026) down to `jajan sore`
(Minggu, 1 November 2026). The numbers move with the date: the seed is relative to today.

```sh
$V ui RUN $S/month.mjs -- 2026-11 'token listrik'
```

End state: transcript lines `2026-11: N catatan · M item`, `/m/2026-10: 8 catatan · 16 item`
(on 2026-11-04), `opened /e/demoGroup011`, `result: PASS`.

```sh
$V api RUN --as newcomer GET /m/2026-11
$V api RUN GET /
```

End state: `Rp 0`, `0 catatan · 0 item`, `Belum ada catatan`; and `307 -> http://localhost:PORT/m/<month>`.

## Gotchas

- Counts depend on the day of the month the run starts on: on the 1st, "this month" holds only
  `demoGroup001`. Read the expected numbers from the page you get, and assert relations (a group
  you added appears, a group you deleted is gone), not the 2026-11-04 figures.
- The month page shows "Memuat catatan…" (its loading screen) in the text view first; the real
  list follows in the same response.
