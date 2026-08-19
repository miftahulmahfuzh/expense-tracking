# F01 — Foundation & Deployment

> **Plan status:** ready to execute. Every command and file in this document was validated
> against a real `create-next-app@16.3.1` scaffold on Node v22.23.1 / npm 12.0.1 before the
> plan was written. Where the observed behaviour differs from the "expected" docs, the plan
> says so.

**Depends on:** nothing. This is Wave 1.
**Unblocks:** F03 (data layer), F10 (design system), and via them everything else.
**Authoritative contract:** `ROADMAP_v0.1.0.md` §3 (pinned versions), §4 (shared contract).

---

## 0. What this feature owns

| Owns | Does **not** own |
|---|---|
| `package.json`, lockfile, all npm scripts | `lib/db/schema.ts`, `lib/db/queries.ts` (F03) |
| `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | `auth.ts`, `proxy.ts` (F02) |
| `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` | `lib/categories.ts`, `lib/format.ts` (F03) |
| `.gitignore`, `.env.example`, `.env.local` | `lib/llm/*` (F04) |
| `lib/env.ts` (all environment validation) | Tailwind `@theme` token *values* (F10) |
| `drizzle.config.ts` (config only, not the schema) | Any page beyond a placeholder `/` |
| `app/layout.tsx`, `app/globals.css` (skeleton only) | |
| `app/api/health/route.ts`, `scripts/db-smoke.mjs` | |
| Vercel project, env vars, domain, DNS | |

---

## 1. Preflight — what you must have on hand

Before starting, have these in a scratch buffer. Tasks 16 and 29 paste them verbatim.

| Value | Where it comes from | Known now? |
|---|---|---|
| `LLM_API_KEY` | z.ai console → API keys | **You must supply this.** See Open Questions Q1. |
| `LLM_BASE_URL` | fixed: `https://api.z.ai/api/anthropic` | ✅ from roadmap §3 |
| `LLM_MODEL` | fixed: `glm-5.2` | ✅ (see Open Questions Q2) |
| `DATABASE_URL` | Neon console → Connection string → **Pooled** (host contains `-pooler`) | **You must supply this.** |
| `DATABASE_URL_UNPOOLED` | Neon console → Connection string → toggle *Pooled connection* **off** | **You must supply this.** |
| `AUTH_SECRET` | generated in Task 16 | ✅ generated locally |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud Console — F02's walkthrough | ⚠️ already present in the repo's `.env.local`; see Q1 |
| `BLOB_READ_WRITE_TOKEN` | auto-injected by Vercel once a Blob store is linked — **F06** | ❌ not needed yet |
| Vercel account | https://vercel.com — Hobby plan | |
| Domainesia login | client area for `expensetracking.online` | |

> ⚠️ **Secrets discipline.** `.env.local` is git-ignored by Task 5 and must stay that way.
> Never paste a real key into `.env.example`, into this plan, or into a commit message.

---

## 2. Tasks

Each task is 2–5 minutes. Run them in order. Commit checkpoints are tasks in their own right.

---

### Task 1 — Verify the toolchain (2 min)

Next.js 16 requires **Node ≥ 20.9**; this plan is written and validated for **Node 22.x**,
which is also what Vercel's Node runtime defaults to.

```bash
cd /home/miftah/expense-tracking
node -v && npm -v && git --version && git config user.email
```

**Expected output** (versions may be newer, must not be older):

```
v22.23.1
12.0.1
git version 2.x.x
miftahul.mahfuzh@tuntun.co.id
```

If `node -v` prints `v20.x` or lower than `v20.9.0`, install Node 22 before continuing
(`nvm install 22 && nvm use 22`).

Confirm the repo is the empty, commit-less git repo this plan assumes:

```bash
git log --oneline 2>&1 | head -1; ls -A
```

**Expected output:**

```
fatal: your current branch 'main' does not have any commits yet
docs
ROADMAP_v0.1.0.md
```

---

### Task 2 — Scaffold Next.js 16.3.1 into a temp dir (4 min)

`create-next-app` **refuses to run in a directory that already contains a `.md` file**
(verified: it aborts with `The directory ... contains files that could conflict:
ROADMAP_v0.1.0.md`). So scaffold into `scaffold-tmp/` and move the files up.

Also note: with **npm 12**, `create-next-app` without `--skip-install` fails with
`npm error code EALLOWSCRIPTS` (npm 12 refuses `--allow-scripts` in project-scoped
installs). `--skip-install` avoids this entirely — we install from our own pinned
`package.json` in Task 4 anyway.

```bash
cd /home/miftah/expense-tracking
npx --yes create-next-app@16.3.1 scaffold-tmp \
  --ts --eslint --tailwind --app --no-src-dir \
  --import-alias "@/*" --use-npm --skip-install --yes
```

**Expected output** (last lines):

```
Initializing project with template: app-tw

Initialized a git repository.

Success! Created scaffold-tmp at /home/miftah/expense-tracking/scaffold-tmp
```

---

### Task 3 — Move the scaffold into the repo root (3 min)

Delete the parts we don't want (its own `.git`, the demo page, the Vercel demo SVGs, the
generated agent files), then move everything up. `find -exec mv` is used because it moves
dotfiles (`.gitignore`) correctly under both bash and zsh without `dotglob`/`setopt`.

**First, guard against a collision.** `mv scaffold-tmp/app .` when `./app` already exists
does **not** merge — it produces `./app/app`. Other planning sessions have already written
files into this repo, so assert the root is clear before moving:

```bash
cd /home/miftah/expense-tracking
for p in app package.json tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs; do
  [ -e "$p" ] && echo "CONFLICT: $p already exists — move it aside before continuing"
done; echo "guard done"
```

**Expected output:** `guard done` and nothing else. A `.gitignore` at the root is fine
(it gets overwritten and then rewritten authoritatively in Task 5); anything on the list
above is not — inspect it, and if it is a stub from another session, delete it, because
F01 owns all six.

```bash
cd /home/miftah/expense-tracking
rm -rf scaffold-tmp/.git scaffold-tmp/README.md scaffold-tmp/CLAUDE.md \
       scaffold-tmp/AGENTS.md scaffold-tmp/public \
       scaffold-tmp/app/page.tsx scaffold-tmp/app/layout.tsx \
       scaffold-tmp/app/globals.css scaffold-tmp/app/favicon.ico
find scaffold-tmp -mindepth 1 -maxdepth 1 -exec mv {} . \;
rmdir scaffold-tmp
ls -A
```

**Expected output:**

```
app
docs
eslint.config.mjs
.git
.gitignore
next.config.ts
next-env.d.ts
package.json
postcss.config.mjs
ROADMAP_v0.1.0.md
tsconfig.json
```

(Plus any `.env.local` / `.vercel` / editor files already present — those are expected and
are ignored by Task 5.)

`app/` is now an empty directory — Tasks 12–14 fill it.

> **Why delete `AGENTS.md` / `CLAUDE.md`?** `next dev` re-creates the managed
> `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md` on first run. Letting it
> generate itself (Task 24) keeps the file matched to the installed Next version instead
> of committing a stale copy now.

---

### Task 4 — Write the pinned `package.json` and install (5 min)

Replace the generated `package.json` wholesale. Every runtime dependency is pinned to the
**exact** version from roadmap §3 (no `^`, no `~`) so the lockfile is reproducible.

**File: `/home/miftah/expense-tracking/package.json`**

```json
{
  "name": "expense-tracking",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "lint:fix": "eslint --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "next typegen && tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:smoke": "node --env-file=.env.local scripts/db-smoke.mjs"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "0.117.1",
    "@auth/drizzle-adapter": "1.11.3",
    "@neondatabase/serverless": "1.1.0",
    "@vercel/blob": "2.8.0",
    "browser-image-compression": "2.0.2",
    "drizzle-orm": "0.45.2",
    "nanoid": "5.1.16",
    "next": "16.3.1",
    "next-auth": "5.0.0-beta.32",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "recharts": "3.10.1",
    "server-only": "0.0.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "22.20.1",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "dotenv": "17.4.2",
    "drizzle-kit": "0.31.10",
    "eslint": "9.39.5",
    "eslint-config-next": "16.3.1",
    "eslint-config-prettier": "10.1.8",
    "prettier": "3.9.6",
    "prettier-plugin-tailwindcss": "0.8.1",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3"
  }
}
```

Notes on the non-roadmap-pinned entries (all listed again under **Contract deltas**):

- `nanoid@5.1.16` — roadmap §5 F03 requires a nanoid helper but §3 does not pin it.
  Pinned to the 5.x line (6.x is ESM-only and unnecessary here).
- `server-only@0.0.1` — the canonical marker package used by `lib/env.ts` (Task 17).
- `dotenv@17.4.2` — needed only by `drizzle.config.ts`, which runs outside Next and so
  cannot use Next's `.env.local` loading.
- `eslint@9.39.5` — deliberately **not** ESLint 10. `eslint-config-next@16.3.1` declares
  `"eslint": ">=9.0.0"`, but 10.x is a fresh major; 9.39.5 is the version validated here.
- `typescript@5.9.3` — deliberately **not** TypeScript 7.x (the native-Go rewrite).
  Next 16 requires ≥5.1; 5.9.3 is validated.
- `@types/node@22.20.1` — matched to the Node 22 runtime, not the latest 26.x.

Install:

```bash
cd /home/miftah/expense-tracking
npm install
```

**Expected output** (~2 minutes):

```
added 463 packages, and audited 464 packages in 2m
...
npm warn install-scripts 4 packages had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   esbuild@0.25.12 (postinstall: node install.js)
npm warn install-scripts   esbuild@0.18.20 (postinstall: node install.js)
npm warn install-scripts   unrs-resolver@1.12.2 (postinstall: node postinstall.js)
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
```

> **This warning is benign — do not "fix" it.** It was verified that both `npx eslint .`
> (needs `unrs-resolver`) and `npx drizzle-kit --version` (needs `esbuild`) work fine
> without approving the scripts, because all four packages ship prebuilt native binaries
> as optional dependencies. Only if a future `drizzle-kit generate` fails with a missing
> esbuild binary should you run `npm install-scripts approve esbuild`.

Sanity-check the tools resolve:

```bash
npx drizzle-kit --version && npx tsc --version && npx eslint --version
```

**Expected output:**

```
drizzle-kit: v0.31.10
drizzle-orm: v0.45.2
Version 5.9.3
v9.39.5
```

---

### Task 5 — `.gitignore` (3 min)

The generated `.gitignore` has `.env*`, which would also ignore `.env.example`. Fix that,
and add the Drizzle/Vercel/tooling entries this project needs.

> ⚠️ A `.gitignore` may already exist at the repo root (a sibling planning session wrote
> one). Task 3's `mv` overwrote it with the create-next-app template. **F01 owns this
> file**, and the content below is a superset of what was there — including the
> `.idea/` / `.vscode/` entries that came from the sibling copy. Before overwriting, run
> `git diff -- .gitignore` (or check the backup) and fold in anything unexpected.

**File: `/home/miftah/expense-tracking/.gitignore`**

```gitignore
# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files — .env.example is the ONLY one that is committed
.env
.env.*
!.env.example

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# editors
.idea/
.vscode/*
!.vscode/extensions.json

# scaffolding leftovers
/scaffold-tmp
```

Verify the ignore rules are exactly right — this is the single highest-consequence file in
this task list:

```bash
cd /home/miftah/expense-tracking
git check-ignore -v .env.local .env.example 2>&1
```

**Expected output** — two lines. The `!` prefix on the second is what matters: it means
`.env.example` matched a **negation** rule, i.e. it is *not* ignored.

```
.gitignore:33:.env.*	.env.local
.gitignore:34:!.env.example	.env.example
```

Belt and braces — this must print nothing at all:

```bash
git check-ignore .env.example && echo "BROKEN: .env.example is ignored"
```

---

### Task 6 — Commit checkpoint 1 (2 min)

```bash
cd /home/miftah/expense-tracking
git add -A
git commit -m "chore(f01): scaffold Next.js 16.3.1 App Router with pinned dependency set

- create-next-app@16.3.1 template app-tw, TypeScript + Tailwind v4 + ESLint
- package.json pins every runtime dep to roadmap v0.1.0 section 3 exactly
- npm scripts: dev, build, lint, typecheck, format, db:generate/migrate/studio/smoke
- .gitignore: ignore all .env* except .env.example"
git log --oneline
```

**Expected output:**

```
<sha> chore(f01): scaffold Next.js 16.3.1 App Router with pinned dependency set
```

---

### Task 7 — `tsconfig.json` (4 min)

Strict mode, `@/*` alias, plus two extras that matter for a DB-backed app.

**File: `/home/miftah/expense-tracking/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules", "drizzle"]
}
```

**Deliberate choices every downstream feature must know about:**

- `"noUncheckedIndexedAccess": true` — `rows[0]` is typed `T | undefined`. F03/F07/F08
  authors must write `rows[0]?.total` or `rows[0]!` after a length check, not `rows[0].total`.
  This is on purpose: a `SELECT` that returns zero rows is the most common runtime crash in
  this shape of app.
- `"verbatimModuleSyntax": true` — type-only imports must be written
  `import type { X } from '...'`. ESLint autofix handles this.
- `"target": "ES2022"` (raised from the template's `ES2017`) — Node 22 and Safari 16.4+
  both support it, so `??=`, `.at()`, class fields and top-level `await` are available.
- `"paths": { "@/*": ["./*"] }` with **no `baseUrl`** — this is the Next 16 template shape.
  `@/lib/env` resolves from the repo root. Do not add `"baseUrl": "src/"`; there is no
  `src/` directory in this project.

---

### Task 8 — `next.config.ts` (3 min)

**File: `/home/miftah/expense-tracking/next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every route in this app runs on the Node.js runtime (the Next 16 default).
  // Nothing here opts into the Edge runtime — see docs/plans/F01-foundation.md §4.
  reactStrictMode: true,

  // Vercel Blob public URLs. F06 attaches photos from this host; declaring it here
  // (rather than in F06) keeps all host allow-listing in one place.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
    ],
  },

  // No `eslint` key: `next build` no longer runs the linter in Next 16, and the option
  // was removed. Linting runs via `npm run lint` and in CI/pre-push only.
  // No `webpack` key: Turbopack is the default bundler in Next 16 and a webpack config
  // would make `next build` fail outright.
}

export default nextConfig
```

---

### Task 9 — `postcss.config.mjs` (Tailwind v4) (2 min)

Tailwind v4 is **CSS-first**: there is no `tailwind.config.js` and no `content` array
(v4 auto-detects sources). The only build wiring is the PostCSS plugin, which
`create-next-app` already generated correctly. Verify rather than rewrite:

```bash
cat /home/miftah/expense-tracking/postcss.config.mjs
```

**Expected output — if it does not match this exactly, overwrite it:**

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

> **Do not create `tailwind.config.js`.** In v4 that file only exists as a v3
> compatibility shim loaded via `@config`, and using it would defeat the `@theme` token
> pipeline F10 depends on.

---

### Task 10 — ESLint flat config (3 min)

Next 16 ships ESLint **flat config** by default (`next lint` is removed; the `eslint`
key in `next.config.ts` is removed). `eslint-config-prettier/flat` goes **last** so it can
turn off formatting rules that would fight Prettier.

**File: `/home/miftah/expense-tracking/eslint.config.mjs`**

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must come last: disables stylistic rules that conflict with Prettier.
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'drizzle/**',
    'next-env.d.ts',
    'scaffold-tmp/**',
  ]),
])

export default eslintConfig
```

---

### Task 11 — Prettier config (3 min)

**File: `/home/miftah/expense-tracking/.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./app/globals.css"
}
```

> `tailwindStylesheet` (not the v3-era `tailwindConfig`) is how
> `prettier-plugin-tailwindcss` finds a Tailwind **v4** theme for class sorting. It points
> at the file that holds the `@theme` block.

**File: `/home/miftah/expense-tracking/.prettierignore`**

```gitignore
.next
node_modules
drizzle
package-lock.json
*.md
```

> `*.md` is ignored so Prettier never reformats `ROADMAP_v0.1.0.md` or the plan files in
> `docs/plans/`.

---

### Task 12 — Directory skeleton (4 min)

Create every directory referenced by roadmap §4, with a `.gitkeep` so the empty ones
survive the commit and downstream features have an unambiguous destination.

```bash
cd /home/miftah/expense-tracking
mkdir -p app/actions app/api/health lib/db lib/llm lib/schema components scripts public
for d in app/actions lib/db lib/llm lib/schema components; do touch "$d/.gitkeep"; done
find app lib components scripts public -type d | sort
```

**Expected output:**

```
app
app/actions
app/api
app/api/health
components
lib
lib/db
lib/llm
lib/schema
public
scripts
```

Destination map — each path below is claimed by exactly one feature:

| Path | Contents | Owner |
|---|---|---|
| `app/actions/expenses.ts` | `createExpense`, `updateExpenseMeta`, `deleteExpense` | F05/F07 |
| `app/actions/items.ts` | `addItem`, `updateItem`, `deleteItem` | F07 |
| `app/actions/photos.ts` | `attachPhoto`, `deletePhoto` | F06 |
| `app/actions/share.ts` | `createShareLink`, `revokeShareLink` | F09 |
| `lib/env.ts` | validated env | **F01 (this plan)** |
| `lib/categories.ts` | `CATEGORIES`, `Category` | F03 |
| `lib/format.ts` | `formatIdr`, `parseIdrLoose`, `TZ`, `todayJakartaISO`, `monthKey` | F03 |
| `lib/db/schema.ts`, `lib/db/client.ts`, `lib/db/queries.ts`, `lib/db/ids.ts` | Drizzle | F03 |
| `lib/llm/client.ts`, `lib/llm/parseExpense.ts` | Anthropic SDK w/ baseURL override | F04 |
| `lib/schema/expense.ts` | `ParsedItem`, `ParsedExpense` | F03 |
| `components/*` | `Button`, `Card`, `Sheet`, `Chip`, `Field`, `EmptyState`, `Money`, `TabBar` | F10 |
| `drizzle/` | generated SQL migrations (created by `npm run db:generate`) | F03 |

---

### Task 13 — `app/globals.css` (Tailwind v4 skeleton) (4 min)

A **minimal** `@theme` block. F10 replaces the token values wholesale — this file exists
now only so the build has a stylesheet and so `prettier-plugin-tailwindcss` has something
to read.

**File: `/home/miftah/expense-tracking/app/globals.css`**

```css
@import 'tailwindcss';

/*
 * Tailwind v4 is CSS-first: this @theme block IS the config. There is no
 * tailwind.config.js in this project and there must never be one.
 * F10 (Design System) owns the real token ramps; what is here is a placeholder
 * that keeps the build green and gives prettier-plugin-tailwindcss a stylesheet.
 */
