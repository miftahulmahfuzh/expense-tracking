# F01 — Deployment runbook (Tasks 26–33)

The local half of F01 is done, verified and committed. What remains needs an interactive
browser login (Vercel) and a control-panel session (Domainesia), so it is written here as
a runbook you execute rather than as automation.

**State when this was written:**

- 4 F01 commits on `main`, **not yet pushed**. `origin` is
  `git@github.com:miftahulmahfuzh/expense-tracking.git`.
- Vercel CLI **59.1.4** installed globally. Not logged in, project not linked.
- `expensetracking.online` already delegates to `ns1.domainesia.net` / `ns2.domainesia.net`
  — the precondition for Task 31 is satisfied.
- No `A` record on the apex and no `CNAME` on `www` yet, so there is **nothing to delete**;
  the zone is a clean slate.
- `.env.local` holds all 8 credentials. Nothing is a placeholder.

---

## Step 1 — Log in and link the project

```bash
cd /home/miftah/expense-tracking
vercel login          # opens a browser
vercel link
```

Answer the prompts:

| Prompt | Answer |
|---|---|
| Set up "~/expense-tracking"? | **yes** |
| Which scope should contain your project? | your personal account |
| Link to existing project? | **no** |
| What's your project's name? | `expense-tracking` |
| In which directory is your code located? | `./` |

Then confirm the runtime is Node 22 — it must match `engines.node` in `package.json`:

```bash
vercel project inspect expense-tracking 2>&1 | head -20
```

**Observed on the real project: `24.x`.** That satisfies `engines.node` (`>=22.0.0`) and
Node 24 has everything F01 §4 relies on Node 22 for — a global `WebSocket`, so the Neon
driver needs no `ws` polyfill. So this is not a blocker. It is still worth setting to
**22.x** in Project Settings → General, for one reason: local dev runs 22.23.1, and a
runtime-major gap between dev and production is exactly the kind of difference that
surfaces as a bug you cannot reproduce locally. One dropdown, and you get parity.

`.vercel/` is git-ignored. Do not commit it.

---

## Step 2 — Push the environment variables

**Do not use the loop in `F01-foundation.md` Task 27.** It is wrong in two independent
ways on Vercel CLI 59:

1. It pipes `cut -d= -f2-` straight into `vercel env add`, which keeps surrounding quotes.
   Three values in this repo's `.env.local` are quoted, so `LLM_BASE_URL` would be stored
   as `"https://api.z.ai/api/anthropic"` — quotes included — and the production build would
   then fail `lib/env.ts`'s `z.url()` check with a banner that reads like a *missing*
   variable rather than a malformed one.
