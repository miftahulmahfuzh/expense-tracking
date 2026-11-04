# Sign-in gate and per-user ownership

## Sub-features

- `/` is the sign-in page ("Lanjut dengan Google"); signed in, it redirects to this month.
- `proxy.ts` sends signed-out visitors of `/new`, `/m/*`, `/e/*`, `/stats` to `/?next=<path>`.
- Every query scopes by the session's user id: another user's `/e/<id>` is "Tidak ditemukan".
- `/api/parse` answers 401 signed out; `/api/photos/upload` answers 400 "Not authenticated" signed
  out and 400 "Expense group not found" for someone else's group.
- `/s/<token>` and `/f/<token>` stay public (never matched by the proxy).

## How to get to it (user POV)

Open the app signed out; open a link to someone else's expense.

## Driving it with verify.sh

```sh
$V ui RUN $S/signin.mjs --anon             # or: -- /new
$V api RUN --anon GET /m/2026-11
$V api RUN --anon GET /
```

End state: `landed on /?next=%2Fstats`, `result: PASS`, `-1-signin.png` with the wordmark and
"Lanjut dengan Google"; `307 -> http://localhost:PORT/?next=%2Fm%2F2026-11`; `/` answers `200`
with `Catat Sekali Tempel`, `G Lanjut dengan Google`.

```sh
$V api RUN GET /e/strangerG001
grep -c 'rahasia stranger\|barang stranger' <the .html it saved>
$V api RUN --as stranger GET /e/strangerG001
$V parse RUN --anon "kopi 20"
```

End state: as `demo`, `Tidak ditemukan · Expense Tracking` and `0` matches for the stranger's
title and item in the HTML; as `stranger`, the expense renders (`rahasia stranger`,
`barang stranger Rp 999.000`); signed out, `/api/parse` answers `401` with
`"code": "unauthorized"`.

## Gotchas

- `/e/<foreign id>` answers HTTP 200: the loading screen streams before `notFound()` runs. Assert
  the not-found title and the absence of data, not the status.
- Pressing "Lanjut dengan Google" would leave the fence (Google is blocked in the browser and on
  the server); no journey presses it.
- Sessions are JWTs minted per run and valid for a day; `AUTH_SECRET` is random per run, so a
  cookie from one run is rejected by another.
