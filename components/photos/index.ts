/**
 * F06's published surface. F05 and F07 import from here and nothing else.
 *
 * ONE EXCEPTION, F09's: `app/(bare)/s/[token]/page.tsx` imports `./PhotoGallery` directly.
 * This barrel re-exports `PhotoManager`, which imports `deletePhoto`, so importing the
 * gallery *through here* would put a Server Action in the public share page's module graph
 * and leave R-80's property resting on the bundler tree-shaking a re-export. It very likely
 * would — and it would fail silently, on the one route served to people with no account.
 * The deep import makes the graph itself the guarantee (tests/share.bundle.test.ts).
 *
 * `Lightbox` is deliberately NOT exported: PhotoGallery owns it, and a caller reaching for
 * it directly would be building a second viewer with its own idea of what a photo overlay
 * is. `usePhotoUploads` is likewise internal — PhotoPicker is the interface.
 *
 * WHICH GALLERY (reconciliation R-26):
 *   /e/[id]     PhotoManager  — carries deletePhoto
 *   /s/[token]  PhotoGallery  — imports no action, so the public bundle carries none
 */

export { PhotoPicker } from './PhotoPicker'
export type { PhotoPickerProps } from './PhotoPicker'

export { PhotoGallery } from './PhotoGallery'
export type { PhotoGalleryProps } from './PhotoGallery'

export { PhotoManager } from './PhotoManager'
export type { PhotoManagerProps } from './PhotoManager'
