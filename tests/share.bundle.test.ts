/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F09 — /s/[token] is public, and its module graph is a security property.
 *
 *  Everything reachable from the public page's entry point is, in principle, served to
 *  someone with no account. Two things follow, and neither is visible in review:
 *
 *   1. NO SERVER ACTION may be reachable from it. A Server Action referenced from a client
 *      module ships its callable id in whatever bundle that module lands in. `requireUserId()`
 *      would reject the call — but a page whose entire job is to be read should have no wire
 *      to a mutation at all, and "it is guarded in another file" is not the same guarantee as
 *      "there is nothing to call".
 *   2. NO LINK INTO THE OWNER'S ROUTES. The page must not advertise that /m, /e, /new or
 *      /stats exist. They would all bounce to sign-in, so nothing leaks — but it tells a
 *      stranger there is an account behind this and makes the page look broken.
 *
 *  R-80's split is what makes (1) achievable: PhotoGallery carries no action, PhotoManager
 *  does. tests/photos.bundle.test.ts asserts that at the component level; this asserts it
 *  at the route level, which is the level that actually ships.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { importGraph, isClientModule, repoRoot } from './support/importGraph'

const PAGE = 'app/(bare)/s/[token]/page.tsx'
const SHARE_ACTIONS = 'app/actions/share.ts'

/**
 * F12 §4 added a SECOND public route. Everything above applies to it word for word — it is the
 * same class of page, reachable by the same kind of unguessable token, by people with no
 * account — and it is more exposed in one respect: `/s/[token]` renders a presentational grid,
 * while this one renders the full-screen viewer, which is a client component with a download
 * handler in it.
 */
const PHOTO_PAGE = 'app/(bare)/f/[token]/page.tsx'
const PHOTO_SHARE_ACTIONS = 'app/actions/photoShare.ts'

const source = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

/** Source with comments stripped — these assertions are about code, and every one of these
    identifiers is NAMED in this route's docblocks explaining why it must never appear. */