2. `vercel env add KEY production preview` does **not** add one variable to two
   environments. The signature is `vercel env add name [environment]`, and the third
   positional is the *git branch* — so that command fails with ``Environment Variables
   with `gitBranch` can only be used with target=preview``. Each environment needs its own
   invocation. (The plan's note that "development cannot be combined with
   production/preview" understates it: *no* two environments can be combined.)

Use the script instead. It strips quotes, calls once per environment, passes values over
stdin rather than `--value` (argv is world-readable via `/proc`), uses `printf` so no
trailing newline is stored, passes `--force` so re-runs are idempotent, and prints names
and value lengths but never values:

```bash
./scripts/vercel-env-push.sh            # dry run — shows exactly what will be sent
./scripts/vercel-env-push.sh --apply    # actually pushes
```

Expected: 25 `vercel env add` calls — 8 variables × 3 environments, plus production-only
`AUTH_URL`.

Verify:

```bash
vercel env ls
```

You should see **25 rows**. No variable may appear in fewer than three environments except
`AUTH_URL`.

Five of them are pushed with `--sensitive` for production and preview, so they are stored
write-only — unreadable from the dashboard and from `vercel env pull`: `LLM_API_KEY`,
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`. No dashboard
step is needed. (F01's plan named only the first four; `AUTH_GOOGLE_SECRET` is an OAuth
client secret and there is no argument for treating it differently. Vercel accepts
`--sensitive` only for production and preview, so development is stored plain.)

> `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are F02's variables, but they already exist
> locally, so they are pushed now. A preview deploy with F02 merged and these absent fails
> at boot.

---

## Step 3 — Deploy preview, then production

```bash
vercel deploy                    # preview
```

> **The very first `vercel deploy` goes to production, not preview** — Vercel assigns a
> project's first deployment to production regardless of the flag, and says so in its
> output. Every later `vercel deploy` is a preview unless you pass `--prod`. So on a fresh
> project this step and the next collapse into one.

Probe it, substituting the URL the CLI prints:

```bash
curl -s https://<preview-url>/api/health; echo
```

**Expected:** `{"ok":true,"db":true,"commit":"<sha>"}`

Probe the **alias** (`https://<project>-<words>.vercel.app`), not the per-deployment
`https://<project>-<hash>-<scope>.vercel.app` URL. Deployment Protection guards the latter,
so `curl` gets `Redirecting...` there — which looks like a broken app but is authentication
working as intended.

*Confirmed on this project:* `{"ok":true,"db":true,"commit":"78b4f70…"}` — env vars resolve
and Neon is reachable from Vercel.

> The payload is deliberately smaller than `F01-foundation.md` Task 28 shows. Reconciliation
> **R-27** trimmed it: `db` is a boolean now, and the database name, LLM base URL, model and
> environment are gone — free reconnaissance for an unauthenticated caller, for no benefit.
> A consequence: the plan's verification check 12 greps for `"env":"production"`, which no
> longer exists. Confirm the environment with `vercel ls` instead.

If the build dies with the `INVALID CORE ENVIRONMENT` banner, a variable is missing from
that environment — the banner names it. That is the guard working.
If it builds but returns `{"ok":false}`, the preview `DATABASE_URL` is wrong:
`vercel env rm DATABASE_URL preview` and re-add.

Then production:

```bash
vercel deploy --prod
curl -s https://<production-url>/api/health; echo
```

---

## Step 4 — Attach the domain

The signature is `vercel domains add domain [project]`. Without the project argument the
domain is added to the **team** rather than attached to the project — and a subdomain is
refused outright with *"Only apex domains can be added without a project"*. Always pass the
project:

```bash
vercel domains add expensetracking.online expense-tracking
vercel domains add www.expensetracking.online expense-tracking
vercel domains inspect expensetracking.online
```

If the apex was already added bare (to the team), re-running it with the project attaches
it. Should that report a conflict, `--force` moves it off whatever it is attached to.

Read two values off that output (or Project → Settings → Domains). **Do not copy IPs out of
any document, including this one** — Vercel assigns the A record from an anycast pool and
the `www` CNAME target is per-project:

- `A_VALUE` — an IPv4 address (commonly `76.76.21.21`; newer projects get e.g. `216.198.79.1`)
- `CNAME_VALUE` — `<16-hex>.vercel-dns-0NN.com` (older projects: `cname.vercel-dns.com`)

*This project was issued `A 76.76.21.21` for the apex.* Get the `www` target from
`vercel domains inspect www.expensetracking.online` or the dashboard Domains page.

### Two warnings to expect here, both benign

Adding each domain prints **"This domain is not configured properly"**. That is the
expected state until Step 5 — the DNS records do not exist yet. It is a to-do, not a
failure.

`vercel domains inspect` also shows a nameserver mismatch:

```
Intended Nameservers    Current Nameservers
ns1.vercel-dns.com      ns1.domainesia.net     ✘
ns2.vercel-dns.com      ns2.domainesia.net     ✘
```

**Those two ✘ marks are permanent and correct — do not chase them.** Vercel's own output
offers two mutually exclusive paths: (a) set an `A` record at your existing DNS provider,
or (b) move the nameservers to Vercel. This project deliberately takes **(a)**, keeping DNS
at Domainesia, so "Current Nameservers" will read `domainesia` forever. Following the ✘ to
option (b) would hand the whole zone to Vercel and take every other record on the domain
with it. The signal that matters is the domain's **Configured / Valid Configuration**
status after the A and CNAME records land, not this table.

While on that screen: keep **`expensetracking.online`** as the primary domain and set
**`www.expensetracking.online` → Redirect → `expensetracking.online` (308 Permanent)**.
This is not cosmetic — `AUTH_URL` is pinned to the apex, so letting both origins serve the
app produces OAuth callback mismatches in F02.

---

## Step 5 — DNS at Domainesia

Client Area → **Domain** / My Domains → `expensetracking.online` → **Manage** → **DNS
Management** (on some accounts: **Addons** tab → *DNS Zone Manager* → Manage).

| # | Type | Name | Value | TTL |
|---|---|---|---|---|
| 1 | **A** | `@` (or blank) | `A_VALUE` from Step 4 | 3600 |
| 2 | **CNAME** | `www` | `CNAME_VALUE` from Step 4 (trailing dot if the panel wants an FQDN) | 3600 |
| 3 | **CAA** *(only if a CAA record already exists)* | `@` | `0 issue "letsencrypt.org"` | 3600 |

Why the apex cannot be a CNAME: a zone apex necessarily carries `SOA` and `NS` records, and
RFC 1034 forbids a `CNAME` alongside any other record at the same node. `www` is a
subdomain, so it can be — and should be — a `CNAME`, because Vercel can then re-point it on
failover or an IP-pool change without you touching DNS again. Do not point `www` at
`A_VALUE`.

Also remove any Domainesia web-forwarding or parking on the domain.

Verify (5–30 min; TTL 3600 is the cap):

```bash
node -e "const d=require('node:dns').promises;Promise.allSettled([d.resolve4('expensetracking.online'),d.resolveCname('www.expensetracking.online')]).then(([a,c])=>{console.log('A    :',a.status==='fulfilled'?a.value.join(', '):'(none)');console.log('CNAME:',c.status==='fulfilled'?c.value.join(', '):'(none)')})"
vercel domains inspect expensetracking.online     # wants: Configured ✅
```

Certificate issuance is automatic and lands a few minutes after that.

---

## Step 6 — Verify live, then hand Git the deploys

```bash
curl -sI https://expensetracking.online | head -3          # HTTP/2 200
curl -s  https://expensetracking.online/api/health; echo   # {"ok":true,"db":true,"commit":"<sha>"}
curl -sI https://www.expensetracking.online | head -5      # HTTP/2 308 + location: https://expensetracking.online/
```

A `200` on `www` instead of `308` means the redirect in Step 4 did not take.

Then push, so Vercel's Git integration takes over from CLI deploys (push to `main` →
production, any other branch → preview):

