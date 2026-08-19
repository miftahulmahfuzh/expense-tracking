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
    // Mirrors tsconfig.json "paths": { "@/*": ["./*"] }.
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
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
