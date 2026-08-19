/**
 * Byte formatting for the picker's tiles — docs/plans/F06-photos.md Task 8.
 *
 * Kept out of lib/format.ts on purpose: that module is the app's money and date
 * vocabulary (F03a), imported by nearly every screen. File sizes are a detail of one
 * feature's progress UI and are never rendered anywhere else, so they live next to the
 * only thing that shows them.
 */

/** "4,2 MB" / "287 KB" — id-ID writes the decimal separator as a comma. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb.toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
}

/**
 * "4,2 MB → 287 KB (93% lebih kecil)".
 *
 * The tile shows this instead of a bare final size because the saving is the reassuring
 * part: the user just watched a 4 MB photo upload over cellular in under two seconds and
 * this is why. Clamped at 0 so a pathological case where compression grows the file
 * (a tiny, already-optimal JPEG) reads "0% lebih kecil" rather than a negative number.
 */
export function formatSavings(originalBytes: number, compressedBytes: number): string {
  const pct =
    originalBytes > 0 ? Math.max(0, Math.round((1 - compressedBytes / originalBytes) * 100)) : 0
  return `${formatBytes(originalBytes)} → ${formatBytes(compressedBytes)} (${pct}% lebih kecil)`
}
