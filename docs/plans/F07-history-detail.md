# F07 — History, Detail & Editing

> Plan file for **F07** of Expense Tracking v0.1.0.
> Builds against `ROADMAP_v0.1.0.md` §4 (AUTHORITATIVE). Any divergence is declared in
> [`## Contract deltas`](#contract-deltas) at the bottom — there are exactly **two**, both additive.
>
> **Depends on:** F02 (auth), F03 (data layer). **Soft-depends on:** F10 (primitives), F06 (photos), F09 (share).
> **Unblocks:** F08 (stats), F09 (sharing).
> **Target device:** iPhone XS Max — 414×896 CSS px, `viewport-fit=cover`, safe-area insets, one thumb.

---

## 0. What this feature is, in one paragraph

F07 is the **home screen and the memory**. `/m/[month]` answers *"how much did I spend this month?"* with one
enormous number and a scannable, day-grouped list. `/e/[id]` answers *"what was that thing I bought, and what did
it look like?"* — items, categories, photos, and everything editable in place. Plus the 3-tab shell that every
authenticated screen sits inside. Nothing here parses text, uploads blobs, or draws charts; F07 is pure
read-and-edit over F03's data layer.

### Design tenets for this feature

1. **One number dominates the month screen.** Everything else is secondary type.
2. **Every mutation is one tap away and never blocks.** `useOptimistic` everywhere, no spinners over content.
3. **No confirm dialogs except for irreversible group deletion.** Item deletion uses undo, which is fewer taps
   and strictly safer than a modal you learn to dismiss without reading.
4. **The server is the only source of truth.** Optimistic state is a 200 ms lie that always reconciles.
5. **Never leak existence.** A group you do not own is `404`, never `403`.

---

## 1. Architecture decisions (decide once, here)

| # | Decision | Rationale |
|---|---|---|
| A1 | All authenticated screens live in a **route group `app/(shell)/`** that owns the tab bar. `/m`, `/e`, `/stats` move inside it. `/new` stays **outside** (full-screen composer, no tab bar). | One layout, one place for safe-area padding. `/new` is a modal-ish task flow; a tab bar there invites accidental exits mid-paste. |
| A2 | The tab bar **does** render on `/e/[id]`. Detail is a leaf of "Bulan Ini", not a separate destination. | Roadmap §4.6 lists 3 tabs; detail is not one of them. A back chevron in the detail header handles up-navigation. |
| A3 | Back from `/e/[id]` is a `<Link href={/m/${monthKeyOf(occurredOn)}}>`, **not** `router.back()`. | Deterministic. `router.back()` from a shared link or a hard refresh dumps the user out of the app. |
| A4 | Month math is **string math on `YYYY-MM`**, never `Date` arithmetic. Day labels parse `YYYY-MM-DD` as UTC midnight and read only `getUTC*`. | `date` columns are timezone-free (D10). Constructing local `Date`s reintroduces the TZ bug we deliberately avoided. |
| A5 | Indonesian month/day names are **hardcoded arrays**, not `Intl`. | Roadmap §5 forbids an i18n layer; ICU output varies across Node builds. Deterministic SSR output. |
| A6 | Month total is `SUM` of the group totals already returned by `getMonthGroups` — **no second query**. | Requirement: one query per month view. |
| A7 | Item deletion = **immediate server delete + undo that re-inserts**. Not a deferred timer. | A timer loses the write if the tab closes and needs flush-on-unmount plumbing. Immediate-delete is durable, has no races, and undo is one extra round trip nobody will notice. Cost: a new item id (see Contract delta CD-1 for `sortOrder`). |
| A8 | `deleteExpense` performs the `redirect()` **server-side** (see CD-2). | Redirecting client-side races the revalidation and can flash a 404 detail page. |
| A9 | Prev/next month chevrons use `<Link prefetch>` (explicit `true`), plus a `loading.tsx` skeleton. | These routes are dynamic; without explicit prefetch Next only fetches the loading boundary. Two extra small RSC payloads is a good trade for instant month paging. |
| A10 | Thumbnails use `next/image`. | Photos are ~300 KB originals (D2). Rendering 20 of them at 44 px through a plain `<img>` is 6 MB of mobile data. Requires one `next.config.ts` remote pattern (Task 3, coordinate with F06). |

---

## 2. File map (everything F07 creates or touches)

```
app/
  page.tsx                                  (TOUCH — signed-in redirect branch; F02 owns the signed-out half)
  (shell)/
    layout.tsx                              NEW   tab bar + toast provider + safe-area padding
    error.tsx                               NEW   segment error boundary
    m/
      [month]/
        page.tsx                            NEW   month view (server)
        loading.tsx                         NEW   skeleton matching the header
        not-found.tsx                       NEW   "bulan tidak ditemukan"
        MonthHeader.tsx                     NEW   sticky header (server) + MonthNavLink (client)
        GroupRow.tsx                        NEW   one tappable group row (server)
    e/
      [id]/
        page.tsx                            NEW   detail view (server)
        loading.tsx                         NEW
        not-found.tsx                       NEW
        error.tsx                           NEW
        ExpenseEditor.tsx                   NEW   client: optimistic meta + items, renders slots
        ItemSheet.tsx                       NEW   client: add/edit bottom sheet
        DeleteGroupSheet.tsx                NEW   client: destructive confirm
  actions/
    _guard.ts                               NEW   assertOwnedGroup / assertOwnedItem  (F06, F09 reuse)
    _revalidate.ts                          NEW   revalidateGroup                      (F06, F09 reuse)
    expenses.ts                             TOUCH updateExpenseMeta, deleteExpense (F05 owns createExpense)
    items.ts                                NEW   addItem, updateItem, deleteItem
components/
  nav/AppTabBar.tsx                         NEW   client, usePathname
  ui/Toast.tsx                              NEW   ToastProvider + useToast (published)
  category/CategoryChip.tsx                 NEW   published — F05/F08/F09 consume
  category/CategoryGrid.tsx                 NEW   published — the shared 2×4 picker
lib/
  month.ts                                  NEW   month-key math + Indonesian date labels (published)
  month.test.ts                             NEW
next.config.ts                              TOUCH images.remotePatterns for Vercel Blob
```

---

## 3. Prerequisites — verify before writing a line

Run this first. Every one of these must pass, or you are blocked on another feature.

```bash
cd /home/miftah/expense-tracking

# F01: app scaffold + format helpers
test -f lib/format.ts && grep -nE 'formatIdr|parseIdrLoose|todayJakartaISO|TZ' lib/format.ts

# F02: auth helper + middleware coverage
grep -rn 'requireUserId' lib/ auth.ts 2>/dev/null
grep -n "'/m'\|/m/\|matcher" middleware.ts

# F03: queries + schema
grep -nE 'getMonthGroups|getGroupDetail' lib/db/queries.ts
grep -nE 'expenseGroups|expenseItems|expensePhotos|shareLinks' lib/db/schema.ts

# F10: primitives (soft dep — see §Interfaces I consume for fallbacks)
ls components/ui/ 2>/dev/null
```

**Expected output:** non-empty matches for `formatIdr`, `requireUserId`, `getMonthGroups`, `getGroupDetail`,
and the four table exports. If `components/ui/` is missing, F10 has not landed — proceed anyway using the
fallback markup noted in each task, and open a follow-up to swap in the primitives.

Also confirm the exact shapes F03 returns:

```bash
sed -n '1,200p' lib/db/queries.ts
```

Compare against [`## Interfaces I consume`](#interfaces-i-consume). If `getMonthGroups` lacks `photoCount` /
`firstPhotoUrl`, or `getGroupDetail` lacks `shareToken`, **stop and raise it with F03's owner** — do not add a
second query in F07 (that is the N+1 this feature is explicitly forbidden from creating).

```bash
git checkout -b feat/f07-history-detail
git commit --allow-empty -m "chore(f07): start history, detail & editing"
```

---

## Task 1 — `lib/month.ts`: month-key math and Indonesian date labels

**File:** `lib/month.ts`

```ts
import { todayJakartaISO } from './format'

/** `YYYY-MM`, months 01–12 only. */
export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/
/** `YYYY-MM-DD`. Shape only — use isRealDateIso for calendar validity. */
export const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const

/** Parses a date-only ISO string as UTC midnight. Never use local-time getters on the result. */
function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export function isRealDateIso(iso: string): boolean {
  if (!DATE_ISO_RE.test(iso)) return false
  const d = utcDate(iso)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

/** Route-param validation for /m/[month]. Anything false must 404. */
export function isMonthKey(value: string): value is string {
  if (!MONTH_KEY_RE.test(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= 2000 && year <= 2100
}

/** 'YYYY-MM-DD' -> 'YYYY-MM'. Pure string slice; no Date involved. */
export function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7)
}

export function currentMonthKeyJakarta(): string {
  return todayJakartaISO().slice(0, 7)
}

/** Month arithmetic on the key itself. addMonths('2026-01', -1) === '2025-12'. */
export function addMonths(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const zeroBased = year * 12 + (month - 1) + delta
  const newYear = Math.floor(zeroBased / 12)
  const newMonth = zeroBased - newYear * 12 + 1
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`
}

/**
 * Zero-padded YYYY-MM sorts lexicographically in calendar order, so plain
 * string comparison is correct and allocation-free.
 */
export function isAfterCurrentMonth(monthKey: string): boolean {
  return monthKey > currentMonthKeyJakarta()
}

/** '2026-08' -> 'Agustus 2026' */
export function formatMonthLongId(monthKey: string): string {
  return `${MONTHS_ID[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(0, 4)}`
}

/** '2026-08' -> 'Agu 2026' — for tight spots (F08 chart axis). */
export function formatMonthShortId(monthKey: string): string {
  return `${MONTHS_ID[Number(monthKey.slice(5, 7)) - 1].slice(0, 3)} ${monthKey.slice(0, 4)}`
}

/** '2026-08-18' -> 'Selasa, 18 Agustus' — day headings inside a month list. */
export function formatDayHeadingId(dateIso: string): string {
  const d = utcDate(dateIso)
  return `${DAYS_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]}`
}

/** '2026-08-18' -> 'Selasa, 18 Agustus 2026' — the detail header. */
export function formatFullDateId(dateIso: string): string {
  const d = utcDate(dateIso)
  return `${DAYS_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
```

**File:** `lib/month.test.ts`

> If F04 already added `vitest`, reuse it. Otherwise: `npm i -D vitest` and add `"test": "vitest run"` to
> `package.json` scripts.

```ts
import { describe, expect, it } from 'vitest'
import {
  addMonths, formatDayHeadingId, formatFullDateId, formatMonthLongId,
  isMonthKey, isRealDateIso, monthKeyOf,
} from './month'

describe('isMonthKey', () => {
  it('accepts well-formed keys', () => {
    expect(isMonthKey('2026-08')).toBe(true)
    expect(isMonthKey('2026-01')).toBe(true)
    expect(isMonthKey('2026-12')).toBe(true)
  })
  it('rejects everything else', () => {
    for (const bad of ['2026-13', '2026-00', '2026-8', '26-08', '2026-08-18', 'agustus', '1999-08', '2101-01', '']) {
      expect(isMonthKey(bad)).toBe(false)
    }
  })
})

describe('addMonths', () => {
  it('crosses year boundaries in both directions', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-08', 0)).toBe('2026-08')
    expect(addMonths('2026-08', -12)).toBe('2025-08')
    expect(addMonths('2026-03', -14)).toBe('2025-01')
  })
})

describe('labels', () => {
  it('renders Indonesian names deterministically', () => {
    expect(formatMonthLongId('2026-08')).toBe('Agustus 2026')
    expect(formatDayHeadingId('2026-08-18')).toBe('Selasa, 18 Agustus')
    expect(formatFullDateId('2026-08-18')).toBe('Selasa, 18 Agustus 2026')
    expect(formatDayHeadingId('2026-01-01')).toBe('Kamis, 1 Januari')
  })
  it('is timezone-independent', () => {
    const previous = process.env.TZ
    process.env.TZ = 'Pacific/Kiritimati' // UTC+14, the worst case
    expect(formatDayHeadingId('2026-08-18')).toBe('Selasa, 18 Agustus')
    process.env.TZ = previous
  })
})

describe('validity + slicing', () => {
  it('rejects impossible calendar dates', () => {
    expect(isRealDateIso('2026-02-30')).toBe(false)
    expect(isRealDateIso('2026-13-01')).toBe(false)
    expect(isRealDateIso('2026-02-28')).toBe(true)
  })
  it('slices month keys', () => {
    expect(monthKeyOf('2026-08-18')).toBe('2026-08')
  })
})
```

**Run:**

```bash
npx vitest run lib/month.test.ts
```

**Expected output:** `Test Files 1 passed`, `Tests 4 passed` (or 8 if your runner counts `it` blocks — the point
is zero failures).

```bash
git add lib/month.ts lib/month.test.ts
git commit -m "feat(f07): month-key math and Indonesian date labels"
```

---

## Task 2 — Toast primitive (needed by undo)

**File:** `components/ui/Toast.tsx`

> F10's primitive list has no toast. F07 owns this one and publishes it.

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type ToastSpec = {
  message: string
  actionLabel?: string
  onAction?: () => void
  /** Default 4000. Undo toasts should pass 6000. */
  durationMs?: number
  tone?: 'neutral' | 'danger'
}

type ToastApi = { show: (spec: ToastSpec) => void; dismiss: () => void }

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { key: number }) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = useCallback((spec: ToastSpec) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ ...spec, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), spec.durationMs ?? 4000)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      >
        {toast && (
          <div
            key={toast.key}
            className={[
              'pointer-events-auto flex w-full max-w-[22rem] items-center gap-3 rounded-2xl px-4 py-3',
              'text-sm shadow-lg backdrop-blur',
              toast.tone === 'danger' ? 'bg-red-600/95 text-white' : 'bg-neutral-900/95 text-white',
            ].join(' ')}
          >
            <span className="min-w-0 flex-1 truncate">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="-my-2 -mr-2 min-h-11 shrink-0 rounded-xl px-3 font-semibold text-amber-300 active:opacity-60"
                onClick={() => { const run = toast.onAction; dismiss(); run?.() }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
```

Notes:
- The viewport sits **above** the tab bar (`4.5rem` bar + safe area), so undo is never covered by the home
  indicator or the raised "Tambah" button.
- The action button is `min-h-11` (44 px) even though the toast is 3 rem tall — negative margins keep the visual
  height while preserving the tap target.

```bash
git add components/ui/Toast.tsx
git commit -m "feat(f07): toast primitive with action slot"
```

---

## Task 3 — Navigation shell: route group, tab bar, `/` redirect, image config

### 3a. `components/nav/AppTabBar.tsx`

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  href: string
  label: string
  isActive: (pathname: string) => boolean
  raised?: boolean
  icon: (active: boolean) => React.ReactNode
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-7 w-7" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
      <path d="M5 20V11M12 20V4M19 20v-6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * `currentMonth` is computed on the server (Asia/Jakarta) and passed down so the
 * "Bulan Ini" tab always means *this* month even while the user browses June,
 * and so there is no client/server clock mismatch at hydration.
 */
export function AppTabBar({ currentMonth }: { currentMonth: string }) {
  const pathname = usePathname()

  const tabs: Tab[] = [
    {
      href: `/m/${currentMonth}`,
      label: 'Bulan Ini',
      isActive: (p) => p.startsWith('/m/') || p.startsWith('/e/'),
      icon: () => <CalendarIcon />,
    },
    {
      href: '/new',
      label: 'Tambah',
      isActive: (p) => p.startsWith('/new'),
      raised: true,
      icon: () => <PlusIcon />,
    },
    {
      href: '/stats',
      label: 'Statistik',
      isActive: (p) => p.startsWith('/stats'),
      icon: () => <ChartIcon />,
    },
  ]

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/85"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex h-[4.5rem] max-w-md items-stretch">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname)
          if (tab.raised) {
            return (
              <li key={tab.href} className="relative flex flex-1 items-start justify-center">
                <Link
                  href={tab.href}
                  aria-label={tab.label}
                  className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-black/20 transition-transform active:scale-95 dark:bg-white dark:text-neutral-900"
                >
                  {tab.icon(active)}
                </Link>
                <span className="absolute bottom-2 text-[0.6875rem] font-medium text-neutral-500">{tab.label}</span>
              </li>
            )
          }
          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-[0.6875rem] font-medium',
                  active ? 'text-neutral-900 dark:text-white' : 'text-neutral-400',
                ].join(' ')}
              >
                {tab.icon(active)}
                <span>{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

### 3b. `app/(shell)/layout.tsx`

```tsx
import type { ReactNode } from 'react'
import { AppTabBar } from '@/components/nav/AppTabBar'
import { ToastProvider } from '@/components/ui/Toast'
import { currentMonthKeyJakarta } from '@/lib/month'

/**
 * Every screen in this group is per-user and per-clock, so nothing here may be
 * cached across requests. Without this, the "Bulan Ini" href could be frozen at
 * the month the layout was first rendered.
 */
export const dynamic = 'force-dynamic'

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {/* 4.5rem bar + safe area, so the last list row is never under the tab bar */}
      <div className="min-h-[100dvh] pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <AppTabBar currentMonth={currentMonthKeyJakarta()} />
    </ToastProvider>
  )
}
```

### 3c. `app/(shell)/error.tsx`

```tsx
'use client'

export default function ShellError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-lg font-semibold">Ada yang tidak beres</p>
      <p className="text-sm text-neutral-500">Coba muat ulang halaman ini.</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-11 rounded-full bg-neutral-900 px-6 font-semibold text-white active:opacity-70 dark:bg-white dark:text-neutral-900"
      >
        Coba lagi
      </button>
    </div>
  )
}
```

### 3d. Move existing routes into the group

```bash
mkdir -p "app/(shell)"
# only if F08/F05 already created them at the old paths:
[ -d app/stats ] && git mv app/stats "app/(shell)/stats"
```

Route groups do **not** change URLs — `app/(shell)/m/[month]/page.tsx` still serves `/m/2026-08`.

### 3e. `app/page.tsx` — the signed-in redirect

F02 owns the signed-out landing. F07 owns only the redirect branch. Merge, do not overwrite:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { currentMonthKeyJakarta } from '@/lib/month'
// import { SignInLanding } from '@/components/auth/SignInLanding'  // F02

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const session = await auth()
  if (session?.user?.id) redirect(`/m/${currentMonthKeyJakarta()}`)
  return <SignInLanding />
}
```

