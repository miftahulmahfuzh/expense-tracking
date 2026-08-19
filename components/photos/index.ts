/**
 * F06's published surface. F05, F07 and F09 import from here and nothing else.
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
