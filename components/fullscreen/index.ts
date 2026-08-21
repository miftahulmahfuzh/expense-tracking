/**
 * The fullscreen feature's published surface.
 *
 * `(shell)/layout.tsx` imports the provider; `/m/[month]` imports the toggle and the header
 * shell. `useFullscreen` is exported for `TabBar`, which is the one design-system component
 * that has to know about this state.
 */

export { FullscreenProvider, useFullscreen } from './FullscreenProvider'
export type { FullscreenApi } from './FullscreenProvider'

export { FullscreenToggle } from './FullscreenToggle'