### 3f. `next.config.ts` — blob thumbnails

Coordinate with F06; if this block already exists, skip.

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
  },
}

export default nextConfig
```

**Verify:**

```bash
npm run dev
# then, in another shell:
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/
```

**Expected output:** `307 http://localhost:3000/api/auth/signin?...` when signed out (middleware), or a redirect
toward `/m/<current month>` once signed in via the browser.

```bash
git add "app/(shell)" app/page.tsx components/nav/AppTabBar.tsx next.config.ts
git commit -m "feat(f07): shell route group, 3-tab safe-area bar, root redirect"
```

---

## Task 4 — `/m/[month]`: sticky header with the big number

**File:** `app/(shell)/m/[month]/MonthHeader.tsx`

```tsx
import Link from 'next/link'
import { addMonths, formatMonthLongId, isAfterCurrentMonth } from '@/lib/month'
import { formatIdr } from '@/lib/format'

/**
 * The month total is the single most important pixel in the app.
 * Shrink the type only when the string genuinely cannot fit 414px minus padding.
 */
function totalTypeClass(rendered: string): string {
  if (rendered.length <= 12) return 'text-[2.875rem]' // "Rp 266.350"
  if (rendered.length <= 15) return 'text-[2.375rem]' // "Rp 12.450.000"
  return 'text-[1.875rem]'                            // "Rp 1.234.567.890"
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
      <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MonthHeader({ month, totalIdr }: { month: string; totalIdr: number }) {
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  const nextDisabled = isAfterCurrentMonth(next)
  const rendered = formatIdr(totalIdr)

  return (
    <header
      className="sticky top-0 z-30 border-b border-black/5 bg-white/85 px-4 pb-4 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/85"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <div className="flex items-center justify-between">
        <Link
          href={`/m/${prev}`}
          prefetch
          aria-label={`Bulan sebelumnya, ${formatMonthLongId(prev)}`}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 active:bg-black/5 dark:active:bg-white/10"
        >
          <Chevron dir="left" />
        </Link>

        <h1 className="text-base font-semibold tracking-tight">{formatMonthLongId(month)}</h1>

        {nextDisabled ? (
          <span
            aria-disabled="true"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-300 dark:text-neutral-700"
          >
            <Chevron dir="right" />
          </span>
        ) : (
          <Link
            href={`/m/${next}`}
            prefetch
            aria-label={`Bulan berikutnya, ${formatMonthLongId(next)}`}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 active:bg-black/5 dark:active:bg-white/10"
          >
            <Chevron dir="right" />
          </Link>
        )}
      </div>

      <p className="mt-2 text-center text-xs font-medium uppercase tracking-widest text-neutral-400">
        Total pengeluaran
      </p>
      <p
        className={`mt-1 text-center font-semibold leading-none tracking-tight tabular-nums ${totalTypeClass(rendered)}`}
      >
        {rendered}
      </p>
    </header>
  )
}
```

