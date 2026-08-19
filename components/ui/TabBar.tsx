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
 * No icons. The label is mono and uppercase and that is the whole affordance — an icon set
 * would be three more drawings to keep consistent, and at 11px with 0.14em tracking the
 * word is faster to read than a glyph you have to learn. The active tab gets the accent
 * dot, which is the only place green appears in the chrome.
 *
 * Tambah is the app's reason to exist, so it is the one raised element: an ink circle
 * breaking the bar's top rule. Still shadowless (design R-36) — it reads as in front
 * because it overlaps the hairline, not because it casts anything.
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
      // across it. `bg-paper` is opaque, so scrolled content passes cleanly behind.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-app grid-cols-3">
        <Link
          href={monthHref}
          aria-current={onMonth ? 'page' : undefined}
          className={cn(
            'flex min-h-tab press flex-col items-center gap-1.5 pt-3 pb-1.5',
            'font-mono text-action uppercase',
            onMonth ? 'text-ink' : 'text-ink-3',
          )}
        >
          {/* Always rendered, transparent when inactive, so the labels stay on one baseline. */}
          <span
            aria-hidden="true"
            className={cn('size-[5px] rounded-full', onMonth ? 'bg-accent' : 'bg-transparent')}
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
            className="absolute -top-6 grid size-btn place-items-center rounded-full border border-ink bg-ink font-mono text-title leading-none text-paper"
          >
            +
          </span>
          <span
            className={cn(
              'mt-8 font-mono text-action uppercase',
              onNew ? 'text-ink' : 'text-ink-3',
            )}
          >
            Tambah
          </span>
        </Link>

        <Link
          href="/stats"
          aria-current={onStats ? 'page' : undefined}
          className={cn(
            'flex min-h-tab press flex-col items-center gap-1.5 pt-3 pb-1.5',
            'font-mono text-action uppercase',
            onStats ? 'text-ink' : 'text-ink-3',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('size-[5px] rounded-full', onStats ? 'bg-accent' : 'bg-transparent')}
          />
          Statistik
        </Link>
      </div>
    </nav>
  )
}
