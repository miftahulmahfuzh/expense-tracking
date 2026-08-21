'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

export interface TabBarProps {
  /**
   * e.g. "/m/2026-08". Computed on the server from `currentMonthKey()` so the client never
   * has to guess the timezone — the app's calendar is Asia/Jakarta, and a device set to
   * UTC-11 would otherwise land on the wrong month for seven hours a day.
   */
  monthHref: string
}

/**
 * Three tabs: Bulan Ini · Tambah · Statistik.
 *
 * The bar is solid black in BOTH schemes — a chassis, not a surface. It does not flip with
 * the theme and it does not sit on `paper`; it is the one piece of hardware in the app, and
 * everything else scrolls behind it. Its palette is its own three tokens (`tab-bg`,
 * `tab-ink`, `tab-ink-3`) so nothing here has to reason about light and dark.
 *
 * No icons. The label is 11px/800 uppercase and that is the whole affordance — an icon set
 * would be three more drawings to keep consistent, and at that tracking the word is faster
 * to read than a glyph you have to learn. The active tab goes YELLOW and gains a dot.
 *
 * Tambah is the app's reason to exist, so it is the one raised element: a red circle
 * punching through the bar's top edge like a stopwatch crown. Still shadowless — it reads
 * as in front because it overlaps the edge, not because it casts anything.
 *
 * `data-tabbar` is read by the `:has()` rule in globals.css that lifts the Toast above the
 * bar. Do not remove it.
 */
export function TabBar({ monthHref }: TabBarProps) {
  const pathname = usePathname()
  const onMonth = pathname.startsWith('/m')
  const onStats = pathname.startsWith('/stats')
  const onNew = pathname.startsWith('/new')

  return (
    <nav
      data-tabbar
      aria-label="Navigasi utama"
      // Fixed to the viewport, but the contents are constrained to the same max-w-app
      // column as the page so the bar lines up on a wide viewport instead of stretching
      // across it. Opaque, so scrolled content passes cleanly behind.
      className="fixed inset-x-0 bottom-0 z-40 bg-tab-bg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-app grid-cols-3 px-1">
        <Link
          href={monthHref}
          aria-current={onMonth ? 'page' : undefined}
          className={cn(
            'flex min-h-tab press flex-col items-center gap-1.5 pt-3.5 pb-1.5',
            'text-action uppercase',
            onMonth ? 'text-tab-ink' : 'text-tab-ink-3',
          )}
        >
          {/* Always rendered, transparent when inactive, so the labels stay on one baseline. */}
          <span
            aria-hidden="true"
            className={cn('size-1.5 rounded-full', onMonth ? 'bg-tab-ink' : 'bg-transparent')}
          />
          Bulan Ini
        </Link>

        <Link
          href="/new"
          aria-label="Tambah pengeluaran"
          aria-current={onNew ? 'page' : undefined}
          className="relative flex press flex-col items-center justify-end pb-1.5"
        >
          <span
            aria-hidden="true"
            className="absolute -top-6.5 grid size-14 place-items-center rounded-full bg-red text-[28px] leading-none font-bold text-red-fg"
          >
            +
          </span>
          <span
            className={cn('mt-9 text-action uppercase', onNew ? 'text-tab-ink' : 'text-tab-ink-3')}
          >
            Tambah
          </span>
        </Link>

        <Link
          href="/stats"
          aria-current={onStats ? 'page' : undefined}
          className={cn(
            'flex min-h-tab press flex-col items-center gap-1.5 pt-3.5 pb-1.5',
            'text-action uppercase',
            onStats ? 'text-tab-ink' : 'text-tab-ink-3',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('size-1.5 rounded-full', onStats ? 'bg-tab-ink' : 'bg-transparent')}
          />
          Statistik
        </Link>
      </div>
    </nav>
  )
}