```bash
git push -u origin main
```

Connect the repo in Project → Settings → Git → Connect Git Repository →
`miftahulmahfuzh/expense-tracking`, then confirm a push builds:

```bash
git commit --allow-empty -m "chore(f01): trigger first git-integrated deployment"
git push
vercel ls expense-tracking | head -5     # a deployment with source `github`
```

---

## Open questions this runbook answers

- **Q1 (credentials)** — resolved. All 8 values are present in `.env.local`; nothing is a
  placeholder.
- **Q4 (Neon region)** — resolved favourably. The database is
  `ep-quiet-heart-azcoa9gb.c-3.**ap-southeast-1**.aws.neon.tech`, i.e. Singapore, the
  closest region to Jakarta. Set the Vercel function region to `sin1` (Project Settings →
  Functions) to match, or every query pays a cross-region round trip.
- **Q3 (`/api/health` exposure)** — settled by R-27, already implemented: the payload is
  `{ ok, db: boolean, commit }`. Keep the route. **F02 must exclude `/api/health` from
  `proxy.ts`'s matcher**, or the probe starts redirecting.
- **Q6 (Blob store)** — still open, and one minute of work while you are in the dashboard:
  Storage → Create → Blob → connect to `expense-tracking`. Doing it now means
  `BLOB_READ_WRITE_TOKEN` is already in all three environments when F06 starts.
