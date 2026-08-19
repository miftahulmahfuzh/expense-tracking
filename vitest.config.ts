import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The single test-runner config for this repo (reconciliation R-11: F01 owns Vitest).
 *
 * F03 and F04 each proposed their own `vitest.config.ts` with different `include`
 * globs — F03 wanted `tests/**`, F04 wanted co-located `lib/**` and `app/**`. This
 * config is the union, so neither feature needs to touch it:
 *
 *   - F03 writes `tests/*.test.ts` (unit) and `tests/integration/*` (opt-in, `npm run test:int`)
 *   - F04/F05/F07/F09 write co-located `lib/**\/*.test.ts` and `app/**\/*.test.ts`
 *
 * Do not write a second config file.
 *
 * F03b: `--exclude` on the CLI APPENDS to this list rather than replacing it, so
 * `vitest run --dir tests/integration` alone could never collect a file that
 * `exclude` already names. The opt-in env flag below is how the integration suite is
 * unlocked, and `npm run test:int` sets it. It stays excluded by default so a plain
 * `npm test` never tries to reach a database.
 */
const integration = process.env.VITEST_INTEGRATION === '1'

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json "paths": { "@/*": ["./*"] }.
      '@': fileURLToPath(new URL('./', import.meta.url)),

      /*
       * F06: `server-only` is a poison pill, not a module. Its default export condition
       * THROWS on import, and only a bundler that selects the `react-server` condition —
       * which Vitest does not — gets the harmless branch. So any module opening with
       * `import 'server-only'` is untestable as shipped: lib/db/photos.ts, lib/blob/delete.ts.
       *
       * The alternatives were worse. Dropping the pragma from those files removes the
       * build-time guard that keeps the Drizzle client and BLOB_READ_WRITE_TOKEN out of a
       * client bundle — the exact leak it exists to prevent. Setting `conditions:
       * ['react-server']` globally changes how every dependency resolves, including React
       * and next/navigation, to fix one import. Repeating `vi.mock('server-only')` in each
       * test file works but has to be remembered by F07 and F09 too, and forgetting it
       * looks like a failing test rather than a missing incantation.
       *
       * Aliasing it to an empty stub costs nothing in production (Next still resolves the
       * real package and still enforces the boundary) and makes the ownership SQL in
       * lib/db/photos.ts testable, which is where this app's core security property lives.
       */
      'server-only': fileURLToPath(new URL('./tests/support/serverOnlyStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'app/**/*.test.ts'],
    // Integration tests hit a real database and run only via `npm run test:int`.
    exclude: ['node_modules/**', '.next/**', ...(integration ? [] : ['tests/integration/**'])],
    setupFiles: ['tests/setup.ts'],
  },
})
