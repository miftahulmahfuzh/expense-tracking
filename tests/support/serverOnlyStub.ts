/**
 * Stands in for the `server-only` package under Vitest. See the alias comment in
 * vitest.config.ts for why.
 *
 * The real package exists to THROW when a module is pulled into a client bundle, and it
 * decides which branch to take with the `react-server` export condition. Vitest resolves
 * the default condition, so it always gets the throwing branch and every server-only
 * module becomes impossible to import in a test — including the ones whose ownership
 * checks most need testing.
 *
 * Nothing about the production boundary changes: `next build` resolves the real package
 * and still fails the build if a 'use client' module reaches one of these.
 */
export {}