@theme {
  --font-sans:
    ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

html {
  /* iOS: never let Safari zoom on input focus. F10 enforces 16px minimum on inputs. */
  -webkit-text-size-adjust: 100%;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-tap-highlight-color: transparent;
}
```

---

### Task 14 — `app/layout.tsx` and `app/page.tsx` (4 min)

**File: `/home/miftah/expense-tracking/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Expense Tracking',
  description: 'Catat pengeluaran dengan cara paling malas: tempel teks, biar rapi sendiri.',
}

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve on iPhone XS Max.
// F10 builds the safe-area-aware tab bar on top of this.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
```

> `LayoutProps<'/'>` is a **globally available generated type** (Next 16 typegen), not an
> import. It only exists after `.next/types` has been produced — which is why
> `npm run typecheck` is `next typegen && tsc --noEmit`. Running bare `tsc --noEmit` on a
> clean checkout fails with `TS2304: Cannot find name 'LayoutProps'`; this is expected, not
> a bug.

**File: `/home/miftah/expense-tracking/app/page.tsx`**

```tsx
// Placeholder landing page. F02 replaces this with the signed-out landing + Google button
// and the signed-in redirect to /m/<current YYYY-MM>.
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">expensetracking.online</h1>
      <p className="text-sm opacity-60">Foundation is up. F02 lands sign-in here.</p>
    </main>
  )
}
```

---

### Task 15 — Commit checkpoint 2 (2 min)

```bash
cd /home/miftah/expense-tracking
git add -A
git commit -m "chore(f01): tsconfig, next.config, eslint flat config, prettier, app shell

