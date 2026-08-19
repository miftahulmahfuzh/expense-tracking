import 'server-only'

/**
 * The gate on the F06 QA harness.
 *
 * NOT `process.env.NODE_ENV !== 'production'`, which is what /dev/ui uses. A Vercel PREVIEW
 * build sets NODE_ENV=production, so that test would 404 the harness on exactly the
 * deployment the plan's QA table requires ("run this against a Vercel preview deployment,
 * not localhost, so onUploadCompleted and the real CDN are in play").
 *
 * VERCEL_ENV distinguishes the three: 'production' | 'preview' | 'development'. Off Vercel
 * it is unset, and then NODE_ENV is the fallback so a self-hosted production build is
 * still closed.
 */
export function isDevOnlyRouteEnabled(): boolean {
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv) return vercelEnv !== 'production'
  return process.env.NODE_ENV !== 'production'
}

/** For Server Actions, which have no notFound() semantics worth relying on. */
export function assertDevOnly(): void {
  if (!isDevOnlyRouteEnabled()) {
    throw new Error('Not available')
  }
}
