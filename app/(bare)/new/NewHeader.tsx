import Link from 'next/link'

/**
 * The way back off /new.
 *
 * R-51 puts this screen outside the `(shell)` route group, because it ends in a full-width
 * Simpan exactly where a tab bar would sit. The consequence R-51 spells out is that the
 * screen must then supply its own navigation — the design's pushed-view pattern of back
 * chevron · mono label · optional action, as on the Detail screen. F10 does not ship it
 * because what flanks the label differs per route.
 *
 * There is no action on the right: on /new the primary action is the sticky Simpan at the
 * bottom, and a second one up here would compete with it.
 *
 * The chevron carries its own accessible name rather than borrowing the heading's, so a
 * screen reader announces "Kembali ke daftar bulan ini, link" and then "Tambah, heading
 * level 1" — two different things, which is what they are.
 */
export function NewHeader({ backHref }: { backHref: string }) {
  return (
    <header className="flex shrink-0 items-center gap-1 pt-safe-header px-safe pb-3">
      <Link
        href={backHref}
        aria-label="Kembali ke daftar bulan ini"
        // -ml-2.5 pulls the 44px target's padding back so the glyph lines up with the
        // gutter rather than sitting a touch-target's worth inside it.
        className="-ml-2.5 grid size-touch shrink-0 press place-items-center rounded-field text-ink-2"
      >
        <span aria-hidden="true" className="text-title leading-none">
          ‹
        </span>
      </Link>

      {/* The route's one <h1>. Mono label rather than a 27px serif title: this is a pushed
          view, and the design gives pushed views a chrome label, not a screen title. */}
      <h1 className="eyebrow">Tambah</h1>
    </header>
  )
}
