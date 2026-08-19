/**
 * Walk the real module graph from an entry point.
 *
 * Extracted from `tests/photos.bundle.test.ts` when F09 needed the same walk for
 * `/s/[token]` — R-77's rule ("import, never re-declare") applies to test infrastructure
 * too, and two copies of a traversal is how one of them quietly stops resolving imports and
 * starts passing for the wrong reason.
 *
 * TRAVERSAL STOPS AT A `'use server'` MODULE, which is where the real bundler stops: such a
 * file is a boundary, replaced in the client graph by a stub that posts an action id. Its
 * own imports — Drizzle, the blob SDK, lib/env — never travel to the browser. The module
 * itself is still recorded, because whether a client component references an action AT ALL
 * is precisely what these tests are about.
 *
 * Static source analysis rather than a real bundle: reading the import graph is
 * deterministic and instant, where asserting over `next build` output means parsing hashed
 * chunks and a 30-second test.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function isClientModule(file: string): boolean {
  return readFileSync(resolve(repoRoot, file), 'utf8').trimStart().startsWith("'use client'")
}

/** Every module reachable from `entry`, following relative and `@/` imports. */
export function importGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)

    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    if (source.trimStart().startsWith("'use server'")) continue
    // Covers `import x from '…'`, `import '…'`, `export … from '…'` and dynamic import('…').
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
      (m) => m[1]!,
    )

    for (const specifier of specifiers) {
      const path = specifier.startsWith('@/')
        ? specifier.slice(2)
        : specifier.startsWith('.')
          ? resolve(dirname(file), specifier).slice(repoRoot.length + 1)
          : null
      if (!path) continue // a bare package name: not ours to walk

      const candidate = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
        .map((ext) => `${path}${ext}`)
        .find((p) => {
          try {
            readFileSync(resolve(repoRoot, p), 'utf8')
            return true
          } catch {
            return false
          }
        })
      if (candidate) queue.push(candidate)
    }
  }

  return seen
}