- tsconfig: strict + noUncheckedIndexedAccess + verbatimModuleSyntax, target ES2022, @/* alias
- eslint.config.mjs: next core-web-vitals + typescript + eslint-config-prettier (last)
- prettier: no semicolons, single quotes, tailwind class sorting via tailwindStylesheet
- app/globals.css: Tailwind v4 @import + placeholder @theme (no tailwind.config.js)
- app/layout.tsx: lang=id, viewport-fit=cover for iOS safe-area insets
- directory skeleton for every path in roadmap section 4"
```

---

### Task 16 — `.env.example` (3 min)

Committed. Placeholders only — the shape of the file is the documentation.

**File: `/home/miftah/expense-tracking/.env.example`**

```bash
# ---------------------------------------------------------------------------
# Copy to .env.local and fill in. .env.local is git-ignored and must stay so.
# Every variable here is SERVER-ONLY. None of them may ever be prefixed with
# NEXT_PUBLIC_ — that prefix inlines the value into the client bundle.
# ---------------------------------------------------------------------------

# --- LLM: GLM-5.2 via z.ai Anthropic-compatible endpoint (F04) --------------
# Required at boot. lib/env.ts crashes the process if any of these is missing.
LLM_API_KEY=
LLM_BASE_URL=https://api.z.ai/api/anthropic
LLM_MODEL=glm-5.2

# --- Neon Postgres (F03) ----------------------------------------------------
# DATABASE_URL          -> POOLED connection string. Host contains "-pooler".
#                          Used by the app at runtime (many short-lived conns).
# DATABASE_URL_UNPOOLED -> DIRECT connection string. No "-pooler" in the host.
#                          Used by drizzle-kit migrate/studio ONLY. Running
#                          migrations through the pooler produces confusing
#                          "prepared statement already exists" style failures.
# Both must include ?sslmode=require.
DATABASE_URL=
DATABASE_URL_UNPOOLED=

# --- Auth.js v5 (F02) -------------------------------------------------------
# AUTH_SECRET: generate with `openssl rand -base64 32`
# AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET: Google Cloud Console OAuth 2.0 client.
# AUTH_URL: PRODUCTION ONLY. Leave empty locally and on preview — Auth.js infers
#           the origin from the request there.
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=

# --- Vercel Blob (F06) ------------------------------------------------------
# Auto-injected by Vercel once a Blob store is linked to the project.
# For local dev, pull it down with: vercel env pull .env.local
BLOB_READ_WRITE_TOKEN=
```

---

### Task 17 — `.env.local` with the real credentials (4 min)

> 🔴 **Integrator action required.** The three secret values below are marked
> `<<PASTE …>>`. This plan does not have them (see **Open questions Q1**). Paste the real
> values from the z.ai console and the Neon console before running the commands, or the
> file will be written with literal placeholder text and Task 21 will fail loudly — which
> is the intended failure mode, not a silent one.

> ⚠️ **`.env.local` may already exist.** As of this writing the repo already contains a
> `.env.local` holding `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_SECRET`, written
> while F02 was being planned. **Do not `cat >` over it** — you would destroy real OAuth
> credentials that are not recorded anywhere else. The steps below are append-only and
> idempotent: they add just the keys that are missing and never touch a key that already
> has a value.

**Step 17a — back up whatever is there, then append the F01-owned keys:**

```bash
cd /home/miftah/expense-tracking
[ -f .env.local ] && cp .env.local ".env.local.bak.$(date +%s)"

add_env() {  # add_env KEY VALUE — appends only if KEY is absent or empty
  local key="$1" val="$2"
  if grep -qE "^${key}=.+" .env.local 2>/dev/null; then
    echo "skip  ${key} (already set)"
  else
    sed -i "/^${key}=\s*$/d" .env.local 2>/dev/null || true
    printf '%s=%s\n' "$key" "$val" >> .env.local
    echo "add   ${key}"
  fi
}

touch .env.local
add_env LLM_API_KEY '<<PASTE z.ai API KEY>>'
add_env LLM_BASE_URL 'https://api.z.ai/api/anthropic'
add_env LLM_MODEL 'glm-5.2'
add_env DATABASE_URL '<<PASTE NEON POOLED CONNECTION STRING — host contains -pooler>>'
add_env DATABASE_URL_UNPOOLED '<<PASTE NEON DIRECT CONNECTION STRING — no -pooler>>'
add_env AUTH_SECRET "$(openssl rand -base64 32)"
```

**Expected output** on a repo where F02 already seeded the auth vars:

```
add   LLM_API_KEY
add   LLM_BASE_URL
add   LLM_MODEL
add   DATABASE_URL
add   DATABASE_URL_UNPOOLED
skip  AUTH_SECRET (already set)
```

**Step 17b —** open `.env.local` in an editor and replace the three `<<PASTE …>>` lines
with the real values. Leave `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_URL` /
`BLOB_READ_WRITE_TOKEN` exactly as you found them (F02 and F06 own those).

Once the file is correct, delete the timestamped backups — they contain live secrets:

```bash
rm -f .env.local.bak.*
```

Verify the file is present, populated, and invisible to git:

```bash
cd /home/miftah/expense-tracking
grep -c '<<PASTE' .env.local || true
git status --short | grep -c '\.env\.local' || echo "0 (good: .env.local is ignored)"
```

**Expected output:**

```
0
0 (good: .env.local is ignored)
```

If the first number is not `0`, you still have placeholders to replace.

---

### Task 18 — `lib/env.ts` (5 min)

The single source of truth for environment access. Three design decisions, all deliberate:

1. **`import 'server-only'` on line 1.** Any client component (`'use client'`) that
   imports this module — directly or transitively — becomes a **build-time error**, not a
   runtime leak. This is the mechanism that guarantees `LLM_API_KEY` and `DATABASE_URL`
   never reach the browser bundle. Note that Next's own protection (only `NEXT_PUBLIC_*`
   is inlined) already prevents leaking the *values*; `server-only` additionally prevents
   the mistake of importing the module at all, which is the failure mode that produces
   confusing `process.env is undefined` bugs.
2. **Eager validation for F01-owned vars, lazy for feature-owned vars.** `env` is parsed
   at module evaluation, so a missing `DATABASE_URL` crashes the *build*, not a user
   request (proved in Task 22). `authEnv()` and `blobEnv()` are lazy because their
   variables do not exist yet at F01 time — but they are still boot-time in practice:
   F02's `auth.ts` calls `authEnv()` at module scope, so any route that touches auth
   crashes at import, not mid-request. Same for F06 and `blobEnv()`.
3. **No `NEXT_PUBLIC_*` variable exists in this project.** Roadmap §4.8 defines none, and
   this file deliberately provides no client-side counterpart. Client code that needs an
   origin uses `window.location.origin`; server code that needs one uses
   `AUTH_URL` / the request headers.

**File: `/home/miftah/expense-tracking/lib/env.ts`**

```ts
import 'server-only'
import { z } from 'zod'

/**
 * Environment contract for expensetracking.online.
 *
 * Roadmap v0.1.0 section 4.8 is authoritative for the variable names.
 * Every variable here is server-only; none is prefixed NEXT_PUBLIC_.
 *
 * Import rules:
 *   - Server Components, Route Handlers, Server Actions, lib/**  -> allowed
 *   - Client Components ('use client')                           -> build error
 *   - Node scripts outside Next (scripts/*.mjs, drizzle.config)  -> NOT importable,
 *     because 'server-only' has no react-server condition there. Those read
 *     process.env directly; see scripts/db-smoke.mjs and drizzle.config.ts.
 */

