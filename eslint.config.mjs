import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must come last: disables stylistic rules that conflict with Prettier.
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'drizzle/**',
    'next-env.d.ts',
    'scaffold-tmp/**',
    /*
     * F06 copies browser-image-compression's UMD bundle here for the Web Worker to
     * importScripts() from our own origin (scripts/copy-image-compression-worker.mjs).
     * A flat config does NOT read .gitignore, so without this line `eslint .` reports
     * 222 warnings from one minified vendor file and buries anything real.
     */
    'public/vendor/**',
    /*
     * A git worktree is a SECOND CHECKOUT of this repo inside it, so `.worktrees/x/.next/**`
     * is build output that the root `.next/**` pattern does not match — flat-config ignores
     * are path patterns, not directory names. Before this line, one stale worktree left over
     * from a merged branch put 20,290 warnings and 602 errors from minified Turbopack chunks
     * into `npm run lint`, which is the same failure mode `public/vendor/**` above was added
     * for: real findings buried under vendor noise.
     *
     * The worktree's own SOURCE is still linted — from its own checkout, where it is the root.
     */
    '.worktrees/**',
  ]),
  /*
   * THE ICON CHOKE POINT (F12). `components/ui/Icon.tsx` forces the design's stroke contract
   * — 2.5 weight, square caps, mitred joins — onto every lucide glyph. That contract is only
   * worth anything if it cannot be bypassed, and the bypass is one `import { X } from
   * 'lucide-react'` in a hurry: the glyph renders, it looks nearly right, and it is a
   * hairline next to Archivo at 800.
   *
   * The three docblocks this dependency replaced all predicted exactly that failure, so the
   * rule is what lets us take the dependency without conceding their point. `Icon.tsx` itself
   * is the one exemption; `tests/icon.contract.test.ts` asserts the same property from the
   * other side, so deleting this block does not silently unguard it.
   */
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['components/ui/Icon.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message:
                'Import the glyph from @/components/ui instead (e.g. `TrashIcon`). ' +
                'components/ui/Icon.tsx is the one module allowed to touch lucide, because a ' +
                'raw <Trash2 className="size-5" /> silently bypasses the 2.5-stroke ' +
                'square-cap contract. Need a glyph that is not there? Add a line to Icon.tsx.',
            },
          ],
        },
      ],
    },
  },
])

export default eslintConfig
