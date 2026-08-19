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
 */
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
    exclude: ['node_modules/**', '.next/**', 'tests/integration/**'],
    setupFiles: ['tests/setup.ts'],
  },
})
