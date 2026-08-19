import 'server-only'

/**
 * The absolute origin a share link is built against — F09 Open question 6.
 *
 * WHY THIS IS NOT `window.location.origin`. The share sheet hands a friend a URL that has
 * to keep working. On a Vercel preview deployment the browser's origin is a
 * `*-<hash>.vercel.app` host that dies at the next push, so a link shared from a preview
 * would be dead by the time the friend opened it. The production domain is the only correct
 * answer regardless of which deployment minted the token, which is why this is resolved on
 * the server and passed down as a prop.
 *
 * Resolution order:
 *   1. AUTH_URL — F02 sets it in production; it is already the canonical origin for the
 *      OAuth callback, and two ideas of "where this app lives" is one too many.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — set on every Vercel deployment INCLUDING previews,
 *      and it always names the production domain (not the preview's own host). Exactly the
 *      fallback we want, and it is a bare hostname, hence the scheme.
 *   3. localhost — dev only, so the sheet still produces a tappable link on the machine.
 */
export function shareOrigin(): string {
  const authUrl = process.env.AUTH_URL
  if (authUrl) return authUrl.replace(/\/+$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercel) return `https://${vercel}`

  return `http://localhost:${process.env.PORT ?? 3000}`
}
