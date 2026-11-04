---
name: verify-expense-tracking
description: Prove an Expense Tracking change works by driving a real, throwaway copy of it (Next dev server on its own loopback port, signed in as seeded users, its own local Postgres behind a Neon-protocol stand-in, a local Vercel Blob stand-in, the real z.ai parser and /stats summary under a per-run call budget) and capturing evidence. Use before reporting any app/, components/ or lib/ change as done, when a plan's Proof section names feature-map entries, when a verifier must confirm another agent's work, or to reproduce a bug on main. Never touches the production Neon database, the production Blob store, Google sign-in, Vercel, GitHub workflows or the owner's dev server on :3000.
---

# verify-expense-tracking

"Tests pass" is not proof (vitest runs on `environment: 'node'` against a fake Neon client and
never calls a model; CI says the same about itself). Proof is the code under test, running, doing
what the user does, with the action and the resulting state saved as evidence a reviewer can open.
Everything goes through one script, run from the checkout (or worktree) being verified:

```sh
V=.claude/skills/verify-expense-tracking/scripts/verify.sh
$V            # usage
```

The script is bash (shebang), so the zsh the Bash tool may run does not matter. Never hand-write
launch sequences, never `npm run dev` for verification (`.env.local` is production), and never
`pkill node` / `pkill -f "next dev"`: the owner's dev server and other runs look the same.

## Launch

```sh
$V up              # RUN= URL= EVIDENCE= MODE=   (~35 s; first route compiles add a few s each)
$V up --llm=20     # a bigger z.ai budget (default 10 calls)
$V up --offline    # no paid call leaves; every z.ai call is refused (plumbing only, NOT proof)
```

What a run is:

- **Postgres**: database `v_<run>` in the Docker container `expense-tracking-pg-verify`
  (`postgres:16`, 127.0.0.1:55440, created on first use, left running). `up` applies every
  `drizzle/*.sql` in `meta/_journal.json` order, each file in one transaction, recorded in
  `drizzle.__drizzle_migrations` (drizzle-kit cannot reach a local Postgres: the app ships only
  Neon's HTTP driver).
- **Stand-in** (`scripts/standin.mjs`): Neon's HTTP `/sql` protocol (single queries and the
  `db.batch()` transactions) in front of that database; the Vercel Blob API (`put`, `del`, `head`,
  `list`, `copy`, and the browser's client-token PUT with its signature, size cap, content types,
  random suffix and expiry enforced); the stored blobs' bytes; the paid-call budget. Plain HTTP on
  one port for the server, HTTPS + HTTP/2 on a second for the browser (see Gotchas).
  `scripts/preload.mjs` (in every Node process via `NODE_OPTIONS`) routes `neon()`'s fetches and
  the fake store's `https://etverifystore0000.public.blob.vercel-storage.com/...` URLs to it. No
  app code changes.
- **App**: a snapshot of the checkout (rsync without `.env*`, `.vercel`, `.git`, `docs`, `.next`;
  `node_modules` hard-linked) served by its own `next dev` on a free loopback port, never 3000. A
  snapshot because Next 16 locks `.next/dev` per project directory. `up` returns once the demo
  user's `/m/<this month>` renders its seeded expenses.
- **Users** (`scripts/seed.py`, raw rows only, dated relative to today in Asia/Jakarta):
  - `demo` (Demo Verify): 16 expenses over the last ~70 days, ids `demoGroup001` (today) to
    `demoGroup016` (oldest). `demoGroup005` "dinner ulang tahun" carries a note with a URL.
  - `stranger`: one expense, `strangerG001` "rahasia stranger" — the target of every ownership check.
  - `newcomer`: no expenses (the empty month and empty /stats).
- **Sessions**: one JWT cookie per user, minted with Auth.js's own `encode` and the run's random
  `AUTH_SECRET` (`auth.config.ts` uses `strategy: 'jwt'`; the salt is the cookie name). The app
  decrypts it like any other; nothing is bypassed.
- **Env**: the server starts from `env -i` with only the run's values. `AUTH_URL` is the run's
  own `http://localhost:PORT`, so share links point at the run.
- **Tools**: Playwright 1.62.1 and `pg` live in `~/.local/state/expense-tracking-verify/.tools`,
  installed by the first `up` (npm registry, once). The repo's `package.json` is untouched.