const nonEmpty = (name: string) => z.string().min(1, `${name} is required but was empty or unset`)

const postgresUrl = (name: string) =>
  nonEmpty(name).startsWith('postgres', `${name} must be a postgres:// or postgresql:// URL`)

/** Always required. Parsed eagerly at module load -> a missing value fails the build. */
const coreSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // F04 — GLM-5.2 via the z.ai Anthropic-compatible endpoint.
  LLM_API_KEY: nonEmpty('LLM_API_KEY'),
  LLM_BASE_URL: z.url('LLM_BASE_URL must be an absolute URL'),
  LLM_MODEL: nonEmpty('LLM_MODEL'),

  // F03 — Neon. DATABASE_URL is pooled (runtime); DATABASE_URL_UNPOOLED is direct
  // (drizzle-kit migrate/studio only).
  DATABASE_URL: postgresUrl('DATABASE_URL'),
  DATABASE_URL_UNPOOLED: postgresUrl('DATABASE_URL_UNPOOLED'),
})

/** F02 owns these. Validated on first call, which F02's auth.ts makes module-scope. */
const authSchema = z.object({
  AUTH_SECRET: nonEmpty('AUTH_SECRET'),
  AUTH_GOOGLE_ID: nonEmpty('AUTH_GOOGLE_ID'),
  AUTH_GOOGLE_SECRET: nonEmpty('AUTH_GOOGLE_SECRET'),
  // Production only. Auth.js infers the origin from the request in dev and preview.
  AUTH_URL: z.url('AUTH_URL must be an absolute URL').optional(),
})

/** F06 owns this. Vercel injects it once a Blob store is linked to the project. */
const blobSchema = z.object({
  BLOB_READ_WRITE_TOKEN: nonEmpty('BLOB_READ_WRITE_TOKEN'),
})

function fail(group: string, error: z.ZodError): never {
  const lines = error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(
    [
      '',
      '',
      `================ INVALID ${group.toUpperCase()} ENVIRONMENT ================`,
      lines,
      '',
      'Local dev : copy .env.example to .env.local and fill in the blanks.',
      'Vercel    : Project Settings > Environment Variables (per environment).',
      '============================================================',
      '',
    ].join('\n'),
  )
}

function load<T extends z.ZodType>(group: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) fail(group, parsed.error)
  return parsed.data
}

/**
 * Validated core environment. Evaluated at import time — a missing or malformed
 * variable throws here and aborts `next build` / `next dev` with the message above.
 */
export const env = load('core', coreSchema)

let authCache: z.infer<typeof authSchema> | null = null
/** Auth.js configuration. Throws loudly on first use if F02's vars are unset. */
export function authEnv(): z.infer<typeof authSchema> {
  authCache ??= load('auth', authSchema)
  return authCache
}

let blobCache: z.infer<typeof blobSchema> | null = null
/** Vercel Blob token. Throws loudly on first use if the store is not linked. */
export function blobEnv(): z.infer<typeof blobSchema> {
  blobCache ??= load('blob', blobSchema)
  return blobCache
}

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'

export type CoreEnv = z.infer<typeof coreSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type BlobEnv = z.infer<typeof blobSchema>
```

---

### Task 19 — Neon connection smoke test script (4 min)

Plain `.mjs`, run through Node's built-in `--env-file`. It deliberately does **not**
import `lib/env.ts` (that module is `server-only` and only resolvable inside the Next
bundler) and deliberately does not depend on Drizzle, so it is a genuinely independent
check of "can this machine reach this Neon database with these credentials".

**File: `/home/miftah/expense-tracking/scripts/db-smoke.mjs`**

```js
// Neon connectivity smoke test.
//   npm run db:smoke                       (reads .env.local)
//   node --env-file=.env.local scripts/db-smoke.mjs -- --unpooled
//
// Exits 0 on success, 1 on any failure. Prints nothing secret.
import { neon } from '@neondatabase/serverless'

const useUnpooled = process.argv.includes('--unpooled')
const varName = useUnpooled ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'
const url = process.env[varName]

if (!url) {
  console.error(`FAIL  ${varName} is not set.`)
  console.error('      Run: node --env-file=.env.local scripts/db-smoke.mjs')
  process.exit(1)
}

const host = new URL(url).host
const looksPooled = host.includes('-pooler')
if (useUnpooled && looksPooled) {
  console.error(`FAIL  ${varName} points at a POOLED host (${host}). Use the direct string.`)
  process.exit(1)
}
if (!useUnpooled && !looksPooled) {
  console.warn(`WARN  ${varName} host (${host}) has no "-pooler". Runtime should use the pooled URL.`)
}

const sql = neon(url)
const startedAt = Date.now()

try {
  const rows = await sql`
    select now() as now, current_database() as db, current_user as usr, version() as version
  `
  const row = rows[0]
  console.log(`OK    var      = ${varName}`)
  console.log(`OK    host     = ${host}`)
  console.log(`OK    database = ${row.db}`)
  console.log(`OK    user     = ${row.usr}`)
  console.log(`OK    now      = ${row.now}`)
  console.log(`OK    server   = ${row.version.split(',')[0]}`)
  console.log(`OK    latency  = ${Date.now() - startedAt} ms`)
} catch (err) {
  console.error(`FAIL  ${err.message}`)
  process.exit(1)
}
```

Run it:

```bash
cd /home/miftah/expense-tracking
npm run db:smoke
```

**Expected output** (values will differ; the shape must match):

```
OK    var      = DATABASE_URL
OK    host     = ep-xxxx-pooler.ap-southeast-1.aws.neon.tech
OK    database = neondb
OK    user     = neondb_owner
OK    now      = 2026-08-19T05:31:44.812Z
OK    server   = PostgreSQL 17.5 on x86_64-pc-linux-gnu
OK    latency  = 412 ms
```

**Failure modes and what they mean** (all observed while validating this plan):

| Output | Cause |
|---|---|
| `FAIL password authentication failed for user '…'` | Wrong connection string, or you pasted the role name without the password |
| `FAIL getaddrinfo ENOTFOUND …` | Typo in the host, or the Neon project/branch was deleted |
| `FAIL fetch failed` | No outbound network, or `sslmode=require` was stripped from the URL |
| Hangs then `FAIL` | Neon compute is scaling from zero — re-run; the second call is fast |

Also verify the direct (migration) string:

```bash
node --env-file=.env.local scripts/db-smoke.mjs --unpooled
```

**Expected:** same shape, `var = DATABASE_URL_UNPOOLED`, host **without** `-pooler`.

---

### Task 20 — `drizzle.config.ts` (4 min)

F01 provides the config; **F03 provides `lib/db/schema.ts`**. Until F03 lands,
`npm run db:generate` will report that the schema file does not exist — that is expected
and is the handoff point.

`drizzle-kit` runs outside the Next.js bundler, so it cannot use Next's `.env.local`
loading and cannot import `lib/env.ts` (which is `server-only`). It uses `dotenv` and
reads `process.env` directly.

**File: `/home/miftah/expense-tracking/drizzle.config.ts`**

```ts
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next.js, so Next's automatic .env.local loading does not
// apply and lib/env.ts (server-only) is not importable here.
loadEnv({ path: '.env.local', quiet: true })

const url = process.env.DATABASE_URL_UNPOOLED
if (!url) {
  throw new Error(
    'DATABASE_URL_UNPOOLED is not set. drizzle-kit must use the DIRECT (unpooled) Neon ' +
      'connection string — running migrations through the pooler is unsupported. ' +
      'Copy .env.example to .env.local and fill it in.',
  )
}
if (new URL(url).host.includes('-pooler')) {
  throw new Error(
    `DATABASE_URL_UNPOOLED points at a pooled host (${new URL(url).host}). ` +
      'Use the direct connection string from the Neon console.',
  )
}

