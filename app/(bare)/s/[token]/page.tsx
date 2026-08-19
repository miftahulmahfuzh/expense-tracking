import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

/*
 * DIRECT PATH, NOT THE `@/components/photos` BARREL, and this is not a style preference.
 * The barrel re-exports `PhotoManager`, which imports `deletePhoto` — so importing through
 * it puts a Server Action in this page's module graph and leaves R-80's property depending
 * on the bundler tree-shaking a re-export. That is a real optimisation and it would probably
 * work; it is also invisible when it stops working, on the one page in the app that is
 * served to strangers. The deep import makes the graph the guarantee.
 * Asserted by tests/share.bundle.test.ts.
 */
import { PhotoGallery } from '@/components/photos/PhotoGallery'
import { Card, CategoryCode, Money } from '@/components/ui'
import { getGroupByShareToken } from '@/lib/db/queries'
import { dayLabel, formatIdr } from '@/lib/format'
import { isValidId } from '@/lib/id'
import {
  SHARE_PREVIEW_SHOWS_TOTAL,
  SHARE_SHOWS_NOTE,
  SHARE_SHOWS_OWNER_NAME,
} from '@/lib/share/config'
import { shareOrigin } from '@/lib/share/origin'

import {
  FOOTER_LABEL,
  ITEM_HEADING,
  NOT_FOUND_METADATA_TITLE,
  OWNER_PREFIX,
  PHOTO_HEADING,
  TOTAL_LABEL,
} from './copy'

/**
 * `/s/[token]` — the one public, unauthenticated route in the app (roadmap §4.6, D4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  DYNAMIC, ALWAYS. This export is load-bearing here and nowhere else.
 *
 *  R-75 and R-115 removed `export const dynamic` from `/api/parse` and `/stats` as a no-op
 *  that reads as a guarantee. Both of those routes are dynamic BY CONSTRUCTION — they call
 *  `requireUserId()`, which reads the session cookie. THIS ROUTE READS NO COOKIE, by
 *  design: it is the only page a signed-out stranger can see. Nothing else makes it
 *  dynamic, so without this the route is a prerender candidate whose output could be served
 *  from the Full Route Cache after the link was revoked — and a stale page looks exactly
 *  like a working one, which is why the failure would never be noticed.
 *
 *  `dynamic` is only absent from Next 16's route-segment-config table when Cache Components
 *  is enabled (`route-segment-config/index.md`, Version History: "`dynamic`, `dynamicParams`,
 *  `revalidate`, and `fetchCache` removed when Cache Components is enabled"). This project
 *  does not enable it — `next.config.ts` has no `cacheComponents` — so the previous model
 *  applies and `force-dynamic` is the documented, supported opt-out.
 *
 *  Backed up by an explicit `Cache-Control: private, no-store` header in `next.config.ts`,
 *  because a header is what a CDN actually reads. Do NOT add `generateStaticParams`,
 *  `revalidate`, `unstable_cache` or `'use cache'` to this route. F09 §2.8.
 *
 *  NO `loading.tsx` EITHER (R-98). A Suspense boundary over the token lookup would start
 *  streaming a 200 before `notFound()` runs, and the status could no longer change — a soft
 *  404. That is acceptable on the authenticated routes, which nothing crawls; here the
 *  status code is the only thing a link scanner, a mail gateway or an archiver reads.
 * ════════════════════════════════════════════════════════════════════════════
 */
export const dynamic = 'force-dynamic'

/**
 * Shape-check before the database. Enumeration and crawler noise are malformed tokens, and
 * this makes them cost zero queries (F09 §2.9). `isValidId` is the same 12-symbol URL-safe
 * check every other id uses — the share token is drawn from the same generator (lib/id.ts),
 * so a second regex here would be a copy that could drift.
 *
 * `getGroupByShareToken` is wrapped in React `cache()` (R-22), so `generateMetadata` and the
 * page body together cost ONE round trip per request, not two.
 */
async function load(token: string) {
  if (!isValidId(token)) return null
  return getGroupByShareToken(token)
}

