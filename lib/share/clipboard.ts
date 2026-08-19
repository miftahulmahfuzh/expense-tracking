/**
 * Copy text to the clipboard, reporting whether it actually worked — F09 §2.3.
 *
 * TWO PATHS, and the second is not legacy cruft. iOS Safari's async Clipboard API also
 * requires transient user activation and rejects once the calling gesture has expired,
 * which is precisely the state we are in when we arrive here: we get here because
 * `navigator.share()` already failed for that same reason.
 *
 * The caller must handle `false`. Both paths can fail, and the answer to that is showing
 * the URL in a selected input so the user can long-press → Copy — not a toast claiming a
 * copy that did not happen.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Activation expired, or the document is not focused. Fall through.
  }

  // A selected off-screen textarea + execCommand. Deprecated, and the last thing between
  // the user and copying by hand. `position: fixed` with no scroll offset keeps iOS from
  // scrolling the page to the element before selecting it.
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '-1000px'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    el.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}
