import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/*
 * DIRECT PATH, NOT THE `@/components/photos` BARREL, and this is not a style preference — it is
 * the same rule `/s/[token]` follows, for the same reason. The barrel re-exports `PhotoManager`,
 * which imports `deletePhoto` AND `createPhotoShareLink`, so importing through it puts two
 * Server Actions in this page's module graph and leaves R-80's property depending on the bundler
 * tree-shaking a re-export. That is a real optimisation and it would probably work; it is also
 * invisible when it stops working, on a page served to strangers. The deep import makes the
 * graph the guarantee. Asserted by tests/share.bundle.test.ts.
 *
 * `Lightbox` was previously NOT exported from the barrel at all, on the grounds that
 * `PhotoGallery` owns it and a caller reaching for it directly would be building a second
 * viewer. That rule is what makes this import correct rather than an exception to it: this page
 * needs a full-screen photo viewer, and there is exactly one.
 */
import { Lightbox } from '@/components/photos/Lightbox'
import { getPhotoByShareToken } from '@/lib/db/queries'
import { isValidId } from '@/lib/id'
import type { ViewablePhoto } from '@/lib/photos/types'

import { METADATA_TITLE, NOT_FOUND_METADATA_TITLE } from './copy'

/**
 * `/f/[token]` — one photo, published. The app's SECOND public, unauthenticated route (F12 §4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  DYNAMIC, ALWAYS. Load-bearing here for exactly the reason it is on `/s/[token]`:
 *
 *  R-75 and R-115 removed `export const dynamic` from `/api/parse` and `/stats` as a no-op that
 *  reads as a guarantee. Both are dynamic BY CONSTRUCTION — they call `requireUserId()`, which
 *  reads the session cookie. THIS ROUTE READS NO COOKIE, by design. Nothing else makes it
 *  dynamic, so without this the route is a prerender candidate whose output could be served from
 *  the Full Route Cache after the photo was deleted — and a stale page looks exactly like a
 *  working one, which is why the failure would never be noticed.
 *
 *  Backed by `Cache-Control: private, no-store` in `next.config.ts`, because a header is what a
 *  CDN actually reads. Do NOT add `generateStaticParams`, `revalidate`, `unstable_cache` or
 *  `'use cache'` here.
 *
 *  NO `loading.tsx` EITHER (R-98). A Suspense boundary over the token lookup would start
 *  streaming a 200 before `notFound()` runs, and the status could no longer change — a soft 404.
 *  On a public route the status code is the only thing a link scanner, a mail gateway or an
 *  archiver reads.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS PAGE MUST NEVER GROW — a review checklist, not prose:
 *
 *   · nothing about the expense. No title, no date, no items, no total, no owner. The
 *     `SharedPhoto` projection in lib/db/queries.ts carries none of them, and that is where the
 *     property is enforced, not here.
 *   · no `og:image`. A receipt thumbnail would render in the recipient's chat list, on their
 *     lock screen, and in every forward — the reasoning `SHARE_PREVIEW_SHOWS_TOTAL` already
 *     carries for the rupiah total, applied to the photo itself.
 *   · no edit control, no Server Action, no client component that reaches app/actions/
 *   · no link into the authenticated app. The only outbound link is the not-found page's `/`.
 *   · no gallery. One token resolves to one photo; there is no "next" to swipe to, which is why
 *     `photos` is a single-element array and the wrap mechanism sits out (`isWrappable(1)` is
 *     false).
 */
export const dynamic = 'force-dynamic'

/**
 * Shape-check before the database, so enumeration and crawler noise cost zero queries.
 * `isValidId` is the same 12-symbol URL-safe check every other id uses — the token comes from
 * the same generator (lib/id.ts), so a second regex here would be a copy that could drift.
 *
 * `getPhotoByShareToken` is wrapped in React `cache()`, so `generateMetadata` and the page body
 * together cost ONE round trip per request, not two.
 */
async function load(token: string) {
  if (!isValidId(token)) return null
  return getPhotoByShareToken(token)
}

export async function generateMetadata({ params }: PageProps<'/f/[token]'>): Promise<Metadata> {
  const { token } = await params
  const photo = await load(token)

  /*
   * An unguessable URL that gets indexed is no longer unguessable. Also sent as an
   * `X-Robots-Tag` header (next.config.ts) — the meta tag only exists once a crawler has parsed
   * the HTML, and it says nothing to an intermediary cache.
   */
  const robots = {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  } as const

  /*
   * The SAME title either way, and that is the point: `generateMetadata` is served to anyone
   * with the URL, including scanners (facebookexternalhit, Safe Browsing, corporate mail
   * gateways). A distinct "not found" title would tell a probe which tokens are real.
   *
   * No `description`, no `openGraph`, no `twitter`. There is nothing to say about this page that
   * does not describe its contents.
   */
  return { title: photo ? METADATA_TITLE : NOT_FOUND_METADATA_TITLE, robots }
}

export default async function SharedPhotoPage({ params }: PageProps<'/f/[token]'>) {
  const { token } = await params
  const shared = await load(token)

  // Unknown token, revoked token, deleted photo — one 404 for all three. See copy.ts.
  if (!shared) notFound()

  /*
   * The token is the identity (see `ViewablePhoto`). The real photo id is not in the projection
   * and does not need to be: this handle only keys the React list and the Lightbox's own
   * per-photo download cache, both of which are one entry long here.
   */
  const photo: ViewablePhoto = { id: token, ...shared }

  return (
    <Lightbox
      photos={[photo]}
      startIndex={0}
      /*
       * NO `onClose`, and its absence is the mechanism: no ✕, no tap-to-dismiss, no Escape.
       * There is nowhere to dismiss TO — this is the whole page, not an overlay over a list.
       *
       * It also could not be a no-op arrow even if we wanted one. This is a SERVER component,
       * and React refuses to serialise a function prop across the client boundary: "Functions
       * cannot be passed directly to Client Components".
       *
       * No `onDelete`, no `onShare` either. Their absence is what makes the floating cluster
       * download-only, and it is a property of this call site rather than a runtime check —
       * neither action is in this page's module graph at all.
       */
    />
  )
}