Why the "next" chevron is a `<span>` and not a disabled `<button>`: it must not be focusable, must not navigate,
and must not fire a client transition. Rendering a non-interactive element is the simplest correct answer, and
`aria-disabled` keeps it announced.

```bash
git add "app/(shell)/m/[month]/MonthHeader.tsx"
git commit -m "feat(f07): sticky month header with large total and month chevrons"
```

---

## Task 5 — `/m/[month]`: group row

**File:** `app/(shell)/m/[month]/GroupRow.tsx`

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { formatIdr } from '@/lib/format'
import type { MonthGroupRow } from '@/lib/db/queries'

function PhotoBadge({ count, url, title }: { count: number; url: string | null; title: string }) {
  if (count === 0) {
    return <div className="h-11 w-11 shrink-0 rounded-xl bg-neutral-100 dark:bg-neutral-900" aria-hidden />
  }
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900">
      {url && (
        <Image
          src={url}
          alt=""
          fill
          sizes="44px"
          className="object-cover"
          /* decorative: the row is already labelled by its title */
        />
      )}
      {count > 1 && (
        <span
          className="absolute bottom-0 right-0 rounded-tl-md bg-black/65 px-1 text-[0.625rem] font-semibold leading-4 text-white"
          aria-label={`${count} foto pada ${title}`}
        >
          {count}
        </span>
      )}
    </div>
  )
}

export function GroupRow({ group }: { group: MonthGroupRow }) {
  return (
    <li>
      <Link
        href={`/e/${group.id}`}
        className="flex min-h-[4rem] items-center gap-3 px-4 py-3 transition-colors active:bg-black/5 dark:active:bg-white/5"
      >
        <PhotoBadge count={group.photoCount} url={group.firstPhotoUrl} title={group.title} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-medium">{group.title}</p>
          <p className="mt-0.5 text-[0.8125rem] text-neutral-500">
            {group.itemCount} item
            {group.photoCount > 0 && <span> · {group.photoCount} foto</span>}
          </p>
        </div>

        <p className="shrink-0 text-right text-[1.0625rem] font-semibold tabular-nums">
          {formatIdr(group.totalIdr)}
        </p>
      </Link>
    </li>
  )
}
```

The **whole row** is the `<Link>` — 414 px wide, ≥64 px tall. There is no separate chevron affordance; the row
is obviously tappable because it is a list on iOS.

---

## Task 6 — `/m/[month]`: the page, the empty state, the skeleton, the 404

**File:** `app/(shell)/m/[month]/page.tsx`

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { requireUserId } from '@/lib/auth'
import { getMonthGroups, type MonthGroupRow } from '@/lib/db/queries'
import { formatDayHeadingId, formatMonthLongId, isMonthKey } from '@/lib/month'
import { formatIdr } from '@/lib/format'
import { MonthHeader } from './MonthHeader'
import { GroupRow } from './GroupRow'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ month: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { month } = await params
  return { title: isMonthKey(month) ? formatMonthLongId(month) : 'Bulan tidak ditemukan' }
}

/**
 * getMonthGroups returns rows already sorted occurred_on DESC, created_at DESC,
 * so a single linear pass produces day buckets in the right order.
 */
function bucketByDay(rows: MonthGroupRow[]): Array<{ day: string; rows: MonthGroupRow[]; dayTotal: number }> {
  const buckets: Array<{ day: string; rows: MonthGroupRow[]; dayTotal: number }> = []
  for (const row of rows) {
    const last = buckets[buckets.length - 1]
    if (last && last.day === row.occurredOn) {
      last.rows.push(row)
      last.dayTotal += row.totalIdr
    } else {
      buckets.push({ day: row.occurredOn, rows: [row], dayTotal: row.totalIdr })
    }
  }
  return buckets
}

export default async function MonthPage({ params }: PageProps) {
  const { month } = await params
  if (!isMonthKey(month)) notFound()

  const userId = await requireUserId()
  const groups = await getMonthGroups(userId, month) // ← the ONLY query on this page

  const monthTotal = groups.reduce((sum, g) => sum + g.totalIdr, 0)
  const days = bucketByDay(groups)

  return (
    <main>
      <MonthHeader month={month} totalIdr={monthTotal} />

      {days.length === 0 ? (
        <EmptyMonth month={month} />
      ) : (
        <div className="pb-6">
          {days.map((bucket) => (
            <section key={bucket.day}>
              <h2 className="sticky top-[8.5rem] z-10 flex items-baseline justify-between bg-neutral-50/90 px-4 py-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-neutral-500 backdrop-blur dark:bg-neutral-900/90">
                <span>{formatDayHeadingId(bucket.day)}</span>
                <span className="tabular-nums normal-case tracking-normal">{formatIdr(bucket.dayTotal)}</span>
              </h2>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {bucket.rows.map((group) => (
                  <GroupRow key={group.id} group={group} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}

function EmptyMonth({ month }: { month: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
      <div className="mb-4 text-5xl" aria-hidden>🧾</div>
      <p className="text-base font-semibold">Belum ada pengeluaran di {formatMonthLongId(month)}</p>
      <p className="mt-1 max-w-[16rem] text-sm text-neutral-500">
        Tempel catatan belanjamu, biar dirapikan otomatis.
      </p>
      <Link
        href="/new"
        className="mt-6 inline-flex min-h-12 items-center rounded-full bg-neutral-900 px-6 font-semibold text-white active:opacity-70 dark:bg-white dark:text-neutral-900"
      >
        Tambah pengeluaran
      </Link>
    </div>
  )
}
```

> **`top-[8.5rem]` on the day heading** must equal the rendered height of `MonthHeader` on a 414 px viewport
> (safe-area top + 0.5 rem + chevron row 2.75 rem + label + big number + 1 rem bottom padding). Measure it in the
> QA pass (§QA step 3) and adjust the literal once; a wrong value makes day headings hide behind the header.
> If F10 exposes a `--header-h` token, use `top-[var(--header-h)]` instead.

**File:** `app/(shell)/m/[month]/loading.tsx`

```tsx
export default function MonthLoading() {
  return (
    <div className="animate-pulse">
      <div
        className="border-b border-black/5 px-4 pb-4 dark:border-white/10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div className="flex h-11 items-center justify-center">
          <div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <div className="mx-auto mt-3 h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mx-auto mt-3 h-10 w-52 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      </div>
      <div className="space-y-px pt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="h-11 w-11 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <div className="h-4 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**File:** `app/(shell)/m/[month]/not-found.tsx`

```tsx
import Link from 'next/link'
import { currentMonthKeyJakarta } from '@/lib/month'

export default function MonthNotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-lg font-semibold">Bulan tidak ditemukan</p>
      <p className="text-sm text-neutral-500">Alamatnya harus berbentuk /m/2026-08.</p>
      <Link
        href={`/m/${currentMonthKeyJakarta()}`}
        className="mt-3 min-h-11 rounded-full bg-neutral-900 px-6 py-3 font-semibold text-white dark:bg-white dark:text-neutral-900"
      >
        Ke bulan ini
      </Link>
    </div>
  )
}
```

**Verify:**

```bash
npm run dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/m/2026-13   # expect 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/m/agustus   # expect 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/m/2026-8    # expect 404
```

**Expected output:** `404` three times (signed out you may see `307` from middleware first — test these in the
browser while signed in, or with an authenticated cookie).

```bash
git add "app/(shell)/m"
git commit -m "feat(f07): month view with day buckets, empty state, skeleton, 404"
```

---

## Task 7 — Server-action foundations: ownership guard + revalidation helper

These two files are the security and freshness spine of the whole feature. F06 and F09 import them too.

**File:** `app/actions/_guard.ts`

```ts
import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { expenseGroups, expenseItems } from '@/lib/db/schema'

/**
 * Thrown when a row does not exist *or* is not owned by the caller. Callers must
 * never distinguish the two: leaking "this id exists but is not yours" is an
 * enumeration oracle. Pages translate this to notFound(); actions bubble it.
 */
export class NotFoundError extends Error {
  constructor() {
    super('NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export type OwnedGroup = { id: string; occurredOn: string }

/** F03's documented pattern: every read is filtered by users.id, always. */
export async function assertOwnedGroup(userId: string, groupId: string): Promise<OwnedGroup> {
  const [row] = await db
    .select({ id: expenseGroups.id, occurredOn: expenseGroups.occurredOn })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.id, groupId), eq(expenseGroups.userId, userId)))
    .limit(1)

  if (!row) throw new NotFoundError()
  return row
}

export type OwnedItem = { id: string; groupId: string; occurredOn: string }

/**
 * An item id from the client proves nothing. Join back to expense_groups.user_id
 * — this is the single most important security invariant in the app (§4.4).
 */
export async function assertOwnedItem(userId: string, itemId: string): Promise<OwnedItem> {
  const [row] = await db
    .select({
      id: expenseItems.id,
      groupId: expenseItems.groupId,
      occurredOn: expenseGroups.occurredOn,
    })
    .from(expenseItems)
    .innerJoin(expenseGroups, eq(expenseItems.groupId, expenseGroups.id))
    .where(and(eq(expenseItems.id, itemId), eq(expenseGroups.userId, userId)))
    .limit(1)

  if (!row) throw new NotFoundError()
  return row
}
```

**File:** `app/actions/_revalidate.ts`

```ts
import 'server-only'
import { revalidatePath } from 'next/cache'

/**
 * Revalidate every surface a group mutation can affect.
 *
 * Pass EVERY date the group has been associated with during this action — the
 * value read before the write and, if the date changed, the value written. A
 * date edit moves a group between months and BOTH month pages must be busted,
 * otherwise the old month keeps showing a stale total forever.
 *
 * Literal paths are used deliberately. `revalidatePath('/m/[month]', 'page')`
 * would invalidate every month the user has ever opened; we only want two.
 */