const code = (file: string) =>
  source(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

describe('the public share route carries no mutation', () => {
  it('reaches no Server Action at all', () => {
    const actions = [...importGraph(PAGE)].filter((f) => f.startsWith('app/actions/'))
    expect(actions, `/s/[token] reaches ${actions.join(', ')}`).toEqual([])
  })

  it('renders PhotoGallery and never PhotoManager', () => {
    const graph = [...importGraph(PAGE)]
    expect(graph).toContain('components/photos/PhotoGallery.tsx')
    expect(graph).not.toContain('components/photos/PhotoManager.tsx')
  })

  it('never reaches F09s own owner-side components', () => {
    // ShareButton/ShareLinkPanel are the owner's controls. Importing either here would put
    // createShareLink and revokeShareLink in the public bundle.
    const graph = [...importGraph(PAGE)]
    expect(graph).not.toContain('components/share/ShareButton.tsx')
    expect(graph).not.toContain('components/share/ShareLinkPanel.tsx')
  })

  it('the walker is not vacuous: the owner page DOES reach the share actions', () => {
    // If this fails, the three assertions above are passing because the traversal stopped,
    // not because the property holds.
    expect([...importGraph('app/(bare)/e/[id]/page.tsx')]).toContain(SHARE_ACTIONS)
    expect([...importGraph('components/share/ShareLinkPanel.tsx')]).toContain(SHARE_ACTIONS)
  })
})

describe('the public page exposes nothing about the owner', () => {
  it('links only to "/" — no route into the authenticated app', () => {
    for (const file of [PAGE, 'app/(bare)/s/[token]/not-found.tsx']) {
      const hrefs = [...code(file).matchAll(/href=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)].map(
        (m) => m[1] ?? m[2] ?? m[3],
      )
      expect(hrefs, file).toEqual(hrefs.filter((h) => h === '/'))
    }
  })

  it('does not read the session', () => {
    const graph = [...importGraph(PAGE)]
    expect(graph).not.toContain('lib/auth/requireUserId.ts')
    expect(graph.filter((f) => f.startsWith('lib/auth/'))).toEqual([])
  })

  it('is force-dynamic, and has no loading boundary over the token lookup', () => {
    // force-dynamic: nothing else makes this route dynamic — it reads no cookie — so
    // without it a revoked link could be served from the Full Route Cache (F09 §2.8).
    expect(code(PAGE)).toContain("export const dynamic = 'force-dynamic'")
    // A loading.tsx would start streaming a 200 before notFound() ran, and the status could
    // no longer change (R-98). On the one public route the status code is what scanners read.
    expect(() => source('app/(bare)/s/[token]/loading.tsx')).toThrow()
    // Nothing may reintroduce caching over this route.
    expect(code(PAGE)).not.toMatch(/unstable_cache|'use cache'|generateStaticParams|revalidate =/)
  })

  it('the page itself is a server component', () => {
    expect(isClientModule(PAGE)).toBe(false)
  })
})

describe('the public PHOTO route carries no mutation (F12)', () => {
  it('reaches no Server Action at all', () => {
    const actions = [...importGraph(PHOTO_PAGE)].filter((f) => f.startsWith('app/actions/'))
    expect(actions, `/f/[token] reaches ${actions.join(', ')}`).toEqual([])
  })

  it('renders Lightbox directly and never through the photos barrel', () => {
    /*
     * The barrel re-exports `PhotoManager`, which imports BOTH `deletePhoto` and
     * `createPhotoShareLink`. Importing the viewer through it would put two Server Action ids in
     * this page's bundle and leave the property resting on the bundler tree-shaking a re-export
     * — a real optimisation, and one whose failure is invisible on the page served to strangers.
     */
    const graph = [...importGraph(PHOTO_PAGE)]
    expect(graph).toContain('components/photos/Lightbox.tsx')
    expect(graph).not.toContain('components/photos/index.ts')
    expect(graph).not.toContain('components/photos/PhotoManager.tsx')
  })

  it('the walker is not vacuous: the OWNER page does reach the photo share action', () => {
    // Without this, the assertion above could pass because the traversal stopped rather than
    // because the property holds.
    expect([...importGraph('components/photos/PhotoManager.tsx')]).toContain(PHOTO_SHARE_ACTIONS)
  })

  it('the viewer itself imports no action, which is what makes /s and /f both safe', () => {
    // PhotoGallery already had this property (R-80). F12 extended the Lightbox with a share
    // button, and the whole point of taking it as a PROP was to keep this true.
    const graph = [...importGraph('components/photos/Lightbox.tsx')]
    expect(graph.filter((f) => f.startsWith('app/actions/'))).toEqual([])
  })

  it('does not read the session', () => {
    const graph = [...importGraph(PHOTO_PAGE)]
    expect(graph).not.toContain('lib/auth/requireUserId.ts')
    expect(graph.filter((f) => f.startsWith('lib/auth/'))).toEqual([])
  })

  it('is force-dynamic, with no loading boundary and no caching', () => {
    expect(code(PHOTO_PAGE)).toContain("export const dynamic = 'force-dynamic'")
    // A loading.tsx would stream a 200 before notFound() ran, freezing a soft 404 (R-98).
    expect(() => source('app/(bare)/f/[token]/loading.tsx')).toThrow()
    expect(code(PHOTO_PAGE)).not.toMatch(
      /unstable_cache|'use cache'|generateStaticParams|revalidate =/,
    )
  })

  it('is a server component, and passes NO function prop across the boundary', () => {
    /*
     * `onClose` is omitted rather than passed as `() => {}`. React refuses to serialise a
     * function prop from a server component — "Functions cannot be passed directly to Client
     * Components" — so the no-op would be a runtime crash on every visit, and this page has no
     * test that renders it.
     */
    expect(isClientModule(PHOTO_PAGE)).toBe(false)
    expect(code(PHOTO_PAGE)).not.toMatch(/on[A-Z]\w*=\{\s*\(/)
  })

  it('links only to "/" from its not-found — no route into the authenticated app', () => {
    for (const file of [PHOTO_PAGE, 'app/(bare)/f/[token]/not-found.tsx']) {
      const hrefs = [...code(file).matchAll(/href=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)].map(
        (m) => m[1] ?? m[2] ?? m[3],
      )
      expect(hrefs, file).toEqual(hrefs.filter((h) => h === '/'))
    }
  })

  it('is covered by the no-store / noindex headers, like its sibling', () => {
    // The segment config governs what Next does; the header is what a CDN reads. A revoked link
    // served from an intermediary cache looks exactly like a working one.
    const config = source('next.config.ts')
    expect(config).toContain("source: '/f/:token'")
    expect(config).toContain("value: 'private, no-store, max-age=0, must-revalidate'")
    expect(config).toContain("value: 'noindex, nofollow, noarchive'")
  })
})
