import type { MetadataRoute } from 'next'

/**
 * `robots.txt`.
 *
 * ═══ /s/ IS DELIBERATELY NOT DISALLOWED, AND THIS IS THE SUBTLE BIT ═══
 *
 * robots.txt governs FETCHING; `noindex` governs INDEXING. They pull in opposite directions
 * here, and disallowing `/s/` would lose on both:
 *
 *   1. Meta's crawler (`facebookexternalhit`) honours robots.txt, so the WhatsApp preview
 *      card — the thing that makes a pasted link look trustworthy and tappable — would
 *      simply stop appearing. That card is a feature the user asked for.
 *   2. It would not even achieve the goal. Google can index a URL it learns about elsewhere
 *      WITHOUT crawling it, listing it URL-only — and a disallow is precisely what stops it
 *      from seeing the `noindex` it would otherwise obey.
 *
 * So: allow the fetch, forbid the index. `X-Robots-Tag: noindex, nofollow, noarchive`
 * (next.config.ts) plus the per-page `robots` metadata are the hard guarantee, and the
 * preview keeps working. Do not "tighten" this later by adding `/s/` — it is a strict
 * regression on both axes. F09 Task 16.
 *
 * The authenticated routes are listed only to stop crawlers spending function invocations
 * on redirects; `proxy.ts` already bounces them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/new', '/m/', '/e/', '/stats'],
      },
    ],
  }
}
