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
  ]),
])

export default eslintConfig
