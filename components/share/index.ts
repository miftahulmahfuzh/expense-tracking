/**
 * F09's published surface. `/e/[id]` imports from here and nothing else.
 *
 * Both are `'use client'` and both are rendered by the SERVER page and handed to
 * `ExpenseEditor` as slots — the pattern R-104 set for F06's photo components — so the
 * client editor never learns what they are and neither component needs a query.
 *
 * NOT EXPORTED, and deliberately: nothing from here may be imported by `app/(bare)/s/`.
 * The public page renders no client component that reaches `app/actions/`, which is the
 * property `tests/share.bundle.test.ts` asserts.
 */

export { ShareButton } from './ShareButton'
export type { ShareButtonProps } from './ShareButton'

export { ShareLinkPanel } from './ShareLinkPanel'
export type { ShareLinkPanelProps } from './ShareLinkPanel'
