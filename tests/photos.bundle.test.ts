/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F06 / reconciliation R-26 — the public share page must not carry a mutation.
 *
 *  A Server Action referenced from a client module becomes a callable action id in
 *  whatever bundle that module lands in. /s/[token] is unauthenticated and public
 *  (roadmap §4.6), and it renders a photo gallery, so if the gallery's module graph
 *  reached `deletePhoto` then every share-link recipient would be served an id for
 *  a mutation they can never be authorised to call.
 *
 *  R-26's answer is a split by MODULE, because the module graph is what decides the
 *  bundle. This test walks the real import graph from each entry point and asserts
 *  the property, rather than trusting a convention that a future refactor cannot see:
 *
 *    PhotoGallery  (F09, public)  → must NOT reach app/actions/photos
 *    PhotoManager  (F07, owner)   → must reach it, or delete does not work
 *
 *  Static-source analysis rather than a real bundle: reading the import graph is
 *  deterministic and instant, where asserting over `next build` output means parsing
 *  hashed chunks and a 30-second test.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest'

/**
 * The walker moved to tests/support/importGraph.ts when F09 needed the same traversal for
 * `/s/[token]` (see tests/share.bundle.test.ts). One copy, imported by both — R-77.
 */
import { importGraph, isClientModule } from './support/importGraph'

const ACTIONS = 'app/actions/photos.ts'

describe('R-26 — module-level split of the gallery', () => {
  it('PhotoGallery does not reach the photo Server Actions', () => {
    const graph = importGraph('components/photos/PhotoGallery.tsx')
    expect([...graph]).toContain('components/photos/Lightbox.tsx') // it does own the viewer
    expect([...graph]).not.toContain(ACTIONS)
  })

  it('Lightbox does not reach them either — it takes onDelete as a prop', () => {
    expect([...importGraph('components/photos/Lightbox.tsx')]).not.toContain(ACTIONS)
  })

  it('PhotoManager DOES reach them, or deletion silently does nothing', () => {
    expect([...importGraph('components/photos/PhotoManager.tsx')]).toContain(ACTIONS)
  })

  it('the graph walker is not vacuous: PhotoPicker reaches the actions', () => {
    // If this ever fails, the walker has stopped resolving imports and the two
    // assertions above are passing for the wrong reason.
    expect([...importGraph('components/photos/PhotoPicker.tsx')]).toContain(ACTIONS)
  })
})

describe('client/server boundary', () => {
  it("every client module in the photo graph is marked 'use client'", () => {
    for (const file of [
      'components/photos/PhotoGallery.tsx',
      'components/photos/PhotoManager.tsx',
      'components/photos/PhotoPicker.tsx',
      'components/photos/UploadTile.tsx',
      'components/photos/Lightbox.tsx',
      'components/photos/usePhotoUploads.ts',
      'lib/photos/compress.ts',
    ]) {
      expect(isClientModule(file), file).toBe(true)
    }
  })

  it('no client module reaches lib/db, lib/env or lib/blob', () => {
    // The `server-only` pragma in those modules is the build-time guard; this is the
    // same property asserted where a failure names the offending entry point.
    for (const entry of [
      'components/photos/PhotoGallery.tsx',
      'components/photos/PhotoManager.tsx',
      'components/photos/PhotoPicker.tsx',
      'lib/photos/compress.ts',
      'lib/photos/types.ts',
      'lib/photos/constants.ts',
    ]) {
      const graph = [...importGraph(entry)]
      const leaked = graph.filter(
        (f) => f.startsWith('lib/db/') || f.startsWith('lib/blob/') || f === 'lib/env.ts',
      )
      expect(leaked, `${entry} reaches ${leaked.join(', ')}`).toEqual([])
    }
  })
})