export function revalidateGroup(groupId: string, ...isoDates: Array<string | null | undefined>): void {
  revalidatePath(`/e/${groupId}`)

  const months = new Set<string>()
  for (const iso of isoDates) if (iso) months.add(iso.slice(0, 7))
  for (const month of months) revalidatePath(`/m/${month}`)

  // F08 aggregates over all months; cheap to bust, expensive to get wrong.
  revalidatePath('/stats')
}
```

> **Why not revalidate `/s/[token]`?** The action does not know the token, and adding a lookup to every write is
> waste. F09 renders `/s/[token]` dynamically (no ISR), so it is always fresh. This is recorded in
> [Open questions](#open-questions-for-the-integrator) — F09 must confirm.

```bash
git add app/actions/_guard.ts app/actions/_revalidate.ts
git commit -m "feat(f07): ownership guard and group revalidation helper"
```

---

## Task 8 — `app/actions/items.ts`

**File:** `app/actions/items.ts`

```ts
'use server'

import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { expenseItems } from '@/lib/db/schema'
import { newId } from '@/lib/db/ids'
import { requireUserId } from '@/lib/auth'
import { CATEGORIES } from '@/lib/categories'
import { assertOwnedGroup, assertOwnedItem } from './_guard'
import { revalidateGroup } from './_revalidate'

const NameZ = z.string().trim().min(1).max(120)
const AmountZ = z.number().int().min(0).max(1_000_000_000)
const CategoryZ = z.enum(CATEGORIES)

const AddItemZ = z.object({
  name: NameZ,
  amountIdr: AmountZ,
  category: CategoryZ,
  /** CD-1: lets "Urungkan" put a restored item back where it was. */
  sortOrder: z.number().int().min(0).max(9_999).optional(),
})

const UpdateItemZ = z
  .object({ name: NameZ.optional(), amountIdr: AmountZ.optional(), category: CategoryZ.optional() })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Patch kosong' })

async function nextSortOrder(groupId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${expenseItems.sortOrder}), -1)` })
    .from(expenseItems)
    .where(eq(expenseItems.groupId, groupId))
  return (row?.max ?? -1) + 1
}

export async function addItem(groupId: string, input: unknown): Promise<{ id: string }> {
  const userId = await requireUserId()
  const data = AddItemZ.parse(input)
  const group = await assertOwnedGroup(userId, groupId) // ← ownership BEFORE any write

  const id = newId()
  await db.insert(expenseItems).values({
    id,
    groupId,
    name: data.name,
    amountIdr: data.amountIdr,
    category: data.category,
    sortOrder: data.sortOrder ?? (await nextSortOrder(groupId)),
  })

  revalidateGroup(groupId, group.occurredOn)
  return { id }
}

export async function updateItem(id: string, input: unknown): Promise<void> {
  const userId = await requireUserId()
  const patch = UpdateItemZ.parse(input)
  const item = await assertOwnedItem(userId, id)

  // Scoped by BOTH id and the group we just proved ownership of, so even a
  // concurrent re-parent could not make this write escape the user's data.
  await db
    .update(expenseItems)
    .set(patch)
    .where(and(eq(expenseItems.id, id), eq(expenseItems.groupId, item.groupId)))

  revalidateGroup(item.groupId, item.occurredOn)
}

export async function deleteItem(id: string): Promise<void> {
  const userId = await requireUserId()
  const item = await assertOwnedItem(userId, id)

  await db
    .delete(expenseItems)
    .where(and(eq(expenseItems.id, id), eq(expenseItems.groupId, item.groupId)))

  revalidateGroup(item.groupId, item.occurredOn)
}
```

> **On transactions:** the Neon *HTTP* driver has no interactive transactions, so guard-then-write is two
> statements. That is safe here because **both** statements are independently scoped to the caller's data — the
> worst outcome of a race is a no-op write, never a cross-user write.

---

## Task 9 — `app/actions/expenses.ts` (F07's half)

**File:** `app/actions/expenses.ts` — add to the file F05 owns; do not remove `createExpense`.

```ts
'use server'

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { expenseGroups } from '@/lib/db/schema'
import { requireUserId } from '@/lib/auth'
import { isRealDateIso } from '@/lib/month'
import { assertOwnedGroup } from './_guard'
import { revalidateGroup } from './_revalidate'

// ... createExpense (F05) ...

const UpdateMetaZ = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    occurredOn: z.string().refine(isRealDateIso, { message: 'Tanggal tidak valid' }).optional(),
    /** null clears the note; '' is normalised to null below. */
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Patch kosong' })

export async function updateExpenseMeta(id: string, input: unknown): Promise<void> {
  const userId = await requireUserId()
  const patch = UpdateMetaZ.parse(input)

  // Read the CURRENT date before writing — this is the month the group is
  // leaving. Without it, a date edit silently strands a stale total.
  const before = await assertOwnedGroup(userId, id)

  await db
    .update(expenseGroups)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.occurredOn !== undefined ? { occurredOn: patch.occurredOn } : {}),
      ...(patch.note !== undefined ? { note: patch.note === '' ? null : patch.note } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(expenseGroups.id, id), eq(expenseGroups.userId, userId)))

  // BOTH months. If the date did not change, the Set in revalidateGroup dedupes
  // and only one path is busted.
  revalidateGroup(id, before.occurredOn, patch.occurredOn)
}

export async function deleteExpense(id: string): Promise<void> {
  const userId = await requireUserId()
  const group = await assertOwnedGroup(userId, id)

  // ON DELETE CASCADE removes items, photos and the share link (§4.2).
  await db.delete(expenseGroups).where(and(eq(expenseGroups.id, id), eq(expenseGroups.userId, userId)))

  revalidateGroup(id, group.occurredOn)

  // CD-2: redirect server-side. Must be OUTSIDE any try/catch — redirect()
  // signals by throwing, and swallowing it strands the user on a dead page.
  redirect(`/m/${group.occurredOn.slice(0, 7)}`)
}
```

**Verify types compile:**

```bash
npx tsc --noEmit
```

**Expected output:** no errors. (If `newId` lives at a different path, fix the import — F03 owns it.)

```bash
git add app/actions
git commit -m "feat(f07): item and expense-meta server actions with dual-month revalidation"
```

---

## Task 10 — The shared category chip + 2×4 picker

F07 owns these and publishes them. F05's review table and F09's read-only page consume them.

**File:** `components/category/CategoryChip.tsx`

```tsx
import { CATEGORY_META, type Category } from '@/lib/categories'

export function CategoryChip({
  category,
  size = 'sm',
}: {
  category: Category
  size?: 'sm' | 'md'
}) {
  const meta = CATEGORY_META[category]
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[0.6875rem]' : 'px-3 py-1 text-[0.8125rem]',
      ].join(' ')}
      style={{ backgroundColor: `color-mix(in oklab, var(${meta.colorVar}) 18%, transparent)`, color: `var(${meta.colorVar})` }}
    >
      <span aria-hidden>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  )
}
```

**File:** `components/category/CategoryGrid.tsx`

```tsx
'use client'

import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/categories'

/**
 * The shared 2×4 picker. Exactly 8 categories (§4.1), two columns, four rows —
 * every cell is ≥56px tall and reachable with one thumb on a 414px screen.
 */
export function CategoryGrid({
  value,
  onChange,
}: {
  value: Category
  onChange: (next: Category) => void
}) {
  return (
    <div role="radiogroup" aria-label="Kategori" className="grid grid-cols-2 gap-2">
      {CATEGORIES.map((category) => {
        const meta = CATEGORY_META[category]
        const selected = category === value
        return (
          <button
            key={category}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(category)}
            className={[
              'flex min-h-14 items-center gap-2 rounded-2xl border px-3 text-left text-[0.875rem] font-medium transition-colors active:scale-[0.98]',
              selected
                ? 'border-transparent ring-2 ring-neutral-900 dark:ring-white'
                : 'border-black/10 dark:border-white/10',
            ].join(' ')}
            style={selected ? { backgroundColor: `color-mix(in oklab, var(${meta.colorVar}) 16%, transparent)` } : undefined}
          >
            <span className="text-lg" aria-hidden>{meta.emoji}</span>
            <span className="min-w-0 truncate">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
```

```bash
git add components/category
git commit -m "feat(f07): shared category chip and 2x4 picker grid"
```

---

## Task 11 — `/e/[id]`: the server page

**File:** `app/(shell)/e/[id]/page.tsx`

```tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { requireUserId } from '@/lib/auth'
import { getGroupDetail } from '@/lib/db/queries'
import { ExpenseEditor } from './ExpenseEditor'
// F06 and F09 own these; F07 only slots them in.
import { PhotoSection } from '@/components/photos/PhotoSection'
import { ShareControl } from '@/components/share/ShareControl'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const userId = await requireUserId()
  const detail = await getGroupDetail(userId, id)
  return { title: detail?.title ?? 'Tidak ditemukan', robots: { index: false, follow: false } }
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { id } = await params
  const userId = await requireUserId()

  // getGroupDetail is userId-scoped, so a group owned by someone else returns
  // null and we 404. NEVER 403 — a 403 confirms the id exists.
  const detail = await getGroupDetail(userId, id)
  if (!detail) notFound()

  return (
    <ExpenseEditor
      groupId={detail.id}
      meta={{ title: detail.title, occurredOn: detail.occurredOn, note: detail.note }}
      items={detail.items}
      photoSlot={<PhotoSection groupId={detail.id} photos={detail.photos} />}
      shareSlot={<ShareControl groupId={detail.id} shareToken={detail.shareToken} title={detail.title} />}
    />
  )
}
```

> **Slots, not imports-in-client.** `PhotoSection` and `ShareControl` are rendered by this **server** component
> and handed to the client `ExpenseEditor` as `ReactNode` props. That keeps F06's and F09's server-side data
> access out of F07's client bundle and means F07 never needs to know whether they are server or client
> components. If either has not landed yet, pass `null` and wire it in Task 15.

**File:** `app/(shell)/e/[id]/not-found.tsx`

```tsx
import Link from 'next/link'
import { currentMonthKeyJakarta } from '@/lib/month'

export default function ExpenseNotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-lg font-semibold">Pengeluaran tidak ditemukan</p>
      <p className="text-sm text-neutral-500">Mungkin sudah dihapus.</p>
      <Link
        href={`/m/${currentMonthKeyJakarta()}`}
        className="mt-3 min-h-11 rounded-full bg-neutral-900 px-6 py-3 font-semibold text-white dark:bg-white dark:text-neutral-900"
      >
        Ke bulan ini
      </Link>
    </div>
  )
}
```

**File:** `app/(shell)/e/[id]/loading.tsx`

