'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createExpense } from '@/app/actions/expenses'
import { discardStagedPhotos } from '@/app/actions/photos'
import type { Category } from '@/lib/categories'
import { useVisualViewport } from '@/lib/hooks/useVisualViewport'
import type { StagedPhoto } from '@/lib/photos/types'

import { SAVE_FAILED } from './copy'
import { initialState, reducer } from './draft'
import { clearDraft, isDraftMeaningful, loadDraft, saveDraft } from './draftStorage'
import { NewHeader } from './NewHeader'
import { PasteStage } from './PasteStage'
import { ReviewStage } from './ReviewStage'
import { SLOW_HINT_MS, useParse } from './useParse'
import { validateDraft } from './validate'

/**
 * The host: reducer, persistence, parse orchestration, save orchestration.
 *
 * Everything with a side effect lives here and nothing below it touches the network, storage
 * or the router — the two stage components are given values and callbacks, which is what
 * keeps them reviewable and the reducer testable.
 */

/** Long enough that a fast typist writes one entry, short enough that a mis-tap loses nothing. */
const PERSIST_DEBOUNCE_MS = 400

export function AddExpenseClient({
  userId,
  todayISO,
  backHref,
}: {
  userId: string
  todayISO: string
  backHref: string
}) {
  const router = useRouter()
  const [state, dispatch] = useReducer(reducer, todayISO, initialState)
  const [photosBusy, setPhotosBusy] = useState(false)
  const { run, running, elapsedMs } = useParse()

  useVisualViewport()

  const draft = state.draft

  /* ── restore ──────────────────────────────────────────────────────────────
   * Read in an effect, never during render. Reading localStorage while rendering would make
   * the server HTML and the first client render disagree, which is a hydration error — and
   * the failure mode is the whole screen being thrown away and re-rendered.
   * ─────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const restored = loadDraft(userId)
    // One dispatch either way, and the notice rides along inside it: a setState beside the
    // dispatch would be a second render for one logical change, and the lint rule against
    // setState in an effect body is right to object to it.
    if (restored && isDraftMeaningful(restored)) dispatch({ type: 'restore', draft: restored })
    else dispatch({ type: 'restore_none' })
  }, [userId])

  /* ── persist ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    // Never overwrite a stored draft before we have read it: on the first render `draft` is
    // the empty initial state, and writing that would erase exactly what we came to restore.
    if (!state.restored) return
    const id = window.setTimeout(() => saveDraft(userId, draft), PERSIST_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [draft, state.restored, userId])

  /*
   * Flush immediately when the tab is backgrounded. iOS can freeze or discard a tab without
   * ever firing the debounce timer, and that is precisely the mis-tap the draft exists to
   * survive. `pagehide` as well as `visibilitychange`, because Safari fires them
   * inconsistently between a home-swipe, a tab switch and a navigation.
   */
  useEffect(() => {
    if (!state.restored) return
    const flush = () => saveDraft(userId, draft)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [draft, state.restored, userId])

  /* ── parse ───────────────────────────────────────────────────────────────── */
  const doParse = useCallback(async () => {
    const rawText = draft.rawText.trim()
    if (rawText.length === 0 || running) return

    dispatch({ type: 'parse_start' })

    const outcome = await run(rawText, todayISO)
    if (outcome.ok) {
      dispatch({
        type: 'parse_success',
        parsed: outcome.parsed,
        source: outcome.source,
        degraded: outcome.degraded,
      })
    } else {
      dispatch({ type: 'parse_failure', failure: outcome.failure, fallback: outcome.fallback })
    }
  }, [draft.rawText, run, running, todayISO])

  /* ── save ────────────────────────────────────────────────────────────────── */
  /*
   * A ref, not the reducer's save state: two taps in the same tick both read the old state
   * and both get through. The ref is written synchronously, so the second tap sees it.
   */
  const savingRef = useRef(false)

  const doSave = useCallback(async () => {
    if (savingRef.current || photosBusy) return

    const invalid = validateDraft(draft)
    if (invalid) {
      dispatch({ type: 'invalid', errors: invalid.errors, focus: invalid.focus })
      return
    }

    savingRef.current = true
    dispatch({ type: 'save_start' })

    try {
      /*
       * One transaction: group + items + photo rows. The blobs are already in storage — F06
       * uploads them while the user is still editing the table (R-2 / decision D-C) — so this
       * is a single fast round trip rather than a multi-megabyte upload on the tap that most
       * needs to feel instant.
       */
      const { id } = await createExpense({
        title: draft.title.trim(),
        occurred_on: draft.occurredOn,
        items: draft.items.map((item) => ({
          name: item.name.trim(),
          // Non-null by validateDraft, which returned null above.
          amount_idr: item.amountIdr as number,
          category: item.category,
        })),
        note: draft.note.trim() || undefined,
        rawText: draft.rawText.trim() || undefined,
        photos: draft.photos,
      })

      // Clear BEFORE navigating: a fast back-tap must not resurrect a draft that is now a
      // saved expense, which would read as the save having failed.
      clearDraft(userId)
      router.push(`/e/${id}`)
      /*
       * Deliberately leaving save.kind === 'saving' and savingRef true. The button stays busy
       * through the navigation, which is honest — the work is done and the next screen is
       * loading — and it cannot be tapped a second time on a slow connection.
       */
    } catch {
      /*
       * Next redacts Server Action error messages in production, so there is nothing useful
       * to read and F05 never tries. The draft is untouched: the user taps Simpan again.
       */
      savingRef.current = false
      dispatch({ type: 'save_failure', message: SAVE_FAILED })
    }
  }, [draft, photosBusy, router, userId])

  /* ── discard a restored draft ───────────────────────────────────────────── */
  const discardRestored = useCallback(() => {
    /*
     * "Mulai baru" means the staged blobs are now unreferenced. F06's §11.1 says anything the
     * user explicitly discards goes now rather than waiting for the orphan sweep, and
     * `discardStagedPhotos` refuses any pathname a row references, so this cannot touch a
     * saved photo. Fire and forget: the reset must not wait on the network.
     */
    const pathnames = draft.photos.map((photo) => photo.blobPathname)
    if (pathnames.length > 0) void discardStagedPhotos(pathnames)

    clearDraft(userId)
    dispatch({ type: 'reset', todayISO })
  }, [draft.photos, todayISO, userId])

  const parseFailure = state.parse.kind === 'error' ? state.parse.failure : null

  // Memoised as one object so ReviewStage's focus effect, which depends on onFocusHandled,
  // is not re-armed on every keystroke.
  const handlers = useMemo(
    () => ({
      onTitleChange: (value: string) => dispatch({ type: 'set_title', value }),
      onDateChange: (value: string) => dispatch({ type: 'set_date', value }),
      onNoteChange: (value: string) => dispatch({ type: 'set_note', value }),
      onRawChange: (value: string) => dispatch({ type: 'set_raw', value }),
      onItemName: (key: string, value: string) => dispatch({ type: 'set_item_name', key, value }),
      onItemAmount: (key: string, value: number | null) =>
        dispatch({ type: 'set_item_amount', key, value }),
      onItemAmountUnparsed: (key: string, rawText: string) =>
        dispatch({ type: 'item_amount_unparsed', key, rawText }),
      onItemCategory: (key: string, value: Category) =>
        dispatch({ type: 'set_item_category', key, value }),
      onAddItem: () => dispatch({ type: 'add_item' }),
      onRemoveItem: (key: string) => dispatch({ type: 'remove_item', key }),
      onPhotosChange: (photos: StagedPhoto[]) => dispatch({ type: 'set_photos', photos }),
      onFocusHandled: () => dispatch({ type: 'clear_focus' }),
    }),
    [],
  )

  return (
    /*
     * --app-h comes from useVisualViewport and SHRINKS when the iOS keyboard opens, which is
     * what keeps the sticky bar above it; 100dvh is only the fallback for the first paint and
     * for a browser with no visualViewport.
     *
     * THE COLUMN RUNS TO THE PHYSICAL BOTTOM OF THE SCREEN, home indicator included. Height
     * was once `100dvh - env(safe-area-inset-bottom)`, to match a `pb-safe` the (bare) layout
     * used to wrap every screen in, which left the sticky footer's white block floating above
     * a ~34px strip of page background. The footer IS the bottom of this screen, so it has to
     * paint down to the edge; `StickyBar`'s own 8px is what sets the label's clearance now.
     * The layout no longer pads, so there is nothing left here to subtract or cancel.
     *
     * min(), not a bare `var(--app-h)`, so a browser reporting a visual viewport TALLER than
     * the layout one (mid-scroll, collapsing URL bar) cannot stretch the column past the
     * screen. When the keyboard opens --app-h is the smaller of the two and wins, which is
     * what keeps the bar above the keys.
     *
     * `relative` + `top: var(--vv-top)` is the other half of the same problem. --app-h says how
     * TALL the visible band is; --vv-top says WHERE it is. iOS reveals a focused field by
     * sliding the visual viewport down the layout viewport — the layout one never shrinks for
     * the keyboard — so an app-h-tall column anchored at layout y=0 is off by that slide: its
     * header hangs off the top of the screen and an equal band of bare page background appears
     * under the Simpan bar. 46px of it, measured on an XS Max. Offsetting by the same number
     * puts the column back on the band the user is looking at, and the two properties together
     * describe the visual viewport exactly — so a bigger slide moves the column with it rather
     * than pushing the bar behind the keys.
     *
     * `relative`, NOT `transform: translateY` and NOT `margin-top`. A transform makes its
     * element the containing block for every `position: fixed` DESCENDANT, and this subtree has
     * real ones: F06's Lightbox is `fixed inset-0` and is reachable from the PhotoPicker on this
     * very screen, so it would shrink from full-screen to this column. A margin would collapse
     * straight out through the `(bare)` wrapper and the shell's two `min-h-dvh` ancestors. A
     * relative offset shifts only what this element paints — it leaves document height alone,
     * does not disturb the `sticky` bar inside it, and every absolutely-positioned descendant in
     * here (Button's spinner, the photo tiles, `touch-target`) already carries its own
     * `relative`, so nothing re-anchors to it.
     */
    <div
      className="relative flex flex-col"
      style={{
        height: 'min(var(--app-h, 100dvh), 100dvh)',
        top: 'var(--vv-top, 0px)',
      }}
    >
      <NewHeader backHref={backHref} />

      {/* The scroller, not the page. The sticky bar lives INSIDE it, which is what lets it
          ride above the keyboard instead of under it. */}
      <main className="flex min-h-0 flex-1 flex-col scroll-pane">
        {draft.stage === 'paste' ? (
          <PasteStage
            rawText={draft.rawText}
            parse={state.parse}
            elapsedMs={elapsedMs}
            slowAfterMs={SLOW_HINT_MS}
            restoredNotice={state.restoredNotice}
            onRawChange={handlers.onRawChange}
            onParse={doParse}
            onManual={() => dispatch({ type: 'manual_entry' })}
            onDiscardRestored={discardRestored}
          />
        ) : (
          <ReviewStage
            draft={draft}
            errors={state.errors}
            focus={state.focus}
            save={state.save}
            parseFailure={parseFailure}
            degraded={state.degraded}
            reparsing={running}
            photosBusy={photosBusy}
            onPhotosBusyChange={setPhotosBusy}
            onReparse={doParse}
            onSave={doSave}
            {...handlers}
          />
        )}
      </main>
    </div>
  )
}
