# Feature map: Expense Tracking

What the app does, and what proves each feature works. One file per feature, each with the same
four sections. Steps files the recipes run live in `steps/`; the photo fixture in `fixtures/`.

| Feature | File | Surfaces | z.ai calls |
| --- | --- | --- | --- |
| Add an expense by pasting a note (Rapikan → review → Simpan) | [add-expense.md](add-expense.md) | `parse`, `ui`, `sql` | 1 per parse |
| Month list and navigation | [month-list.md](month-list.md) | `api`, `ui` | 0 |
| Expense detail: items, note, delete | [expense-detail.md](expense-detail.md) | `api`, `ui`, `sql`, `blobs` | 0 |
| Photos: upload, lightbox, public photo link | [photos.md](photos.md) | `ui`, `api --anon`, `sql`, `blobs` | 0 |
| Public share link for an expense (`/s/<token>`) | [share.md](share.md) | `ui`, `api --anon`, `sql` | 0 |
| Simpulan (`/stats`): totals, chart, categories, written summary | [stats.md](stats.md) | `api`, `ui`, `sql`, `budget` | 0-1 per view |
| Sign-in gate and per-user ownership | [auth.md](auth.md) | `api --anon/--as`, `ui --anon` | 0 |

Recipes use `V=.claude/skills/verify-expense-tracking/scripts/verify.sh`, `S=.claude/skills/verify-expense-tracking/features/steps`
and `RUN` from `$V up`. Seeded ids: `demoGroup001` (today) .. `demoGroup016`, `strangerG001`.
A full pass over every entry spends 3 z.ai calls (4 with the stats cooldown journey), measured 2026-11-04.