Runs are isolated: parallel verifiers each `up` their own. Measured 2026-11-04: two runs up at
once, an item added through the UI in one, absent from the other's database.

## Doctor

```sh
$V doctor RUN
```

Read-only. Checks the stand-in, that `next` is alive and owns its port (process group, not a
name), who holds :3000 (reported, never touched), that each seeded user's `/m/<month>` answers 200
signed in, the database counts, the run's blobs, mode and budget, and the egress fence: from a
process with the server's exact env and preload, GitHub, a foreign Blob store, Neon's console,
Google, Vercel and an `https.request` must all be `blocked`, and the fake store must answer 404 from
the stand-in. Then the hosts blocked and paid calls refused so far. Run it before the first drive
and after any surprise.

- `code WARN HEAD moved` / `working tree changed since up`: the snapshot is stale. `down` + `up`.
- `budget SEEDING`: `up` died before arming; `down` it.
- `egress N paid call REFUSED ...`: calls the budget refused (spent, or `--offline`).

## Drive

| Surface | Command | Notes |
| --- | --- | --- |
| Web page (text) | `$V api RUN [--as USER\|--anon] GET /path` | HTML saved whole; the visible text (aria-labels as `[label]`) printed. |
| HTTP route | `$V api RUN [--as USER\|--anon] POST /api/... '{json}'` | Cookie + same-origin `Origin`. Status and body out. |
| Parser | `$V parse RUN [--as USER\|--anon] "pasted text"` | `POST /api/parse` exactly as /new's Rapikan sends it (`todayISO` = Jakarta today). 1 z.ai call. |
| Browser | `$V ui RUN steps.mjs [--as USER\|--anon] [--width 390] [--theme light] [-- ARG...]` | Playwright, fenced network, Asia/Jakarta, video + screenshots. |
| State | `$V sql RUN [--value] "select ..."` | Read-only transaction; writes are refused. `--value`: one bare cell for recipes. |
| Blobs | `$V blobs RUN [photos/]` | The run's stand-in store. |
| Server log | `$V logs RUN [REGEX] [N]` | Matching `next.log` lines (default: errors, refusals, blocks). |
| Budget | `$V budget RUN` | z.ai calls spent / left / refused, and the last ones made. |
| Log | `$V note RUN "what this proved"` | Appends to `evidence/LOG.md`. |

Users for `--as`: `demo` (default), `stranger`, `newcomer`. Server actions (`createExpense`,
`addItem`, `attachPhoto`, `createShareLink`, ...) have no stable URL, so writes go through `ui`.

A steps file (the ones in `features/steps/` run as they are; put ad-hoc ones in the scratchpad):

```js
const steps = async ({ page, base, shot, log, fixture, allow, args }) => {
  await page.goto(`${base}/e/${args[0]}`, { waitUntil: 'networkidle' }) // let it hydrate
  await page.getByRole('button', { name: 'Bagikan', exact: true }).click()
  await page.getByText('Tersalin', { exact: true }).waitFor()
  await shot('shared')
  log('copied')
}
export default steps
```

`fixture('receipt.jpg')` is `features/fixtures/receipt.jpg` (600×800 JPEG, 19.6 KB). `allow(/re/)`
admits a console error the journey causes on purpose. Use roles and labels:
`grep -rhoE 'aria-label="[^"]+"' app components | sort -u`, and the copy files
(`app/(bare)/new/copy.ts`, `app/(bare)/e/[id]/copy.ts`, `components/share/copy.ts`). The UI is
Indonesian on purpose. Never coordinates. `ui` fails on a console error, a page error, a signed-in
drive ending on the sign-in screen ("Lanjut dengan Google"), or horizontal scroll.

Examples, one per surface:

```sh
$V api RUN GET /m/2026-11                         # "November 2026 ... 4 catatan · 8 item ... makan siang kantor"
$V parse RUN "jajan sabtu
kopi susu 25
nasi goreng 18k"                                  # "source": "llm", kopi susu 25000 drinks
$V ui RUN .claude/skills/verify-expense-tracking/features/steps/add-expense.mjs     # saved /e/<id>
$V sql RUN "select title, occurred_on from expense_groups order by created_at desc limit 3"
$V blobs RUN photos/
```

