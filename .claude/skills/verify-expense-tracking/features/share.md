# Public share link for an expense

## Sub-features

- "Bagikan" on `/e/<id>` mints the group's `/s/<token>` link (`createShareLink`), or returns the
  existing one: `share_links.group_id` is unique, so re-sharing never changes the URL.
- No `navigator.share` → clipboard ("Tersalin") → manual-copy sheet ("Salin tautannya sendiri").
- With a link active, the detail page shows "Tautan Publik" and "Batalkan tautan"; revoking
  ("Ya, batalkan") deletes the token, toasts "Tautan dibatalkan", and the old URL dies for good.
- `/s/<token>` renders signed out: title, date, note, items, total, "Dibagikan lewat
  expensetracking.online"; `noindex` and `no-store` headers.

## How to get to it (user POV)

Open an expense, tap the share icon at the top right; send the copied link to a friend.

## Driving it with verify.sh

```sh
$V ui RUN $S/share.mjs -- demoGroup005
T=$($V sql RUN --value "select token from share_links where group_id = 'demoGroup005'")
$V api RUN --anon GET "/s/$T"
```

End state: transcript `share: copied ("Tersalin")`, `panel: "Tautan Publik" with "Batalkan tautan"`,
`result: PASS`. Signed out: `200`, `dinner ulang tahun · Expense Tracking`, the date, the note,
three items, `Total Rp 363.000`, `Dibagikan lewat expensetracking.online`.

Idempotence: run `share.mjs -- demoGroup005` again, then
`$V sql RUN --value "select count(*)||' '||max(token) from share_links where group_id = 'demoGroup005'"`:
still `1` and the same token.

```sh
$V ui RUN $S/revoke.mjs -- demoGroup005
$V api RUN --anon GET "/s/$T"
```

End state: `revoked: toast shown, panel gone after reload`, `result: PASS`; the old link answers
`404`.

## Gotchas

- `T` is a shell variable: in a zsh recipe quote the path (`"/s/$T"`).
- The manual-copy sheet's heading is always in the DOM, hidden; wait on visible elements only.
- Revoking is one-shot per link: share again to get a fresh token for later journeys.