export async function generateMetadata({ params }: PageProps<'/s/[token]'>): Promise<Metadata> {
  const { token } = await params
  const group = await load(token)

  /*
   * An unguessable URL that gets indexed is no longer unguessable. Also sent as an
   * `X-Robots-Tag` header (next.config.ts) — the meta tag only exists once a crawler has
   * parsed the HTML, and it says nothing to an intermediary cache.
   */
  const robots = {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  } as const

  if (!group) return { title: NOT_FOUND_METADATA_TITLE, robots }

  const when = dayLabel(group.occurredOn)
  const count = `${group.items.length} item`

  /*
   * THE PREVIEW CARD IS NOT BEHIND THE TAP. WhatsApp fetches this server-side and renders it
   * INSIDE THE CHAT: in the bubble, in the recipient's chat-list snippet, on their lock
   * screen, to every member of a group chat, and in every forward. The URL is the secret;
   * this card is not. So it carries the item count and the date, and not the rupiah total.
   * `SHARE_PREVIEW_SHOWS_TOTAL` flips it in one line if the user decides otherwise. F09 §2.6.
   *
   * More generally: generateMetadata is served to anyone with the URL, including scanners
   * (facebookexternalhit, Safe Browsing, corporate mail gateways). It must never contain
   * more than the page body does.
   */
  const description = SHARE_PREVIEW_SHOWS_TOTAL
    ? `${count} · ${formatIdr(group.totalIdr)} · ${when}`
    : `${count} · ${when}`

  const url = `${shareOrigin()}/s/${token}`

  return {
    // The root layout's template makes this "<title> · Expense Tracking".
    title: group.title,
    description,
    robots,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName: 'expensetracking.online',
      title: group.title,
      description,
      url,
      /*
       * ONE STATIC IMAGE for every link, never a per-link `opengraph-image.tsx`. Meta caches
       * scraped preview images on its own CDN for days, so a card with the expense burned
       * into a bitmap would SURVIVE A REVOKE, in a place we cannot reach. A text-only card
       * degrades to plain text once the link dies; an image card does not. F09 §2.7.
       */
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Expense Tracking' }],
    },
    twitter: { card: 'summary', title: group.title, description },
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PAGE MUST NEVER GROW. Treat it as a review checklist, not prose:
 *
 *   · no edit control of any kind — no editable field, no add item, no delete, no picker
 *   · no `<form action={serverAction}>`, and no client component that reaches app/actions/
 *     (asserted by tests/share.bundle.test.ts, which walks the real import graph)
 *   · no tab bar, no header menu, no sign-out, no "Masuk" — it lives in `(bare)`, which
 *     has no chrome, and R-25 is why the tab bar is in a route group rather than the root
 *   · no link to /m/…, /e/…, /new or /stats. The ONLY outbound link is the footer's `/`
 *   · no owner email, no userId, no rawText, no blobPathname — the SharedGroup projection
 *     carries none of them, and that is enforced in lib/db/queries.ts
 *   · no evidence that other groups exist: no counts, no "lihat semua", no month navigation
 * ════════════════════════════════════════════════════════════════════════════
 */
export default async function SharedExpensePage({ params }: PageProps<'/s/[token]'>) {
  const { token } = await params
  const group = await load(token)

  // Unknown token and revoked token are the same 404. See copy.ts.
  if (!group) notFound()

  return (
    <main className="pt-10 px-safe">
      <header>
        <h1 className="text-title text-pretty">{group.title}</h1>
        <p className="mt-1 font-mono text-meta text-ink-3">{dayLabel(group.occurredOn)}</p>
        {SHARE_SHOWS_OWNER_NAME && group.ownerName && (
          <p className="mt-1 text-body text-ink-2">
            {OWNER_PREFIX} {group.ownerName}
          </p>
        )}
      </header>

      {SHARE_SHOWS_NOTE && group.note && (
        <p className="mt-4 text-body text-pretty text-ink-2">{group.note}</p>
      )}

      <div className="mt-7 mb-2 flex items-baseline justify-between">
        <h2 className="eyebrow">{ITEM_HEADING}</h2>
        <span className="font-mono tabular text-meta text-ink-3">{group.items.length}</span>
      </div>

      <Card as="ul" padded="rows">
        {group.items.map((item) => (
          <li
            key={item.id}
            className="flex min-h-row items-center gap-2.5 border-b border-rule-2 py-2 pr-1.5 last:border-b-0"
          >
            {/*
             * R-111's standing constraint, and this page is exactly the case it was written
             * for: the reader is not the owner, and F10's eight category hues fail the CVD
             * separation gate on their own (ΔE 0.6 under deuteranopia between violet and
             * blue). The palette is only legal because nothing keys a category by colour
             * alone — `CategoryCode` renders a two-letter mark plus an sr-only Indonesian
             * label, so the identity survives a reader who cannot tell the hues apart.
             * Never replace this with a bare colour swatch.
             */}
            <CategoryCode category={item.category} className="w-6 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-item">{item.name}</span>
            <Money value={item.amountIdr} size="sm" />
          </li>
        ))}
      </Card>

      <div className="mt-6 flex items-baseline justify-between border-t border-rule pt-3.5">
        <span className="eyebrow">{TOTAL_LABEL}</span>
        <Money value={group.totalIdr} size="lg" />
      </div>

      {group.photos.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 eyebrow">{PHOTO_HEADING}</h2>
          {/*
           * `PhotoGallery`, never `PhotoManager` (R-80). The split is a security property,
           * not a style choice: PhotoManager imports `deletePhoto`, and a Server Action
           * referenced from a client module ships its callable id in whatever bundle that
           * module lands in. `requireUserId()` would reject the call, but a page with no
           * mutation surface should have no wire to a mutation at all. Omitting `onDelete`
           * is what makes the lightbox read-only.
           */}
          <PhotoGallery photos={group.photos} />
        </section>
      )}

      <footer className="mt-12 pb-10 text-center">
        <Link href="/" className="font-mono text-meta text-ink-3 underline underline-offset-4">
          {FOOTER_LABEL}
        </Link>
      </footer>
    </main>
  )
}