## Targeted, not exhaustive

z.ai is the product's input path (Rapikan turns a pasted note into items) and the /stats summary,
so it is real by default, under a per-run budget of **10 calls** (`--llm=N` to change). Every
fetch to the configured `LLM_BASE_URL` host takes one call from the stand-in; an empty budget makes
the fetch fail like a vendor outage, and the app shows its own failure state (the parser falls
back to its regex parser with `degraded: true`; /stats shows no summary). Pick the feature-map
entries the change touches; the index lists what each journey spends. Measured 2026-11-04:

| Journey | z.ai calls |
| --- | --- |
| `up` (seeding is plain SQL) | 0 |
| `parse` / Rapikan on /new | 1 (2 if the repair round-trip fires) |
| /stats for a user whose data or week moved since the last summary | 1 |
| /stats re-view, unchanged data | 0 |
| /stats for `newcomer` (no expenses) | 0 |
| everything else (month list, detail, edit, photos, share, delete) | 0 |

The counter sees fetches: the SDK has `maxRetries: 0`, so one logical call is one fetch. Never
raise the budget to make a journey pass; a journey that needs more calls than the table says is a
finding.

## Evidence

Everything lands in `~/.local/state/expense-tracking-verify/<RUN>/evidence/`, numbered in drive
order: `NN-api-*.txt` (+ `.html`), `NN-sql-*.txt`, `NN-blobs-*.txt`, `NN-logs-*.txt`,
`NN-ui-*.{txt,png,webm}`, `LOG.md`, and after `down`: `zz-next.log`, `zz-standin.log` (every SQL
statement, blob write and paid call), `zz-seed.sql`, `zz-migrate.log`, `zz-budget.json`, `zz-meta`.

Proof standards:

- Drive the real user path: the page, button or route the user touches, not a lib function or a
  test hook. Writes go through the app (`ui`, `api`, `parse`). `sql` only reads.
- Capture the action AND the resulting state. A "Simpan" that lands on `/e/<id>` is not proof the
  items are right: read the rows back with `sql`, and re-render the page that shows them.
- For a bug fix, show the failure first (a run from `main`, or before the fix), then the pass.
- LLM output is nondeterministic: assert on structure (`source`, `degraded`, item count, amounts,
  categories from the closed list, the `expense_insights` row and its keys, the budget counter) and
  quote text only as support. One miss earns one re-run; two misses are a finding.
- **Read the PNGs.** A green `ui` exit only means nothing threw.
- A step you could not drive is `inconclusive` with its reason. Never weaken a journey to make it
  pass. A `MODE=offline` run is not proof of anything that needs a model.

The report you hand back lists the evidence files that prove each claim, one line each.

## Cleanup

```sh
$V down RUN       # kills exactly the process groups up started, drops v_<run>, deletes the snapshot and blobs
$V down --all     # every run still up
$V ls             # runs, state, mode, evidence count
```

Evidence survives `down`. Run `down` after every run, failed ones included. The container
`expense-tracking-pg-verify` stays up for the next run; it holds nothing but `v_*` databases.

## Feature map

`features/README.md` indexes what the app does and what proves each feature works, one file per
feature. A plan's **Proof** section names entries from it. A change that adds or alters a
user-facing feature updates its entry in the same change. A journey that fails because the app is
wrong is a product bug: report it, do not edit the entry to match.

## Gotchas

- **Never driven, no flag turns them on (harmful):**
  - The production Neon database. `.env.local`'s `DATABASE_URL` is production; the snapshot has no
    `.env*`, the server env never holds that URL (only `pg.etverify.invalid`, which the preload
    routes to the stand-in), and the preload refuses every other host, Neon's included.
  - The production Blob store (`photos/`). `BLOB_READ_WRITE_TOKEN` is a per-run fake for the store
    id `etverifystore0000`; `VERCEL_OIDC_TOKEN` and `BLOB_STORE_ID` (which the Blob SDK prefers over
    the token, and `.env.local` holds the first) are never in the env; any other
    `*.public.blob.vercel-storage.com` host is refused by the preload and aborted by the browser.
  - Google sign-in (`AUTH_GOOGLE_*` are placeholders; sessions are minted; `signin.mjs` never
    presses the button), Vercel (no `.vercel` link, no `VERCEL_*`), GitHub (the only workflow is
    `ci.yml`; nothing here dispatches it).
  - The repo's ops scripts: `npm run db:migrate|db:push|db:studio|db:smoke`, `blob:usage`,
    `blob:sweep`, `scripts/vercel-env-push.sh`, `npm run test:live`. They load `.env.local`
    (production) or write Vercel's env; a verify run never calls them.
  - The owner's dev server. CLAUDE.md pins no port, so the owner's `npm run dev` takes Next's
    default 3000. Decided 2026-11-04: the free-port picker refuses 3000, `up` never stops or reuses
    whatever holds it, `doctor` only reports who does, and every run is tracked by process group.
  - No part of the app messages a person (no email, push, chat or bot), so there is no sink to fake.