export default defineConfig({
  // Owned by F03. This path must not change.
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
```

Verify the config loads and its guard works:

```bash
cd /home/miftah/expense-tracking
npx drizzle-kit generate 2>&1 | tail -5
```

**Expected output while F03 is unbuilt** (this is a *pass*):

```
No schema file found at ./lib/db/schema.ts
```

or a comparable "schema not found" message. What must **not** appear is the
`DATABASE_URL_UNPOOLED is not set` error — that would mean `.env.local` is wrong.

---

### Task 21 — `app/api/health/route.ts` (4 min)

A deployment liveness probe. It is the fastest way to answer "is this deployment wired to
the right database with the right env vars", both locally and against production, and it is
the only place in F01 that imports `lib/env.ts` — so it is also what makes the env crash in
Task 22 observable.

> ⚠️ This route is **not** in roadmap §4.5. It is declared under **Contract deltas**.

**File: `/home/miftah/expense-tracking/app/api/health/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { env } from '@/lib/env'

// Explicit, even though 'nodejs' is the Next 16 default: this route reads server-only
// env and opens a database connection, and must never be flipped to the Edge runtime.
export const runtime = 'nodejs'
// Never prerender or cache: the whole point is to report live state.
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    const sql = neon(env.DATABASE_URL)
    const rows = await sql`select now() as now, current_database() as db`
    return NextResponse.json({
      ok: true,
      db: rows[0]?.db ?? null,
      now: rows[0]?.now ?? null,
      latencyMs: Date.now() - startedAt,
      // Safe to expose: a public endpoint URL and a model name. No key, no DSN.
      llm: { baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL },
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
      env: process.env.VERCEL_ENV ?? 'local',
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, latencyMs: Date.now() - startedAt },
      { status: 500 },
    )
  }
}
```

> **Never add the connection string, `LLM_API_KEY`, or `AUTH_SECRET` to this payload.**
> The route is unauthenticated by design so that `curl` can reach it from anywhere.

---

### Task 22 — Prove the env guard crashes the build (3 min)

This is the acceptance test for "loud crash, never a silent `undefined`".

```bash
cd /home/miftah/expense-tracking
cp .env.local .env.local.bak
sed -i 's/^LLM_MODEL=.*/LLM_MODEL=/' .env.local
npm run build 2>&1 | tail -20
```

**Expected output** (build **fails**, exit code non-zero):

```
  Collecting page data using 6 workers ...
