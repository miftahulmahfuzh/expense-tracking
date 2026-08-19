import { notFound } from 'next/navigation'
import { KitchenSink } from './KitchenSink'

/**
 * `/dev/ui` — the design-QA scaffold. NOT shippable UI.
 *
 * It exists so the Visual QA and Accessibility checklists in
 * docs/plans/F10-design-system.md can be run against every primitive on one screen, in both
 * themes, at 414×896. Delete it or leave it gated before v0.1.0 ships.
 *
 * It sits in the (shell) group deliberately: the tab bar and the Toast's `:has([data-tabbar])`
 * lift are two of the things that need checking.
 */
export const metadata = { title: 'UI' }

export default function DevUiPage() {
  // Cannot reach production. The guard is here rather than in a config so that deploying it
  // by accident is a 404 rather than a leak.
  if (process.env.NODE_ENV === 'production') notFound()
  return <KitchenSink />
}