- **Decided here, because the code cannot say (2026-11-04, nobody to ask):** z.ai is the product's
  input path, so it is real by default at 10 calls (a full pass over the feature map spends 4); the seed is raw
  SQL rather than parses, because a seed through Rapikan would spend a call per expense and the
  rows it writes are plain data the app does not derive; Playwright and `pg` are installed into the
  harness's own tool dir instead of the repo's `package.json`, because the run was limited to
  committing the paths it created.
- **The browser uploads over HTTP/2.** `@vercel/blob/client`'s `upload()` streams its PUT body, and
  Chromium sends a streamed request body only over HTTP/2; against a plain HTTP/1.1 stand-in every
  PUT failed with `net::ERR_ALPN_NEGOTIATION_FAILED` while the token step answered 200. So
  `NEXT_PUBLIC_VERCEL_BLOB_API_URL` (inlined into the client bundle) points at the stand-in's
  HTTPS + h2 listener, with a per-run self-signed certificate that only the run's Playwright context
  accepts (`ignoreHTTPSErrors`). The server keeps `VERCEL_BLOB_API_URL` on plain HTTP.
- **Clipboard writes succeed headless.** No permission is granted, yet Chromium lets a focused page
  write the clipboard, so "Bagikan" ends on the "Tersalin" toast and "Bagikan foto" on "Tautan
  disalin", not on the manual-copy fallbacks. Read the minted token back with `sql --value`. The
  manual-copy paths ("Salin tautannya sendiri", "Salin manual") are not driven.
- **A missing expense answers 200.** `/e/<someone else's id>` streams its `loading.tsx` first, so
  `notFound()` arrives after the status line: assert the "Tidak ditemukan" title and the absence of
  the other user's data, not the status. `/s/<token>` and `/f/<token>` have no loading screen and
  answer a real 404.
- **The Blob completion webhook never fires** (Vercel cannot call a laptop; `route.ts` says so).
  `attachPhoto` from the browser is the writer, which is what production relies on too.
- **Egress control is best effort.** The preload wraps `globalThis.fetch` (Next wraps it later, so
  the guard stays underneath) and `node:http(s)`'s `request`/`get`. `@vercel/blob`'s server calls go
  through undici's own dispatcher, which neither sees, but only ever to `VERCEL_BLOB_API_URL` (the
  stand-in). A native addon or a raw `net.connect` would slip past. The server has no dead proxy:
  Turbopack fetches Archivo for `next/font/google` in Rust, and the font CDN is allowlisted.
- `next.log` noise that is not a finding: `egress BLOCKED GET https://registry.npmjs.org/-/package/next/dist-tags`
  (Next dev's version check), once per run.
- The insight row's freshness is two keys plus a 60 s cooldown (`lib/insights/freshness.ts`): after
  an edit, a /stats view within 60 s of the last summary serves the old text marked stale (0 calls);
  after 60 s it regenerates (1 call).
- `/api/parse` allows 10 calls a minute per user (in-memory). A recipe loop that parses faster gets
  `429 rate_limited`; that is the app, not the budget.
- The snapshot does not follow your edits. `down` + `up` after changing the app.
- The first hit on each route compiles it (3-15 s once). Steps use `waitUntil: 'networkidle'`
  before clicking: a click before hydration is silently dropped (React 19).
- The engines field asks for Node 24; this machine runs Node 22.23 and the app serves fine on it.
- Seed users' emails are `<user>@et-verify.invalid`; nothing real sits in a run.