Error: Failed to collect configuration for /api/health
    at ignore-listed frames {
  [cause]: Error:

  ================ INVALID CORE ENVIRONMENT ================
    - LLM_MODEL: LLM_MODEL is required but was empty or unset

  Local dev : copy .env.example to .env.local and fill in the blanks.
  Vercel    : Project Settings > Environment Variables (per environment).
  ============================================================

> Build error occurred
Error: Failed to collect page data for /api/health
```

Restore and confirm the build is green again:

```bash
mv .env.local.bak .env.local
npm run build 2>&1 | tail -12
```

**Expected output:**

```
Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/health


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

### Task 23 — Format, lint, typecheck (3 min)

```bash
cd /home/miftah/expense-tracking
npm run format
npm run lint
npm run typecheck
npm run format:check
```

**Expected output:** `npm run format` lists the files it touched;
`npm run lint`, `npm run typecheck` and `npm run format:check` all print nothing beyond
`All matched files use Prettier code style!` and exit `0`.

If `npm run typecheck` reports `Cannot find name 'LayoutProps'`, the `next typegen` half of
the script did not run — check the script text in `package.json`.

---

### Task 24 — Dev server smoke check (3 min)

```bash
cd /home/miftah/expense-tracking
npm run dev
```

**Expected output:**

```
▲ Next.js 16.3.1 (Turbopack)
- Local:         http://localhost:3000
- Environments: .env.local
✓ Ready in 272ms
```

In a second terminal:

```bash
curl -s http://localhost:3000/api/health | head -c 400; echo
```

**Expected output** (single line JSON):

```json
{"ok":true,"db":"neondb","now":"2026-08-19T05:33:02.114Z","latencyMs":388,"llm":{"baseUrl":"https://api.z.ai/api/anthropic","model":"glm-5.2"},"commit":"local","env":"local"}
```

Stop the dev server (`Ctrl-C`). `next dev` will have (re)created `AGENTS.md` with the
managed Next.js agent-rules block; that file is intended to be committed.

---

### Task 25 — Commit checkpoint 3 (2 min)

```bash
cd /home/miftah/expense-tracking
git status --short
git add -A
git commit -m "feat(f01): Zod-validated environment, Neon smoke test, health route

- lib/env.ts: server-only module; core env parsed eagerly (build fails on a missing
  var), authEnv()/blobEnv() lazy so F02/F06 can land their vars later
- .env.example documents every var in roadmap section 4.8 with pooled-vs-unpooled notes
- scripts/db-smoke.mjs: standalone Neon connectivity check, npm run db:smoke
- drizzle.config.ts: postgresql dialect, ./lib/db/schema.ts (F03), unpooled URL enforced
- app/api/health/route.ts: nodejs runtime liveness probe (contract delta, see plan)"
git log --oneline
```

**Expected output:** three commits, newest first.

---

### Task 26 — Install and link the Vercel CLI (4 min)

```bash
npm i -g vercel@latest
vercel --version
vercel login
```

**Expected output:** a version number, then a browser-based login flow ending in
`> Success! GitHub authentication complete`.

Create and link the project (run from the repo root; answer the prompts as shown):

```bash
cd /home/miftah/expense-tracking
vercel link
```

**Prompts / answers:**

```
? Set up "~/expense-tracking"?              yes
? Which scope should contain your project?  <your personal account>
? Link to existing project?                 no
? What's your project's name?               expense-tracking
? In which directory is your code located?  ./
```

**Expected output:**

```
✅  Linked to <scope>/expense-tracking (created .vercel)
```

`.vercel/` is git-ignored (Task 5). Do not commit it.

Vercel auto-detects Next.js; leave Build Command, Output Directory and Install Command on
their defaults. Confirm the runtime:

```bash
vercel project inspect expense-tracking 2>&1 | head -20
```

Check that **Node.js Version** reads `22.x`. If it does not, set it in
Project Settings → General → Node.js Version. This must match the `engines.node` in
`package.json`.

---

### Task 27 — Configure environment variables on Vercel (5 min)

Vercel has three environments. This project's mapping:

| Variable | development | preview | production |
|---|---|---|---|
| `LLM_API_KEY` | ✅ same key | ✅ same key | ✅ same key |
| `LLM_BASE_URL` | ✅ | ✅ | ✅ |
| `LLM_MODEL` | ✅ | ✅ | ✅ |
| `DATABASE_URL` | ✅ | ✅ | ✅ |
| `DATABASE_URL_UNPOOLED` | ✅ | ✅ | ✅ |
| `AUTH_SECRET` | ✅ | ✅ | ✅ (F02 may rotate) |
| `AUTH_GOOGLE_ID` | ✅ if already in `.env.local`, else ⏳ F02 | same | same |
| `AUTH_GOOGLE_SECRET` | ✅ if already in `.env.local`, else ⏳ F02 | same | same |
| `AUTH_URL` | ❌ omit | ❌ omit | ✅ `https://expensetracking.online` |
| `BLOB_READ_WRITE_TOKEN` | ⏳ F06 | auto | auto |

> **`AUTH_URL` is production-only** (roadmap §4.8). On preview, every deployment has a
> different `*.vercel.app` origin, so a pinned `AUTH_URL` would break the OAuth callback;
> Auth.js infers the origin from the request instead.

> **`vercel env add` refuses to combine `development` with `production`/`preview` in one
> command.** Add development in a separate invocation. The commands below already do.

Add the five variables that exist today, to preview + production:

```bash
cd /home/miftah/expense-tracking
for VAR in LLM_API_KEY LLM_BASE_URL LLM_MODEL DATABASE_URL DATABASE_URL_UNPOOLED AUTH_SECRET; do
  grep "^${VAR}=" .env.local | cut -d= -f2- | vercel env add "$VAR" production preview
done
```

Then the same set for development:

```bash
for VAR in LLM_API_KEY LLM_BASE_URL LLM_MODEL DATABASE_URL DATABASE_URL_UNPOOLED AUTH_SECRET; do
  grep "^${VAR}=" .env.local | cut -d= -f2- | vercel env add "$VAR" development
done
```

**If `.env.local` already carries `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`** (see Open
Questions Q1 — it does at time of writing), push those too rather than leaving them for
F02; a preview deploy with F02 merged but the vars absent fails at boot:

```bash
for VAR in AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET; do
  grep -qE "^${VAR}=.+" .env.local || { echo "skip $VAR (not set locally)"; continue; }
  grep "^${VAR}=" .env.local | cut -d= -f2- | vercel env add "$VAR" production preview
  grep "^${VAR}=" .env.local | cut -d= -f2- | vercel env add "$VAR" development
done
```

Then the production-only `AUTH_URL`:

```bash
printf 'https://expensetracking.online' | vercel env add AUTH_URL production
```

**Expected output** per variable:

```
✅  Added Environment Variable LLM_API_KEY to Project expense-tracking [1s]
```

Mark the secrets as sensitive in the dashboard (Project Settings → Environment Variables →
each of `LLM_API_KEY`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET` → **Sensitive**).
Sensitive values are write-only: they cannot be read back from the dashboard or by
`vercel env pull`, which is the correct posture for these four.

Verify:

```bash
vercel env ls
```

**Expected output:** 19 rows — the six core variables × three environments, plus `AUTH_URL`
in production only. Add 6 more rows (25 total) if the `AUTH_GOOGLE_*` pair was pushed as
well. What matters is that **no variable appears in fewer than three environments** apart
from `AUTH_URL`.

---

### Task 28 — Deploy a preview (4 min)

```bash
cd /home/miftah/expense-tracking
vercel deploy
```

**Expected output:**

```
🔍  Inspect: https://vercel.com/<scope>/expense-tracking/<id> [3s]
✅  Preview: https://expense-tracking-<hash>-<scope>.vercel.app [45s]
```

Probe the deployment:

```bash
curl -s https://expense-tracking-<hash>-<scope>.vercel.app/api/health | head -c 400; echo
```

**Expected output:**

```json
{"ok":true,"db":"neondb","now":"...","latencyMs":180,"llm":{"baseUrl":"https://api.z.ai/api/anthropic","model":"glm-5.2"},"commit":"<sha>","env":"preview"}
```

`"env":"preview"` confirms the preview environment variables resolved. If you get
`"ok":false` with a Postgres error, the `DATABASE_URL` in the **preview** environment is
wrong — `vercel env rm DATABASE_URL preview` and re-add it.

If the build itself fails with the `INVALID CORE ENVIRONMENT` banner, a variable is
missing from that environment — the banner names it. That is the guard working as
designed.

---

### Task 29 — Deploy to production (3 min)

```bash
cd /home/miftah/expense-tracking
vercel deploy --prod
```

**Expected output:**

```
✅  Production: https://expense-tracking-<scope>.vercel.app [50s]
```

```bash
curl -s https://expense-tracking-<scope>.vercel.app/api/health | head -c 400; echo
```

**Expected:** `"ok":true` and `"env":"production"`.

---

### Task 30 — Add the domain to the Vercel project (3 min)

```bash
cd /home/miftah/expense-tracking
vercel domains add expensetracking.online
vercel domains add www.expensetracking.online
```

**Expected output:** for each, either `✅ Success! Domain … added` followed by a
"Configure DNS" instruction, or a message that the domain is **not configured yet** with
the exact records to add.

Now read the values you actually need — **do not copy IPs out of blog posts, including
this plan.** Vercel assigns the A-record IP from an anycast pool, and the `www` CNAME
target is unique per project:

```bash
vercel domains inspect expensetracking.online
```

Or, in the dashboard: **Project → Settings → Domains → expensetracking.online** — the
domain card shows the two values verbatim. Write them down as:

- `A_VALUE` — an IPv4 address. Commonly `76.76.21.21`; newer projects are issued from a
  different anycast pool and show e.g. `216.198.79.1`.
- `CNAME_VALUE` — a per-project hostname of the form
  `<16-hex-chars>.vercel-dns-0NN.com` (older projects show `cname.vercel-dns.com`).

While you are on this screen, set the redirect: keep **`expensetracking.online`** as the
primary domain and configure **`www.expensetracking.online` → Redirect to
`expensetracking.online` (308 Permanent)**. This matters because `AUTH_URL` is pinned to
the apex; letting both origins serve the app would produce OAuth callback mismatches in F02.

---

### Task 31 — DNS records at Domainesia (5 min)

**Precondition:** `expensetracking.online` must be using **Domainesia's own nameservers**
(`ns1.domainesia.net`, `ns2.domainesia.net`) for the DNS Management panel to control the
zone. Check first:

```bash
dig +short NS expensetracking.online
```

**Expected output:**

```
ns1.domainesia.net.
ns2.domainesia.net.
```

If it returns something else (e.g. a previous host's nameservers), fix that in
Client Area → **My Domains** → *expensetracking.online* → **Nameservers** first, and wait
for propagation before continuing.

**Where the panel is:** Domainesia Client Area → **Domain** / *My Domains* → select
`expensetracking.online` → **Manage** → **DNS Management** (on some accounts it is under
the **Addons** tab as *DNS Zone Manager* → **Manage**).

**Records to add:**

| # | Type | Name / Host | Value | TTL | Purpose |
|---|---|---|---|---|---|
| 1 | **A** | `@` (or blank, or `expensetracking.online`) | `A_VALUE` from Task 30 | 3600 | Apex → Vercel |
| 2 | **CNAME** | `www` | `CNAME_VALUE` from Task 30 (**with trailing dot** if the panel requires FQDNs) | 3600 | `www` → Vercel |
| 3 | **CAA** *(only if a CAA record already exists)* | `@` | `0 issue "letsencrypt.org"` | 3600 | Let Vercel's ACME issuer mint the cert |

**A record vs CNAME — when each applies, and why you cannot swap them:**

- **Apex (`expensetracking.online`) must be an `A` record.** A DNS zone apex necessarily
  carries `SOA` and `NS` records, and RFC 1034 forbids a `CNAME` from coexisting with any
  other record at the same node. So the apex gets `A` → Vercel's anycast IP. Some
  registrars offer `ALIAS`/`ANAME`/`CNAME flattening` as a workaround; Domainesia's DNS
  Management does not reliably expose one, so use the `A` record.
- **`www` must be a `CNAME`.** It is a subdomain, so the restriction does not apply, and a
  `CNAME` is strictly better here: the target hostname is per-project and Vercel can
  re-point it (failover, IP pool changes) without you touching DNS ever again. Do **not**
  point `www` at the A-record IP.
- **The one case where you would use `CNAME` at the apex instead:** if you moved the whole
  zone to Vercel's nameservers (`vercel domains buy`/nameserver method). Then Vercel
  manages the apex internally and you add no records at Domainesia at all. This project
  keeps DNS at Domainesia, so: `A` at apex, `CNAME` at `www`.
- **Delete any conflicting records first** — a pre-existing `A`, `AAAA`, or parking-page
  `CNAME` on `@` or `www` will keep resolving and Vercel will report the domain as
  misconfigured. Also remove any Domainesia "web forwarding"/parking on the domain.

**Verify propagation** (usually 5–30 minutes on Domainesia; TTL 3600 is the cap):

```bash
dig +short A expensetracking.online
dig +short CNAME www.expensetracking.online
```

**Expected output:**

```
216.198.79.1                      # (or whatever A_VALUE your domain card showed)
a1b2c3d4e5f6a7b8.vercel-dns-017.com.
```

Then confirm Vercel agrees:

```bash
vercel domains inspect expensetracking.online
```

**Expected output** includes a line reading `Configured: ✅` / `Valid Configuration`.
Certificate issuance (Let's Encrypt, automatic) completes within a few minutes after that.

---

### Task 32 — Verify the live domain (3 min)

```bash
curl -sI https://expensetracking.online | head -3
curl -s https://expensetracking.online/api/health | head -c 400; echo
curl -sI https://www.expensetracking.online | head -5
```

**Expected output:**

```
HTTP/2 200
...

{"ok":true,"db":"neondb","now":"...","latencyMs":142,"llm":{"baseUrl":"https://api.z.ai/api/anthropic","model":"glm-5.2"},"commit":"<sha>","env":"production"}

HTTP/2 308
location: https://expensetracking.online/
```

The `308` on `www` confirms the redirect from Task 30. If `www` returns `200` instead of
`308`, go back to Project → Settings → Domains and set the redirect.

---

### Task 33 — Commit checkpoint 4 and push (3 min)

Create the GitHub remote and push, so Vercel's Git integration takes over from CLI
deploys (preview per branch, production per `main` push):

```bash
cd /home/miftah/expense-tracking
gh repo create expense-tracking --private --source=. --remote=origin
git add -A
git commit -m "chore(f01): record foundation state after Vercel + DNS setup" --allow-empty
git push -u origin main
```

**Expected output:**

```
branch 'main' set up to track 'origin/main'.
```

Then connect the repo in the Vercel dashboard (Project → Settings → Git → Connect Git
Repository → `expense-tracking`). Confirm a push triggers a build:

```bash
git commit --allow-empty -m "chore(f01): trigger first git-integrated deployment"
git push
vercel ls expense-tracking | head -5
```

**Expected output:** a fresh deployment appears with source `github`.

---

## 3. Verification

Run this block top to bottom from `/home/miftah/expense-tracking`. Every command must exit
`0` and produce the stated output. This is the definition of "F01 is done".

```bash
# 1. Versions are exactly what roadmap section 3 pins.
node -e "const p=require('./package.json');const want={next:'16.3.1',react:'19.2.8','react-dom':'19.2.8','next-auth':'5.0.0-beta.32','@auth/drizzle-adapter':'1.11.3','drizzle-orm':'0.45.2','@neondatabase/serverless':'1.1.0','@vercel/blob':'2.8.0','recharts':'3.10.1','zod':'4.4.3','@anthropic-ai/sdk':'0.117.1','browser-image-compression':'2.0.2'};const bad=Object.entries(want).filter(([k,v])=>p.dependencies[k]!==v);const tw=p.devDependencies.tailwindcss!=='4.3.3'||p.devDependencies['drizzle-kit']!=='0.31.10';if(bad.length||tw){console.error('MISMATCH',bad,{tailwindcss:p.devDependencies.tailwindcss,'drizzle-kit':p.devDependencies['drizzle-kit']});process.exit(1)}console.log('OK all pinned versions match roadmap section 3')"

# 2. All required npm scripts exist.
node -e "const s=require('./package.json').scripts;const need=['dev','build','lint','db:generate','db:migrate','db:studio'];const miss=need.filter(n=>!s[n]);if(miss.length){console.error('MISSING SCRIPTS',miss);process.exit(1)}console.log('OK scripts:',need.join(', '))"

# 3. Every directory from roadmap section 4 exists.
for d in app app/actions lib lib/db lib/llm lib/schema components; do [ -d "$d" ] || { echo "MISSING $d"; exit 1; }; done; echo "OK directory skeleton"

# 4. Tailwind is v4 CSS-first — no v3 config file anywhere.
[ ! -f tailwind.config.js ] && [ ! -f tailwind.config.ts ] && grep -q '@import' app/globals.css && grep -q '@theme' app/globals.css && echo "OK tailwind v4 CSS-first"

# 5. Secrets are not tracked; the example file is.
git ls-files | grep -qx '.env.example' && ! git ls-files | grep -q '^\.env\.local$' && echo "OK .env.example tracked, .env.local not"

# 6. No secret value ever entered git history.
git grep -I -l -E 'postgres(ql)?://[^ ]*:[^ @]+@' -- . ':!docs' ':!*.example' && { echo "LEAK: a connection string is committed"; exit 1; } || echo "OK no connection strings in tracked files"

# 7. Env module is server-only.
head -1 lib/env.ts | grep -q "server-only" && echo "OK lib/env.ts is server-only"

# 8. Lint, types, format.
npm run lint && npm run typecheck && npm run format:check

# 9. Production build succeeds.
npm run build

# 10. Neon is reachable on both connection strings.
npm run db:smoke
node --env-file=.env.local scripts/db-smoke.mjs --unpooled

# 11. drizzle-kit loads its config (schema-not-found is the expected F03 handoff).
npx drizzle-kit generate 2>&1 | tail -3

# 12. The live site is up, on the right env, talking to the right database.
curl -s https://expensetracking.online/api/health | grep -q '"ok":true' && echo "OK production health"
curl -s https://expensetracking.online/api/health | grep -q '"env":"production"' && echo "OK production env vars"
curl -sI https://www.expensetracking.online | grep -q '308' && echo "OK www redirects to apex"

# 13. The env guard is real (destructive check — restores itself).
cp .env.local .env.local.bak && sed -i 's/^DATABASE_URL=.*/DATABASE_URL=/' .env.local
npm run build 2>&1 | grep -q 'INVALID CORE ENVIRONMENT' && echo "OK build fails loudly on missing env"
mv .env.local.bak .env.local && npm run build >/dev/null && echo "OK build green again"
```

**Definition of done:** all thirteen blocks pass, and `git log --oneline` shows four or
more F01 commits.

---

## 4. Node runtime vs Edge runtime — the rule for this app

**Rule: every route in this application runs on the Node.js runtime. No file in this repo
may ever contain `export const runtime = 'edge'`.**

Node.js is the Next 16 default, so the rule is mostly about *not* opting out. Routes that
touch the database, the LLM, Blob, or auth additionally declare `export const runtime =
'nodejs'` explicitly, as documentation and as a guard against a later refactor.

| Surface | Runtime | Why |
|---|---|---|
| `proxy.ts` (F02, was `middleware.ts`) | **nodejs — not configurable** | Next 16 renamed `middleware` to `proxy`; the Edge runtime is *not supported* in `proxy` and the runtime cannot be changed. This alone removes the classic "split your Auth.js config so the edge middleware has no adapter" problem. |
| `app/api/auth/[...nextauth]/route.ts` (F02) | nodejs | Auth.js v5 + `@auth/drizzle-adapter` writes `users`/`accounts`/`sessions` rows on sign-in. Keeping it on Node means one `auth.ts` with the adapter attached, rather than the two-file `auth.config.ts` dance Edge forces. |
| `app/api/parse/route.ts` (F04) | nodejs, `maxDuration = 30` | `@anthropic-ai/sdk` against z.ai with a ~25 s timeout. Vercel Hobby allows up to **300 s** per function, so 30 s is comfortably inside the limit. Edge's shorter CPU/wall budgets and restricted stream handling buy nothing here. |
| `app/api/photos/upload/route.ts` (F06) | nodejs | `@vercel/blob` `handleUpload` callback. Client-side `upload()` sends the bytes directly to Blob storage, so this handler only signs and records — but it also writes an `expense_photos` row, which is a DB write. |
| Server Actions in `app/actions/*` | nodejs | Server Actions always run on the server runtime of their page. All of them do `requireUserId()` + scoped queries. |
| Page routes `/`, `/new`, `/m/[month]`, `/e/[id]`, `/stats`, `/s/[token]` | nodejs | RSCs that query Neon. |
| `app/api/health/route.ts` (F01) | nodejs, `dynamic = 'force-dynamic'` | Reads server-only env and queries Neon. |

**The Neon detail that decides it.** `@neondatabase/serverless@1.1.0` ships two transports:

- `neon(url)` — HTTP/fetch. Works on Node *and* Edge. One round trip per statement. This
  is what `drizzle-orm/neon-http` uses and what the health route and smoke script use.
- `Pool` / `Client` — WebSocket. Required for **interactive transactions** and sessions.
  This is what `drizzle-orm/neon-serverless` uses.

F03's `createExpense` inserts one `expense_groups` row plus N `expense_items` rows and must
be atomic, so it needs either a WebSocket transaction or the HTTP driver's batch
`transaction([...])` form. On Node ≥ 22 the WebSocket path needs **no** `ws` polyfill and
**no** `neonConfig.webSocketConstructor` — Node 22 provides a global `WebSocket`. That
polyfill-free path exists only on Node, which is a second, independent reason to stay off
Edge. (Vercel's Node runtime is pinned to 22.x in Task 26 precisely for this.)

**What Edge would actually cost us:** the `ws` polyfill back, a split Auth.js config, no
`crypto` Node APIs for F09's token minting, and a much lower request-body ceiling for
F06 — in exchange for cold-start latency savings that are irrelevant for a single-user
personal app. Not a trade worth making.

---

## Contract deltas

Deviations from `ROADMAP_v0.1.0.md` §4. Nothing in §4.1–§4.4, §4.6, §4.7 or §4.8 was
changed; the two entries below are additions, not redefinitions.

1. **New route handler `GET /api/health`, not listed in §4.5.**
   *What:* an unauthenticated JSON liveness probe returning `{ ok, db, now, latencyMs,
   llm: { baseUrl, model }, commit, env }`.
   *Why:* §4.5's three handlers all require either auth or an LLM call, so none of them can
   answer "did this deployment get the right env vars and the right database" — which is
   exactly the question every Vercel/DNS task in this plan needs answered, and the question
   you will ask again on every future deploy. It is also the only F01 consumer of
   `lib/env.ts`, which is what makes the boot-time env crash observable in Task 22.
   *Risk accepted:* the endpoint is public and reveals the database name, the LLM base URL
   and model, and the deployed commit SHA. It reveals no credential. If the integrator
   objects, the mitigation is to gate it behind a `?key=` compared against `AUTH_SECRET`,
   or delete the file after Task 32 — F01 is the only feature that depends on it.

2. **Three dependencies added beyond roadmap §3's pinned table.**
   §3 pins the stack; it does not claim to be exhaustive. Added:
   `nanoid@5.1.16` (roadmap §5 F03 explicitly requires a nanoid id helper but §3 never
   pins it — pinned here so the lockfile is complete from commit one),
   `server-only@0.0.1` (the mechanism that makes `lib/env.ts` un-importable from client
   components), and `dotenv@17.4.2` (dev-only; `drizzle.config.ts` runs outside Next and so
   cannot use Next's `.env.local` loading). Tooling versions not covered by §3
   (`typescript`, `eslint`, `prettier`, `@types/*`, `@tailwindcss/postcss`) are pinned to
   the versions this plan was validated against and listed in Task 4.

3. **`drizzle.config.ts` lives at the repo root and is owned by F01, not F03.**
   §4 does not assign this file. F01 owns it because F01 owns the `db:generate` /
   `db:migrate` / `db:studio` scripts that invoke it. It points at `./lib/db/schema.ts`,
   which is F03's file; that path is fixed and F03 must not move it.

**Not a delta, but a §5 correction F02 must absorb:** roadmap §5 F02 specifies
`middleware.ts`. In Next.js 16 the `middleware` file convention is deprecated and renamed
to **`proxy.ts`**, with the exported function renamed `middleware` → `proxy`, and the Edge
runtime is not supported there. F02 should write `proxy.ts` at the repo root. F01 creates
no such file, so this is a heads-up rather than a change to anything F01 ships.

---

## Interfaces I publish

Everything below is stable for the rest of v0.1.0. Other features import from these paths.

### `lib/env.ts` — the only sanctioned way to read `process.env`

```ts
import { env, authEnv, blobEnv, isProduction, isDevelopment } from '@/lib/env'
import type { CoreEnv, AuthEnv, BlobEnv } from '@/lib/env'
```

| Export | Type | Availability | Consumers |
|---|---|---|---|
| `env` | `{ NODE_ENV, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, DATABASE_URL, DATABASE_URL_UNPOOLED }` | validated eagerly at import — a missing var fails the **build** | F03 (`lib/db/client.ts` uses `env.DATABASE_URL`), F04 (`lib/llm/client.ts` uses `env.LLM_*`) |
| `authEnv()` | `() => { AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_URL? }` | validated on first call; **call it at module scope in `auth.ts`** so it still crashes at boot | F02 |
| `blobEnv()` | `() => { BLOB_READ_WRITE_TOKEN }` | validated on first call | F06 |
| `isProduction`, `isDevelopment` | `boolean` | — | anyone |
| `CoreEnv`, `AuthEnv`, `BlobEnv` | types | — | anyone |

**Contract for consumers:**
- Never read `process.env.<APP_VAR>` directly anywhere in `app/`, `lib/` or `components/`.
  Import from `@/lib/env`. (Vercel-injected build metadata such as `VERCEL_ENV` and
  `VERCEL_GIT_COMMIT_SHA` is exempt — it is not part of the app's contract.)
- `lib/env.ts` is `server-only`. Importing it from a `'use client'` file is a build error,
  by design. If you need a value in the browser, you have a design problem, not an env
  problem — pass it down as a prop from a Server Component.
- Adding a variable: add it to the right schema in `lib/env.ts`, to `.env.example`, and to
  all three Vercel environments. All three, or preview builds will fail.

### Build & tooling surface

| Command | Contract |
|---|---|
| `npm run dev` | Next 16 dev server on Turbopack, port 3000, loads `.env.local` |
| `npm run build` | Production build on Turbopack. **Fails if any core env var is missing.** |
| `npm run start` | Serves the production build |
| `npm run lint` / `lint:fix` | ESLint flat config (`next lint` does not exist in Next 16) |
| `npm run typecheck` | `next typegen && tsc --noEmit`. The `typegen` half is mandatory — `LayoutProps`/`PageProps`/`RouteContext` are generated types. |
| `npm run format` / `format:check` | Prettier + Tailwind class sorting |
| `npm run db:generate` | `drizzle-kit generate` → SQL into `drizzle/` (F03 supplies the schema) |
| `npm run db:migrate` | `drizzle-kit migrate` against `DATABASE_URL_UNPOOLED` |
| `npm run db:studio` | `drizzle-kit studio` |
| `npm run db:smoke` | Neon connectivity check; `-- --unpooled` for the direct string |

### Files other features build on

| Path | What F01 leaves there | Who takes it over |
|---|---|---|
| `app/layout.tsx` | root layout, `lang="id"`, `viewportFit: 'cover'` | F10 adds fonts, theme, `TabBar` |
| `app/globals.css` | `@import 'tailwindcss'` + placeholder `@theme` | F10 replaces the token values |
| `app/page.tsx` | placeholder | F02 |
| `drizzle.config.ts` | dialect/paths/credentials, expects `./lib/db/schema.ts` | F03 writes the schema |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `@/*` | nobody — do not loosen |
| `postcss.config.mjs` | `@tailwindcss/postcss` | nobody |
| `app/actions/`, `lib/db/`, `lib/llm/`, `lib/schema/`, `components/` | empty dirs with `.gitkeep` | F02–F10 |

### Deployment facts downstream plans can rely on

- Production origin: `https://expensetracking.online` (apex). `www` 308-redirects to it.
  **F02's Google OAuth redirect URI must therefore be
  `https://expensetracking.online/api/auth/callback/google`**, not the `www` form.
- Vercel Node.js runtime: **22.x**. Node ≥ 22 means no `ws` polyfill for the Neon
  WebSocket driver and a global `WebSocket`/`crypto`.
- Vercel Hobby function limit: **300 s** max duration. F04's ~25 s LLM timeout is safe.
- Git-integrated deploys: push to `main` → production; any other branch → preview.
- `AUTH_URL` is set **only** in production.

---

## Open questions for the integrator

**Q1 — The three real credentials are not in this plan.** 🔴 *Blocking Task 17.*
The brief said `.env.local` should be populated with the credentials the user supplied, but
**no credential values were present in this planning session's context**. `LLM_BASE_URL`
and `LLM_MODEL` are derivable from roadmap §3 and are filled in; `LLM_API_KEY`,
`DATABASE_URL` and `DATABASE_URL_UNPOOLED` are left as `<<PASTE …>>` markers. **Inventing
plausible-looking secrets would be worse than leaving a gap**, so they are gaps. Paste the
real values before running Task 17, or hand them to whoever executes this plan out of band.
Task 17's verification step (`grep -c '<<PASTE'` must print `0`) exists to catch a
forgotten paste.

Related, and worth flagging on its own: **a `.env.local` already exists in this repo**,
containing populated `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_SECRET` — written
while F02 was being planned, before F01 (which owns environment files) had run. Task 17 was
rewritten to be append-only because of it. Two consequences for the integrator: (a) the
Google OAuth client already exists, so F02's Google Cloud Console walkthrough may be a
verification pass rather than a creation pass — but its redirect URI must still be checked
against the apex origin (see *Deployment facts*); (b) those three values were created
outside F01's Vercel env flow, so Task 27 must push them to all three Vercel environments
too, or preview and production deploys will fail F02's boot check. Decide who owns
`.env.local` going forward — this plan assumes F01 does.

**Q2 — Is `glm-5.2` the exact model id on the z.ai Anthropic-compatible endpoint?**
The roadmap says "GLM-5.2" (a product name) and pins the base URL to
`https://api.z.ai/api/anthropic`. Public documentation shows both `glm-5.2` and a
long-context variant `glm-5.2[1m]`. This plan sets `LLM_MODEL=glm-5.2`. If the account's
plan exposes a different id, correct `.env.local` and the three Vercel environments — the
value is not hardcoded anywhere in the source, only in env. F04 should verify with a real
call before building on it. Given roadmap §4.3 caps input at 50 items, the 1M-context
variant is almost certainly unnecessary.

**Q3 — Should `/api/health` stay public, or ship at all?** See Contract delta 1. It leaks
the database name, LLM base URL, model id and commit SHA — no credentials. Options: keep it
public (recommended; it is genuinely useful on every future deploy), gate it behind a query
key, or delete it once Task 32 passes. Decide before F02, because F02's `proxy.ts` matcher
must explicitly *exclude* `/api/health` if it stays.

**Q4 — Neon region.** Not specified in the roadmap. For a Jakarta-based single user,
`ap-southeast-1` (Singapore) is the closest Neon region. If the Neon project was created in
`us-east-2` or similar, every query pays ~200 ms extra RTT and the app will feel sluggish
regardless of anything F03–F10 do. Check the host in `DATABASE_URL`; if it is not
`ap-southeast-1`, recreate the Neon project **now**, while there is no data to migrate. The
Vercel function region should be set to match (`sin1`) in Project Settings → Functions.

**Q5 — `noUncheckedIndexedAccess` is on.** It will make F03/F07/F08 write `rows[0]?.x` or
`rows[0]!` instead of `rows[0].x`. Worth it for a DB-heavy app in my judgement, but it is a
taste call that costs a small amount of ceremony in every query module. Say so now if you
want it off — changing it after F03 lands means touching every query.

**Q6 — Does a Vercel Blob store exist yet?** F06 needs one, and `BLOB_READ_WRITE_TOKEN` is
auto-injected only after a store is linked to the project. Creating it during F01 (Vercel
dashboard → Storage → Create → Blob → connect to `expense-tracking`) costs one minute and
means the variable is already present in all three environments when F06 starts. This plan
does not do it because it is out of F01's declared scope — but it is the cheapest possible
thing to do while you are already in the Vercel dashboard at Task 27.

**Q7 — ESLint 9 vs 10, TypeScript 5 vs 7.** ESLint 10 and TypeScript 7 (the native Go
compiler) are both released and both are *probably* fine, but neither was validated against
this exact dependency set. This plan pins `eslint@9.39.5` and `typescript@5.9.3`
deliberately. If you want the newer majors, do the upgrade as an isolated change after F01
is green, not during it.
