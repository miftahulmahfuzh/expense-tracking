'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useFullscreen } from '@/components/fullscreen'
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
 * No icons. The label is 12px/800 Title Case and that is the whole affordance — an icon set
 * would be three more drawings to keep consistent, and the word is faster to read than a
 * glyph you have to learn. The active tab goes YELLOW and gains a dot.
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
  // The month screen's fullscreen mode slides the whole bar off the bottom. Gated on the
  // route inside the provider, so `/stats` can never end up here without its navigation.
  const { active: hidden } = useFullscreen()
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
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 bg-tab-bg',
        'transition-transform duration-280 ease-out-soft motion-reduce:transition-none',
        /*
         * NOT `translate-y-full`, and the difference is visible: `100%` is this nav's own
         * height, but the raised Tambah crown below is `-top-6.5` — it PUNCHES 26px THROUGH
         * the bar's top edge and is not part of the height being translated. At `100%` the
         * bar leaves and a red half-disc stays parked on the bottom edge of the month list.
         * `2rem` clears the crown's 1.625rem with a little slack for subpixel rounding.
         */
        hidden && 'translate-y-[calc(100%+2rem)]',
        /*
         * `pb-4`, NOT `env(safe-area-inset-bottom)` — the 8px edge rule (globals.css). Padding
         * by the full 34px inset put the three labels 40px off the bottom edge with a band of
         * black chassis under them; 16px plus each link's own `pb-1.5` lands the type at 22px,
         * level with the home indicator rather than stacked above the space reserved for it.
         * It is also the better number on a flat phone, where the inset is 0 and the labels
         * used to sit 6px off the edge.
         */
        'pb-4',
      )}
      /*
       * `inert`, not just off-screen. A translated element is still in the layout and its
       * three links are still focusable and still announced — a keyboard or screen-reader
       * user would tab into a navigation they cannot see. `inert` takes the whole subtree out
       * of the tab order and out of the accessibility tree in one attribute, which is exactly
       * the truth of it: while the bar is out, it is not there.
       */
      inert={hidden}
    >
      <div className="mx-auto grid max-w-app grid-cols-3 px-1">
        <Link
          href={monthHref}
          aria-current={onMonth ? 'page' : undefined}
          className={cn(
            'flex min-h-tab press flex-col items-center gap-1.5 pt-3.5 pb-1.5',
            'text-action',
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
          <span className={cn('mt-9 text-action', onNew ? 'text-tab-ink' : 'text-tab-ink-3')}>
            Tambah
          </span>
        </Link>

        <Link
          href="/stats"
          aria-current={onStats ? 'page' : undefined}
          className={cn(
            'flex min-h-tab press flex-col items-center gap-1.5 pt-3.5 pb-1.5',
            'text-action',
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
