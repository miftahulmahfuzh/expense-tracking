import { isValidMonthKey, type MonthKey } from '@/lib/format'

/**
 * Route-param validation for `/m/[month]`. Anything this rejects must `notFound()`.
 *
 * WHY IT IS NOT `isValidMonthKey` ALONE (reconciliation R-45). F03's shared validator checks
 * shape only — `/m/1899-01` and `/m/9999-12` pass it and render an empty month. R-45 ruled
 * that the shared validator keeps its shape-only contract, because `MonthKeySchema` and two
 * other features build on it, and that F07 adds the range check *at the route boundary*,
 * where a routing decision belongs. This module is that boundary.
 *
 * The bound is a sanity check, not a business rule: it exists so a crawler walking
 * `/m/0001-01` … `/m/9999-12` gets a cheap 404 instead of 120.000 database round trips.
 */

/** Postgres `date` can hold far more; this is the range a person can plausibly mean. */
export const MIN_MONTH_YEAR = 2000
export const MAX_MONTH_YEAR = 2100

export function isSupportedMonthKey(value: string): value is MonthKey {
  if (!isValidMonthKey(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= MIN_MONTH_YEAR && year <= MAX_MONTH_YEAR
}