```tsx
export default function DetailLoading() {
  return (
    <div className="animate-pulse px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
      <div className="h-6 w-56 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-3 h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-6 h-9 w-44 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 flex-1 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-4 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**File:** `app/(shell)/e/[id]/error.tsx`

```tsx
'use client'

import Link from 'next/link'

export default function DetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-lg font-semibold">Gagal memuat pengeluaran</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="min-h-11 rounded-full bg-neutral-900 px-5 font-semibold text-white dark:bg-white dark:text-neutral-900">
          Coba lagi
        </button>
        <Link href="/" className="min-h-11 rounded-full border border-black/10 px-5 py-3 font-semibold dark:border-white/15">
          Kembali
        </Link>
      </div>
    </div>
  )
}
```

---

## Task 12 — `ExpenseEditor`: optimistic meta + items

This is the heart of F07. Read the **rollback contract** below before writing it.

### The optimistic contract (memorise this)

1. Every mutation runs inside **one** `startTransition(async () => { … })`.
2. The `useOptimistic` dispatch is the **first** statement inside that callback. Dispatching outside a
   transition throws in React 19.
3. React holds the optimistic value until the transition settles.
4. **Success:** the action calls `revalidatePath`, Next streams a fresh RSC payload for `/e/[id]` *within the
   same transition*, the new `items`/`meta` props arrive already matching the optimistic value, and React drops
   the overlay with no visible change. No flash, no spinner.
5. **Failure:** we `catch`, show a toast, and return. The transition settles with **unchanged props**, so React
   discards the optimistic overlay and the row visibly snaps back to the server value. That snap-back *is* the
   rollback — we never hand-roll a revert.
6. Therefore: never `await` the action outside the transition, and never keep a parallel `useState` mirror of
   server data (it would survive the rollback and desync).

**File:** `app/(shell)/e/[id]/ExpenseEditor.tsx`

```tsx
'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition, type ReactNode } from 'react'
import type { Category } from '@/lib/categories'
import { formatIdr } from '@/lib/format'
import { formatFullDateId, isRealDateIso, monthKeyOf } from '@/lib/month'
import { updateExpenseMeta } from '@/app/actions/expenses'
import { addItem, deleteItem, updateItem } from '@/app/actions/items'
import { CategoryChip } from '@/components/category/CategoryChip'
import { useToast } from '@/components/ui/Toast'
import { ItemSheet, type ItemValue } from './ItemSheet'
import { DeleteGroupSheet } from './DeleteGroupSheet'

export type EditableItem = {
  id: string
  name: string
  amountIdr: number
  category: Category
  sortOrder: number
}

export type EditableMeta = { title: string; occurredOn: string; note: string | null }

type ItemAction =
  | { type: 'update'; id: string; patch: Partial<EditableItem> }
  | { type: 'delete'; id: string }
  | { type: 'insert'; item: EditableItem }

function reduceItems(state: EditableItem[], action: ItemAction): EditableItem[] {
  switch (action.type) {
    case 'update':
      return state.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i))
    case 'delete':
      return state.filter((i) => i.id !== action.id)
    case 'insert':
      // Keep server ordering (sort_order ASC) so an undone item lands back in place.
      return [...state, action.item].sort((a, b) => a.sortOrder - b.sortOrder)
  }
}

export function ExpenseEditor({
  groupId,
  meta,
  items,
  photoSlot,
  shareSlot,
}: {
  groupId: string
  meta: EditableMeta
  items: EditableItem[]
  photoSlot?: ReactNode
  shareSlot?: ReactNode
}) {
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [optimisticItems, applyItem] = useOptimistic(items, reduceItems)
  const [optimisticMeta, applyMeta] = useOptimistic(
    meta,
    (state: EditableMeta, patch: Partial<EditableMeta>) => ({ ...state, ...patch }),
  )

  const [editing, setEditing] = useState<EditableItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const total = optimisticItems.reduce((sum, i) => sum + i.amountIdr, 0)
  const nextSortOrder = optimisticItems.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1

  // ---- meta -------------------------------------------------------------

  function commitMeta(patch: Partial<EditableMeta>, failureMessage: string) {
    startTransition(async () => {
      applyMeta(patch)
      try {
        await updateExpenseMeta(groupId, patch)
      } catch {
        toast.show({ message: failureMessage, tone: 'danger' })
      }
    })
  }

  function handleTitle(next: string) {
    const trimmed = next.trim()
    if (!trimmed || trimmed === optimisticMeta.title) return
    commitMeta({ title: trimmed }, 'Judul gagal disimpan.')
  }

  function handleDate(next: string) {
    if (!isRealDateIso(next) || next === optimisticMeta.occurredOn) return
    commitMeta({ occurredOn: next }, 'Tanggal gagal disimpan.')
  }

  function handleNote(next: string) {
    const trimmed = next.trim()
    if (trimmed === (optimisticMeta.note ?? '')) return
    commitMeta({ note: trimmed === '' ? null : trimmed }, 'Catatan gagal disimpan.')
  }

  // ---- items ------------------------------------------------------------

  function handleItemSave(target: EditableItem, value: ItemValue) {
    setEditing(null)
    const patch: Partial<EditableItem> = {}
    if (value.name !== target.name) patch.name = value.name
    if (value.amountIdr !== target.amountIdr) patch.amountIdr = value.amountIdr
    if (value.category !== target.category) patch.category = value.category
    if (Object.keys(patch).length === 0) return

    startTransition(async () => {
      applyItem({ type: 'update', id: target.id, patch })
      try {
        await updateItem(target.id, patch)
      } catch {
        toast.show({ message: 'Perubahan gagal disimpan.', tone: 'danger' })
      }
    })
  }

  function handleItemAdd(value: ItemValue) {
    setAdding(false)
    const sortOrder = nextSortOrder
    startTransition(async () => {
      applyItem({
        type: 'insert',
        item: { id: `optimistic-${sortOrder}-${Date.now()}`, ...value, sortOrder },
      })
      try {
        await addItem(groupId, { ...value, sortOrder })
      } catch {
        toast.show({ message: 'Item gagal ditambahkan.', tone: 'danger' })
      }
    })
  }

  /**
   * Delete happens immediately on the server; "Urungkan" re-inserts with the
   * original sortOrder (CD-1) so the row returns to its old position. The
   * restored row gets a new id — harmless, nothing references item ids.
   */
  function handleItemDelete(target: EditableItem) {
    setEditing(null)
    startTransition(async () => {
      applyItem({ type: 'delete', id: target.id })
      try {
        await deleteItem(target.id)
      } catch {
        toast.show({ message: 'Item gagal dihapus.', tone: 'danger' })
        return
      }
      toast.show({
        message: `"${target.name}" dihapus`,
        actionLabel: 'Urungkan',
        durationMs: 6000,
        onAction: () => restoreItem(target),
      })
    })
  }

  function restoreItem(target: EditableItem) {
    startTransition(async () => {
      applyItem({ type: 'insert', item: { ...target, id: `restored-${target.id}` } })
      try {
        await addItem(groupId, {
          name: target.name,
          amountIdr: target.amountIdr,
          category: target.category,
          sortOrder: target.sortOrder,
        })
      } catch {
        toast.show({ message: 'Gagal mengurungkan.', tone: 'danger' })
      }
    })
  }

  // ---- render -----------------------------------------------------------

  const backHref = `/m/${monthKeyOf(optimisticMeta.occurredOn)}`

  return (
    <main className="pb-8">
      <header
        className="sticky top-0 z-30 flex items-center gap-1 border-b border-black/5 bg-white/85 px-2 pb-2 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/85"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <Link
          href={backHref}
          aria-label="Kembali ke daftar bulan"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 active:bg-black/5 dark:active:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-neutral-500">
          {optimisticMeta.title}
        </p>
        <div className="h-11 w-11 shrink-0" aria-hidden />
      </header>

      <section className="px-4 pt-4">
        <TitleField value={optimisticMeta.title} onCommit={handleTitle} />
        <DateField value={optimisticMeta.occurredOn} onChange={handleDate} />
        <p className="mt-4 text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums">
          {formatIdr(total)}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="px-4 pb-1 text-[0.75rem] font-semibold uppercase tracking-wide text-neutral-400">
          {optimisticItems.length} item
        </h2>
        <ul className="divide-y divide-black/5 dark:divide-white/5">
          {optimisticItems.map((item) => (
            <li key={item.id} className="flex items-stretch">
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="flex min-h-[3.75rem] flex-1 items-center gap-3 px-4 py-2 text-left active:bg-black/5 dark:active:bg-white/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem]">{item.name}</span>
                  <span className="mt-1 block">
                    <CategoryChip category={item.category} />
                  </span>
                </span>
                <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums">
                  {formatIdr(item.amountIdr)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Hapus ${item.name}`}
                onClick={() => handleItemDelete(item)}
                className="flex w-11 shrink-0 items-center justify-center text-neutral-300 active:text-red-500 dark:text-neutral-600"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 flex min-h-[3.25rem] w-full items-center gap-2 px-4 text-left text-[0.9375rem] font-medium text-neutral-500 active:bg-black/5 dark:active:bg-white/5"
        >
          <span className="text-lg leading-none" aria-hidden>+</span> Tambah item
        </button>
      </section>

      <section className="mt-6 px-4">
        <NoteField value={optimisticMeta.note ?? ''} onCommit={handleNote} />
      </section>

      {photoSlot && <section className="mt-8">{photoSlot}</section>}
      {shareSlot && <section className="mt-8 px-4">{shareSlot}</section>}

      <section className="mt-10 px-4">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="min-h-12 w-full rounded-2xl border border-red-500/25 text-[0.9375rem] font-semibold text-red-600 active:bg-red-500/10"
        >
          Hapus pengeluaran ini
        </button>
      </section>

      {/* key= resets the sheet's internal draft whenever the target changes */}
      <ItemSheet
        key={editing ? `edit-${editing.id}` : adding ? 'add' : 'closed'}
        open={Boolean(editing) || adding}
        heading={editing ? 'Ubah item' : 'Item baru'}
        initial={editing ? { name: editing.name, amountIdr: editing.amountIdr, category: editing.category } : null}
        onClose={() => { setEditing(null); setAdding(false) }}
        onSubmit={(value) => (editing ? handleItemSave(editing, value) : handleItemAdd(value))}
        onDelete={editing ? () => handleItemDelete(editing) : undefined}
      />

      <DeleteGroupSheet
        open={confirmingDelete}
        groupId={groupId}
        title={optimisticMeta.title}
        onClose={() => setConfirmingDelete(false)}
      />
    </main>
  )
}

// --------------------------------------------------------------------------
// Local field components — kept in this file so they share the editor's props
// shape and never need their own optimistic state.
// --------------------------------------------------------------------------

function TitleField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim()) onCommit(draft)
        else setDraft(value) // empty is not a valid title; revert silently
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      enterKeyHint="done"
      maxLength={120}
      aria-label="Judul pengeluaran"
      className="w-full bg-transparent text-[1.5rem] font-semibold leading-tight tracking-tight outline-none placeholder:text-neutral-300"
      placeholder="Tanpa judul"
    />
  )
}

/**
 * A transparent native date input laid over the pretty Indonesian label. Tapping
 * anywhere on the text opens the iOS wheel picker; the label stays in our
 * format instead of Safari's dd/mm/yyyy.
 */
function DateField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="relative mt-1 inline-flex min-h-11 items-center">
      <span className="text-[0.9375rem] text-neutral-500 underline decoration-dotted underline-offset-4">
        {formatFullDateId(value)}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
        aria-label="Tanggal pengeluaran"
        className="absolute inset-0 h-full w-full opacity-0"
        style={{ WebkitAppearance: 'none', fontSize: '16px' }}
      />
    </div>
  )
}

function NoteField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      rows={2}
      maxLength={2000}
      placeholder="Catatan (opsional)"
      aria-label="Catatan"
      className="w-full resize-none rounded-2xl border border-black/10 bg-transparent p-3 text-[1rem] outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10"
    />
  )
}
```

> **16 px minimum on every input** (`text-[1rem]`, and an explicit `fontSize: '16px'` on the invisible date
> input). Anything smaller makes Safari zoom the whole viewport on focus and the user has to pinch back out.

---

## Task 13 — `ItemSheet`: the tap-to-edit bottom sheet

**File:** `app/(shell)/e/[id]/ItemSheet.tsx`

```tsx
'use client'

import { useState } from 'react'
import type { Category } from '@/lib/categories'
import { formatIdr, parseIdrLoose } from '@/lib/format'
import { CategoryGrid } from '@/components/category/CategoryGrid'

export type ItemValue = { name: string; amountIdr: number; category: Category }

export function ItemSheet({
  open,
  heading,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean
  heading: string
  initial: ItemValue | null
  onClose: () => void
  onSubmit: (value: ItemValue) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [amountText, setAmountText] = useState(initial ? String(initial.amountIdr) : '')
  const [category, setCategory] = useState<Category>(initial?.category ?? 'other')

  if (!open) return null

  // parseIdrLoose accepts 45k / 45rb / 1,5jt / Rp 38.500 / 38500 (§4.7)
  const amountIdr = parseIdrLoose(amountText)
  const canSubmit = name.trim().length > 0 && amountIdr !== null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={heading}>
      <button type="button" aria-label="Tutup" onClick={onClose} className="absolute inset-0 bg-black/40" />

      <div
        className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white p-4 dark:bg-neutral-950"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" aria-hidden />
        <h2 className="mb-3 text-center text-[0.9375rem] font-semibold">{heading}</h2>

        <label className="block">
          <span className="text-[0.75rem] font-medium uppercase tracking-wide text-neutral-400">Nama</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoFocus={!initial}
            enterKeyHint="next"
            placeholder="roti buaya"
            className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[1rem] outline-none focus:border-neutral-400 dark:border-white/10"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[0.75rem] font-medium uppercase tracking-wide text-neutral-400">Jumlah</span>
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="45k"
            className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[1.125rem] tabular-nums outline-none focus:border-neutral-400 dark:border-white/10"
          />
          <span className="mt-1 block h-4 text-[0.75rem] text-neutral-500">
            {amountText && (amountIdr === null ? 'Jumlah tidak dikenali' : formatIdr(amountIdr))}
          </span>
        </label>

        <div className="mt-3">
          <span className="text-[0.75rem] font-medium uppercase tracking-wide text-neutral-400">Kategori</span>
          <div className="mt-2">
            <CategoryGrid value={category} onChange={setCategory} />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-12 shrink-0 rounded-2xl border border-red-500/25 px-4 font-semibold text-red-600 active:bg-red-500/10"
            >
              Hapus
            </button>
          )}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => canSubmit && onSubmit({ name: name.trim(), amountIdr: amountIdr!, category })}
            className="min-h-12 flex-1 rounded-2xl bg-neutral-900 font-semibold text-white disabled:opacity-40 active:opacity-70 dark:bg-white dark:text-neutral-900"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}
```

> If F10 ships a `Sheet` primitive with backdrop, drag-to-dismiss and focus trapping, replace the outer two
> `div`s with `<Sheet open onClose title={heading}>` and keep the body verbatim. The markup above is the
> fallback so F07 is not blocked on F10.

---

## Task 14 — `DeleteGroupSheet`: the one confirm in the app

**File:** `app/(shell)/e/[id]/DeleteGroupSheet.tsx`

```tsx
'use client'

import { useTransition } from 'react'
import { deleteExpense } from '@/app/actions/expenses'

export function DeleteGroupSheet({
  open,
  groupId,
  title,
  onClose,
}: {
  open: boolean
  groupId: string
  title: string
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Hapus pengeluaran">
      <button type="button" aria-label="Batal" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 text-center dark:bg-neutral-950"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" aria-hidden />
        <p className="text-base font-semibold">Hapus &ldquo;{title}&rdquo;?</p>
        <p className="mt-1 text-sm text-neutral-500">
          Semua item dan foto di dalamnya ikut terhapus. Tidak bisa dibatalkan.
        </p>

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            // NO try/catch: deleteExpense ends in redirect(), which signals by
            // throwing. Catching it would strand the user on a deleted page.
            startTransition(async () => { await deleteExpense(groupId) })
          }}
          className="mt-5 min-h-12 w-full rounded-2xl bg-red-600 font-semibold text-white disabled:opacity-60 active:opacity-80"
        >
          {isPending ? 'Menghapus…' : 'Hapus'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-12 w-full rounded-2xl font-semibold text-neutral-500"
        >
          Batal
        </button>
      </div>
    </div>
  )
}
```

```bash
npx tsc --noEmit && npm run lint
git add "app/(shell)/e"
git commit -m "feat(f07): expense detail with optimistic editing, undo delete, confirm sheet"
```

---

## Task 15 — Wire F06 photos and F09 share

Both are slots on `/e/[id]/page.tsx`. When each feature lands:

```bash
grep -rn 'export function PhotoSection\|export function PhotoGallery\|export function PhotoPicker' components/photos/
grep -rn 'export function ShareControl' components/share/
```

- If F06 exports `PhotoGallery` + `PhotoPicker` separately instead of one `PhotoSection`, compose them inline in
  `page.tsx`:

  ```tsx
  photoSlot={
    <>
      <PhotoGallery photos={detail.photos} />
      <PhotoPicker groupId={detail.id} />
    </>
  }
  ```

- F06's `attachPhoto` / `deletePhoto` **must call `revalidateGroup(groupId, occurredOn)`** from
  `app/actions/_revalidate.ts`, otherwise the month row's photo badge goes stale. Add it if missing.
- F09's `createShareLink` / `revokeShareLink` must call `revalidatePath('/e/' + groupId)` for the same reason.

Do **not** reimplement a gallery, a lightbox, a compressor, or a share sheet inside F07.

```bash
git add app "components"
git commit -m "feat(f07): slot in photo gallery and share control"
```

---

## Task 16 — Navigation polish

1. **Prefetch check.** With `next@16.3.1`, open DevTools → Network on `/m/2026-08` and confirm two RSC requests
   fire on load (`/m/2026-07?_rsc=…` and `/m/2026-09?_rsc=…`). If they do not, the `prefetch` prop semantics
   changed — re-read the Next 16 `Link` docs and set the value that forces a full prefetch of a dynamic route.
2. **Pending affordance.** Optionally wrap the chevron content in a child component using `useLinkStatus()` so
   a slow month shows a subtle spinner in the chevron instead of dead air:

   ```tsx
   'use client'
   import { useLinkStatus } from 'next/link'
   export function ChevronPending({ children }: { children: React.ReactNode }) {
     const { pending } = useLinkStatus()
     return <span className={pending ? 'opacity-40' : undefined}>{children}</span>
   }
   ```

   `useLinkStatus` only works in a component rendered **inside** the `<Link>`.
3. **Scroll restoration.** Next restores scroll on back-navigation by default. Verify month → detail → back
   returns to the same row (QA step 12).
4. **No full reloads.** In DevTools, month paging must produce `?_rsc=` fetches only — never a document
   navigation. A document navigation means an `<a>` slipped in where a `<Link>` belongs.

```bash
git add -A && git commit -m "feat(f07): month prefetch and pending affordances"
```

---

## Task 17 — Security pass (do not skip)

```bash
# 1. Every action file must start from requireUserId()
grep -n 'export async function' app/actions/items.ts app/actions/expenses.ts
grep -c 'requireUserId()' app/actions/items.ts   # expect 3
grep -c 'requireUserId()' app/actions/expenses.ts # expect 3 (incl. F05's createExpense)

# 2. No raw db write in F07 code that is not preceded by an assertOwned* call
grep -n 'db.update\|db.delete\|db.insert' app/actions/*.ts
```

**Expected output:** every `db.update` / `db.delete` / `db.insert` in `items.ts` and the F07 half of
`expenses.ts` appears after an `assertOwnedGroup` or `assertOwnedItem` on the preceding lines, and every
`.where(...)` contains either `expenseGroups.userId` or the proven `groupId`.

**Live cross-user test** (needs two Google accounts):

1. Sign in as account A, create an expense, copy its id from the URL.
2. Sign in as account B in a private window, open `/e/<A's id>`.
   **Expected:** the "Pengeluaran tidak ditemukan" 404 page. **Not** a 403, not an error stack, not a blank page.
3. Still as B, in the console: `fetch` is not enough — use React DevTools or simply confirm via step 2. If you
   want the action-level test, temporarily add a button that calls `updateItem('<A's item id>', { name: 'x' })`
   and confirm it throws `NOT_FOUND` and A's data is unchanged. Remove the button afterwards.

```bash
git commit --allow-empty -m "test(f07): cross-user 404 verified for /e/[id] and item actions"
```

---

## The revalidation matrix (section C, in one table)

| Action | Reads before write | Revalidates | Why |
|---|---|---|---|
| `addItem(groupId, …)` | `assertOwnedGroup` → `occurredOn` | `/e/{groupId}`, `/m/{occurredOn[0:7]}`, `/stats` | Group total and item count both change |
| `updateItem(id, …)` | `assertOwnedItem` → `groupId`, `occurredOn` | `/e/{groupId}`, `/m/{occurredOn[0:7]}`, `/stats` | Amount change moves the month total; category change moves the donut |
| `deleteItem(id)` | `assertOwnedItem` → `groupId`, `occurredOn` | `/e/{groupId}`, `/m/{occurredOn[0:7]}`, `/stats` | Same |
| `updateExpenseMeta(id, { title })` | `assertOwnedGroup` → `occurredOn` | `/e/{id}`, `/m/{occurredOn[0:7]}`, `/stats` | Title shows in the month row |
| `updateExpenseMeta(id, { occurredOn })` | `assertOwnedGroup` → **old** `occurredOn` | `/e/{id}`, `/m/{old[0:7]}`, **`/m/{new[0:7]}`**, `/stats` | The group leaves one month and joins another. **Both** must be busted. `revalidateGroup` dedupes when they are the same month. |
| `deleteExpense(id)` | `assertOwnedGroup` → `occurredOn` | `/e/{id}`, `/m/{occurredOn[0:7]}`, `/stats`, then `redirect` | Detail path is busted so a cached RSC entry cannot render a ghost |
| F06 `attachPhoto` / `deletePhoto` | F06's guard | must call `revalidateGroup(groupId, occurredOn)` | Photo badge on the month row |
| F09 `createShareLink` / `revokeShareLink` | F09's guard | `revalidatePath('/e/' + groupId)` | Share button state |

**How the month path is computed from a possibly-changed date:** `revalidateGroup` is variadic and takes *both*
the pre-write date (from the ownership guard, which always runs before the write) and the post-write date (from
the validated patch, `undefined` when the date was not touched). It slices each to `YYYY-MM`, pushes them into a
`Set`, and revalidates each distinct month exactly once. There is no code path where the old month is not read,
because the ownership guard that returns it is mandatory.

**Client-cache note:** a Server Action response carries the re-rendered RSC payload for the page the user is on,
so `/e/[id]` updates without an extra round trip. `revalidatePath('/m/…')` additionally evicts that month's entry
from the client Router Cache, so navigating back shows fresh data rather than the pre-edit snapshot. This is the
mechanism that makes QA step 9 (move an expense between months) pass.

---

## Manual QA script — iPhone XS Max, 414 × 896

Set up Chrome DevTools: Device Toolbar → Responsive → **414 × 896**, DPR 3, and throttle to **Fast 3G** for the
optimistic-UI steps. Better: run it on a real iPhone via `npm run dev -- -H 0.0.0.0` and your LAN IP, because
safe-area insets and the native date wheel do not exist in DevTools.

| # | Step | Expected result |
|---|---|---|
| 1 | Sign in, land on `/` | Redirected to `/m/<current Jakarta month>`. URL shows e.g. `/m/2026-08`. |
| 2 | Fresh account, no data | Empty state: 🧾, "Belum ada pengeluaran di Agustus 2026", and a **Tambah pengeluaran** button. Month total reads `Rp 0`. Tab bar visible above the home indicator, not under it. |
| 3 | Populate: add 3 expenses on two different days (via `/new`), return to `/m` | Big total = sum of all three. Two day sections, newest day first, headings read "Selasa, 18 Agustus" style. **Scroll the list** — day headings stick directly under the month header with no overlap and no gap. If they overlap, fix the `top-[8.5rem]` literal in `page.tsx`. |
| 4 | Inspect a row that has photos | 44 px rounded thumbnail on the left, count badge bottom-right when >1, "N item · M foto" subtitle, right-aligned bold total. |
| 5 | Tap the prev chevron repeatedly | Month changes with **no white flash and no document reload** (Network tab: only `?_rsc=` requests). Empty past months show the empty state. |
| 6 | Tap the next chevron until you reach the current month | The next chevron greys out and stops responding. You can never navigate into the future. |
| 7 | Address bar → `/m/2026-13`, then `/m/agustus`, then `/m/2026-8` | All three render the "Bulan tidak ditemukan" page. HTTP status 404. |
| 8 | Tap anywhere on a group row | Navigates to `/e/<id>`. Header shows back chevron + truncated title; body shows editable title, Indonesian full date, big total, item list with category chips. Tab bar still present, "Bulan Ini" still the active tab. |
| 9 | **Edit an amount.** Tap an item row → sheet opens → change Jumlah to `45k` → Simpan | Sheet closes instantly. The row **and** the big total update *before* the network settles (visible on Fast 3G). No spinner. After the response lands nothing flickers. Go back to `/m` — the group total and the month total both reflect the change. |
| 10 | **Change a category.** Tap an item → tap a different tile in the 2×4 grid → Simpan | Grid is 2 columns × 4 rows, all 8 categories, every tile ≥56 px. The chip on the row changes colour and label immediately. |
| 11 | **Move an expense to a different month.** On `/e/<id>` tap the date → iOS wheel opens → pick a date in the **previous** month → confirm | Date label re-renders in Indonesian. Back chevron now points at the *new* month. Tap back → you land on the new month's page and the expense is listed there with the month total increased. Now tap the next chevron to the **original** month → the expense is **gone** and that month's total has decreased by exactly its amount. *(This is the dual-revalidation test. If the old month still shows the group, `revalidateGroup` is not receiving the pre-write date.)* |
| 12 | Browser back from detail to a long month list | Scroll position is restored to the row you tapped. |
| 13 | **Delete an item and undo.** Tap the trailing ✕ on an item | Row disappears immediately, total drops, a dark toast appears **above** the tab bar: `"roti buaya" dihapus` + **Urungkan**. |
| 14 | Tap **Urungkan** within 6 s | The row reappears **in its original position** (not at the bottom), total restored. Reload the page — it is still there. |
| 15 | Delete another item and let the toast expire | Toast fades after ~6 s. Reload — the item is gone for good. |
| 16 | **Failure rollback.** DevTools → Network → Offline. Tap an item, change the amount, Simpan | The row updates optimistically, then **snaps back** to the old amount within a second or two, and a red toast reads "Perubahan gagal disimpan." Nothing is left in a half-edited state. Go back online and repeat — it works. |
| 17 | Edit the title inline: tap the big title, type, tap elsewhere | Saves on blur. Return to `/m` — the row shows the new title. Clearing the title entirely and blurring reverts to the previous title (empty titles are rejected client- and server-side). |
| 18 | Type a note, blur, reload | Note persists. Clear it, blur, reload — the field is empty (stored as `NULL`). |
| 19 | **Delete the group.** Tap "Hapus pengeluaran ini" | Bottom sheet: `Hapus "bakar duit tuesday"?` with the cascade warning. Tap **Batal** — nothing happens. Tap it again → **Hapus** → redirected to `/m/<that group's month>` and the row is gone, month total reduced. |
| 20 | Navigate back to the deleted `/e/<id>` via browser history | "Pengeluaran tidak ditemukan" 404, not a stale render. |
| 21 | **Cross-user.** Private window, second Google account, open account A's `/e/<id>` | 404 page. Never 403, never a partial render. |
| 22 | Keyboard behaviour | Focusing any input does **not** zoom the viewport (all inputs ≥16 px). The bottom sheet stays above the keyboard; the Simpan button is reachable without scrolling on a 414×896 screen. |
| 23 | Tab bar | "Bulan Ini" is highlighted on both `/m/*` and `/e/*`. From July, tapping "Bulan Ini" jumps to the **current** month, not back to July. The raised "Tambah" button sits above the bar and is fully tappable. |
| 24 | Dark mode | Toggle iOS appearance. Header, sheets, toast and tab bar all invert; no white flashes; the big total stays legible. |

```bash
git commit --allow-empty -m "test(f07): manual QA pass at 414x896 complete"
```

---

## Task 18 — Ship

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```

**Expected output:** `✓ Compiled successfully`, and the route table listing `/m/[month]` and `/e/[id]` as
**ƒ (Dynamic)**. If either shows as `○ (Static)`, an auth call is missing and the page would be cached across
users — stop and fix before merging.

```bash
git push -u origin feat/f07-history-detail
```

---

## Contract deltas

Two, both additive and backward compatible with §4.4.

### CD-1 — `addItem` accepts an optional `sortOrder`

```diff
- addItem (groupId, { name, amountIdr, category }) → { id }
+ addItem (groupId, { name, amountIdr, category, sortOrder?: number }) → { id }
```

**Why:** the undo affordance ("Urungkan") re-inserts a deleted item. Without `sortOrder` the restored row lands
at the bottom of the list, which reads as data loss to the user even though nothing was lost. When omitted the
behaviour is unchanged (`max(sort_order) + 1`). No existing caller needs to change.

**Blast radius:** F05 (`/new`) calls `addItem`? No — F05 saves through `createExpense`. Only F07 calls `addItem`
today.

### CD-2 — `deleteExpense` ends in a server-side `redirect()`

The signature in §4.4 is `deleteExpense(id) → void`; that still holds (`redirect` is typed `never` and the
declared return type is unchanged). The behavioural addendum: after revalidating, the action redirects to
`/m/<the group's month>`.

**Why:** the client alternative — `await deleteExpense(id)` then `router.replace(...)` — races the revalidation
and can paint a 404 detail page for a frame. Server-side redirect is atomic with the mutation.

**Consequence for callers:** never wrap `deleteExpense` in `try/catch`. `redirect()` signals by throwing a
`NEXT_REDIRECT` error and a catch-all swallows it. Documented at the call site in `DeleteGroupSheet.tsx`.

---

## Interfaces I publish

Consumed by F05, F08 and F09. Do not duplicate any of these.

### `lib/month.ts`

```ts
export const MONTH_KEY_RE: RegExp
export const DATE_ISO_RE: RegExp
export function isMonthKey(value: string): boolean          // route-param validation
export function isRealDateIso(iso: string): boolean          // calendar-valid, not just shaped
export function monthKeyOf(dateIso: string): string          // 'YYYY-MM-DD' -> 'YYYY-MM'
export function currentMonthKeyJakarta(): string
export function addMonths(monthKey: string, delta: number): string
export function isAfterCurrentMonth(monthKey: string): boolean
export function formatMonthLongId(monthKey: string): string  // 'Agustus 2026'
export function formatMonthShortId(monthKey: string): string // 'Agu 2026'  ← F08 chart axis
export function formatDayHeadingId(dateIso: string): string  // 'Selasa, 18 Agustus'
export function formatFullDateId(dateIso: string): string    // 'Selasa, 18 Agustus 2026'
```

**F08** uses `addMonths` + `formatMonthShortId` for the 12-month axis and `/m/${monthKey}` for tap-to-navigate.
**F09** uses `formatFullDateId` on the public share page.

### `components/category/`

```tsx
export function CategoryChip(props: { category: Category; size?: 'sm' | 'md' }): JSX.Element   // server-safe
export function CategoryGrid(props: { value: Category; onChange: (next: Category) => void }): JSX.Element // 'use client'
```

**F05** must use `CategoryGrid` for its review-row category picker. **F08** may use `CategoryChip` in the donut
legend. **F09** uses `CategoryChip` on `/s/[token]`.

### `components/ui/Toast.tsx`

```tsx
export type ToastSpec = { message: string; actionLabel?: string; onAction?: () => void; durationMs?: number; tone?: 'neutral' | 'danger' }
export function ToastProvider(props: { children: ReactNode }): JSX.Element
export function useToast(): { show(spec: ToastSpec): void; dismiss(): void }
```

Mounted once in `app/(shell)/layout.tsx`. Any client component under `/m`, `/e`, `/stats` can call `useToast()`.
**F06** should use it for upload failures; **F09** for "Tautan disalin".

### `app/actions/_guard.ts`

```ts
export class NotFoundError extends Error {}
export function assertOwnedGroup(userId: string, groupId: string): Promise<{ id: string; occurredOn: string }>
export function assertOwnedItem(userId: string, itemId: string): Promise<{ id: string; groupId: string; occurredOn: string }>
```

**F06** (`attachPhoto`, `deletePhoto`) and **F09** (`createShareLink`, `revokeShareLink`) must call
`assertOwnedGroup` rather than writing their own ownership check.

### `app/actions/_revalidate.ts`

```ts
export function revalidateGroup(groupId: string, ...isoDates: Array<string | null | undefined>): void
```

Every action that mutates anything hanging off a group must call this. **F06** and **F09** included.

### `app/actions/items.ts`

```ts
export function addItem(groupId: string, input: { name: string; amountIdr: number; category: Category; sortOrder?: number }): Promise<{ id: string }>
export function updateItem(id: string, input: { name?: string; amountIdr?: number; category?: Category }): Promise<void>
export function deleteItem(id: string): Promise<void>
```

### `app/actions/expenses.ts` (F07's half)

```ts
export function updateExpenseMeta(id: string, input: { title?: string; occurredOn?: string; note?: string | null }): Promise<void>
export function deleteExpense(id: string): Promise<never>  // redirects
```

### The shell

`app/(shell)/layout.tsx` + `components/nav/AppTabBar.tsx`. **F08's `/stats` must live at
`app/(shell)/stats/page.tsx`** — outside the group it renders with no tab bar and no toast provider.

### Detail-page slots

`/e/[id]` renders `photoSlot` and `shareSlot` as `ReactNode`. **F06** supplies
`<PhotoSection groupId photos />`; **F09** supplies `<ShareControl groupId shareToken title />`. Neither feature
needs to touch `ExpenseEditor`.

---

## Interfaces I consume

Every symbol F07 imports from another feature, with the exact signature F07 assumes. **Verify each one before
starting** (Task 0); a mismatch here is the most likely reason this plan fails to compile.

### From F03 — `lib/db/queries.ts`

```ts
export type MonthGroupRow = {
  id: string
  title: string
  occurredOn: string        // 'YYYY-MM-DD' — drizzle date column MUST use { mode: 'string' }
  totalIdr: number          // SUM(amount_idr), 0 when the group has no items (D7)
  itemCount: number
  photoCount: number
  firstPhotoUrl: string | null   // lowest sort_order photo's blob_url, for the row thumbnail
}

/**
 * One query. Filtered by user_id. Rows sorted occurred_on DESC, created_at DESC.
 * `month` is 'YYYY-MM'; the range filter must be half-open on the date column so
 * the (user_id, occurred_on DESC) index is used.
 */
export function getMonthGroups(userId: string, month: string): Promise<MonthGroupRow[]>

export type GroupDetail = {
  id: string
  title: string
  occurredOn: string        // 'YYYY-MM-DD'
  note: string | null
  rawText: string | null
  items: Array<{ id: string; name: string; amountIdr: number; category: Category; sortOrder: number }>  // ORDER BY sort_order ASC
  photos: Array<{ id: string; blobUrl: string; blobPathname: string; width: number | null; height: number | null; sortOrder: number }>
  totalIdr: number
  shareToken: string | null // LEFT JOIN share_links
}

/** Returns null when the id does not exist OR belongs to another user. Never throws for the latter. */
export function getGroupDetail(userId: string, id: string): Promise<GroupDetail | null>
```

Also from F03: `db` (`lib/db`), the table objects `expenseGroups` / `expenseItems` (`lib/db/schema`), and
`newId()` (`lib/db/ids`, nanoid(12)). Column mode assumptions: `occurred_on` is `date({ mode: 'string' })`,
`amount_idr` is `bigint({ mode: 'number' })`, `updated_at` accepts a JS `Date`.

**If `photoCount` / `firstPhotoUrl` / `shareToken` are missing:** raise with F03. F07 must not issue a second
query — that is the N+1 this feature is forbidden from creating.

### From F02

```ts
export function requireUserId(): Promise<string>   // throws/redirects when unauthenticated
export function auth(): Promise<Session | null>    // from '@/auth' — used only in app/page.tsx
```

Plus `middleware.ts` matching `/m/:path*`, `/e/:path*`, `/new`, `/stats` (and **not** `/s`). F07 assumes
unauthenticated requests never reach its pages.

### From F01 — `lib/format.ts`

```ts
export const TZ: 'Asia/Jakarta'
export function formatIdr(n: number): string             // 'Rp 38.500'
export function parseIdrLoose(s: string): number | null  // '45k' | '45rb' | '1,5jt' | 'Rp 38.500' | '38500'
export function todayJakartaISO(): string                // 'YYYY-MM-DD'
export function monthKey(date: Date): string             // 'YYYY-MM' — F07 does not use this; it uses lib/month.ts
```

### From `lib/categories.ts` (§4.1, owned by F03/F10)

```ts
export const CATEGORIES: readonly ['food','groceries','transport','bills','housing','entertainment','health','other']
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_META: Record<Category, { label: string; emoji: string; colorVar: `--color-cat-${string}` }>
```

`CATEGORY_META` is F07's reading of §4.1's "each category has a `label`, an `emoji`, and a `color` CSS
custom-property name". If the export is named differently, rename the import in `CategoryChip` / `CategoryGrid`
only.

### From F10 — `components/ui/*` (soft dependency)

```tsx
Button({ variant, size, ... })
Sheet({ open, onClose, title, children })   // ItemSheet / DeleteGroupSheet drop-in
Chip, Field, EmptyState, Money, Card
```

F07 ships fallback markup for **Sheet** and **EmptyState** so it is not blocked. When F10 lands, swap them in —
the internals of `ItemSheet` and `EmptyMonth` are written to be liftable verbatim. F07 also assumes F10's global
CSS provides: `viewport-fit=cover` in the viewport meta, `100dvh` sizing, `-webkit-tap-highlight-color:
transparent`, and the `--color-cat-*` custom properties.

### From F06 — photos

```tsx
export function PhotoSection(props: { groupId: string; photos: GroupDetail['photos'] }): JSX.Element
// or, if split:
export function PhotoGallery(props: { photos: GroupDetail['photos'] }): JSX.Element
export function PhotoPicker(props: { groupId: string }): JSX.Element
```

F07 renders whichever exists into `photoSlot`. F07 does **not** implement thumbnails-with-lightbox, compression,
upload progress, or blob deletion.

### From F09 — sharing

```tsx
export function ShareControl(props: { groupId: string; shareToken: string | null; title: string }): JSX.Element
```

Owns the `navigator.share` call, the clipboard fallback, and the revoke button. F07 renders it into `shareSlot`
and passes `detail.shareToken` straight through.

---

## Open questions for the integrator

1. **F03 return shapes.** Does `getMonthGroups` include `photoCount` and `firstPhotoUrl`, and does
   `getGroupDetail` include `shareToken`? These are needed for the month-row thumbnail badge and the share
   button state. If F03 declines, F07 needs either a second query (violating the one-query rule) or the badge
   and share button get cut. **This is the only true blocker in the list.**
2. **Who owns `TabBar`?** §5 lists `TabBar` among F10's primitives, but the routes and active-state logic are
   F07's. This plan has F07 owning `components/nav/AppTabBar.tsx` outright and F10 owning only the tokens. If
   F10 has already shipped a route-aware `TabBar`, delete `AppTabBar` and mount F10's in the shell layout.
3. **Who owns the category picker?** F05's review screen needs the same 2×4 grid. This plan has F07 publishing
   `CategoryGrid`. F05 and F07 are the same wave — whoever lands second must import, not duplicate. Confirm with
   F05's owner before either starts.
4. **`next/image` remote patterns.** F06 or F01 may already have added the Vercel Blob host to
   `next.config.ts`. Only one feature should own that block.
5. **Does the tab bar appear on `/new`?** This plan says no (A1). If F05 expects it, `/new` must move into
   `app/(shell)/` and the composer needs bottom padding.
6. **`/s/[token]` freshness.** F07 does not revalidate the share page after an edit, on the assumption that F09
   renders it dynamically with no ISR. If F09 caches it, F09 must revalidate it from its own actions, or
   `revalidateGroup` needs the token passed in.
7. **Test runner.** F01's script list has no `test`. This plan assumes `vitest` (added by F04). If the project
   settles on `node --test`, `lib/month.test.ts` needs a two-line import swap.
8. **The `top-[8.5rem]` sticky offset** for day headings is a measured literal. If F10 exposes a `--header-h`
   token, replace it — otherwise it must be re-measured whenever the month header's type scale changes.
9. **Undo semantics.** A restored item gets a **new id** (A7). Acceptable? The alternative is a deferred-delete
   timer, which is a true undo but loses the delete if the tab closes mid-window. This plan chose durability.
10. **`useLinkStatus` availability** in `next@16.3.1` — confirm the export path (`next/link`) before shipping
    Task 16 step 2; it is a nice-to-have and can be dropped.
11. **Multi-tab / stale optimistic state.** Single-user personal app, so two tabs editing the same group is not
    defended against. Last write wins. Confirm nobody cares.
