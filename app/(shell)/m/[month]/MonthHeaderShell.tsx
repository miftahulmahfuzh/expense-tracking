'use client'

import type * as React from 'react'

import { useFullscreen } from '@/components/fullscreen'
import { cn } from '@/lib/cn'

/**
 * The month header's outer `<header>`, made collapsible.
 *
 * WHY THIS IS THE HEADER ITSELF AND NOT A WRAPPER AROUND IT. The obvious shape — a client
 * `<div>` wrapping the existing server `<header>` and shrinking it — silently breaks the
 * stickiness, because `position: sticky` slides an element within its CONTAINING BLOCK, which
 * is its parent. Today the header's parent is `<main>`, so it has the whole page to travel
 * down. Give it a wrapper sized to its own content and it has nowhere to go: the header
 * scrolls away with the list and nothing anywhere reports a failure. So the collapse has to
 * happen INSIDE the header, and the header has to stay a direct child of `<main>`.
 *
 * `MonthHeader` therefore stays a server component and hands its content here as children.
 * Its own docstring is the reason: making it a client component would ship `Money`, `cn` and
 * the whole month-arithmetic module to the browser in order to render two links.
 *
 * THE COLLAPSE IS `grid-template-rows: 1fr → 0fr`, which is animatable and — unlike a
 * `height` or `max-height` transition — needs no measured pixel value. A magic number for
 * the header's height is exactly the fragility this route already rejected once: see the note
 * in `page.tsx` about the day headings' `top-[8.5rem]`, a literal that had to be re-measured
 * every time the type scale moved and hid content when it was wrong. There is nothing to
 * re-measure here.
 *
 * THE PADDING IS SPLIT BETWEEN THE TWO LEVELS, and which half goes where is the whole of it:
 * whatever sits on the `<header>` SURVIVES the collapse and whatever sits on the inner box
 * goes with it. So `pb-4` and the 1.75rem of decorative air go inside, where they are supposed
 * to disappear — and the notch inset stays out on the header, because content must clear the
 * status bar in the collapsed state too. Rendering in the open state is identical either way:
 * an opaque block with its padding inside is the same block.
 *
 * WHAT THE COLLAPSED HEADER MEASURES, therefore, is the notch inset plus its 1px transparent
 * border — 45px on an iPhone XS Max, 1px on anything without a notch. It is not zero, and
 * should not be.
 *
 * `overflow-clip` IS UNCONDITIONAL, and `clip` rather than `hidden`. Unconditional because
 * removing it on the way out would show the content at full size, unclipped, sliding down
 * over the list for the length of the animation; keeping it makes the open a wipe. `clip`
 * rather than `hidden` because `hidden` creates a scroll container — which is the other half
 * of the trap above, and would give a future sticky child inside this header a box that never
 * scrolls to stick to.
 */
export function MonthHeaderShell({ children }: { children: React.ReactNode }) {
  const { active } = useFullscreen()

  return (
    <header
      className={cn(
        /*
         * `pt-safe` IS ON THE HEADER, NOT ON THE COLLAPSING BOX, and this is the notch fix.
         *
         * The clearance used to be a single `pt-safe-header` — `env(safe-area-inset-top) +
         * 1.75rem` — on the inner box, so collapsing that box took the notch inset with it and
         * the first day sticker landed under the status bar: on an iPhone XS Max in standalone,
         * behind the clock and the battery. Splitting the token is the whole repair. The inset
         * half lives out here where the collapse cannot reach it and is therefore honoured in
         * BOTH states; the inner box keeps only the 1.75rem of decorative air. Their sum is
         * `pt-safe-header` exactly, so the open header is unchanged to the pixel.
         *
         * It could not have been caught in a desktop browser: `env(safe-area-inset-*)` is 0
         * everywhere except on a notched device with `viewport-fit=cover`, so the bug renders
         * perfectly on anything you can screenshot on a laptop.
         */
        'sticky top-0 z-30 grid overflow-clip border-b pt-safe',
        'transition-[grid-template-rows,border-color,background-color] duration-280',
        'ease-out-soft motion-reduce:transition-none',
        active
          ? /*
             * OPAQUE while collapsed, and it has to be. This band stays `sticky top-0`, so a
             * transparent one would fix the resting position and nothing else — list rows would
             * scroll straight up through it and back under the clock. `paper` rather than the
             * open state's `card`: at this height it is not a header any more, it is the page
             * continuing beneath the status bar, and the white would read as a leftover stub.
             */
            'grid-rows-[0fr] border-transparent bg-paper'
          : 'grid-rows-[1fr] border-rule bg-card',
      )}
    >
      {/*
       * TWO NESTED DIVS, AND THE SPLIT IS THE WHOLE TRICK. The grid item carries `min-h-0`
       * and NOTHING ELSE; the padding lives one level further in.
       *
       * `min-h-0` alone is not enough, and this cost a measurement to find: a grid item's
       * automatic minimum size is its content, so without it the row will not shrink at all.
       * But the item is also `box-sizing: border-box` — every element in this app is — and a
       * border-box element CANNOT be shorter than its own vertical padding, whatever its
       * height is set to. With the padding on the item, `0fr` bottomed out at 44px of stranded
       * inset instead of collapsing, "collapsed" header and all.
       *
       * So the item holds no padding and the ROW genuinely reaches zero, and the padded box
       * inside it overflows and is clipped by the header. Note this is a different 44px from
       * the one the header keeps on purpose: that one is deliberate notch clearance out on the
       * `<header>`, this one was the row refusing to close. Same number, opposite intent.
       */}
      <div className="min-h-0">
        {/*
         * The content also LEAVES UPWARD rather than just being sliced: the row collapsing on
         * its own reads as a window closing, and the brief was that the header moves up and
         * off the screen.
         */}
        <div
          className={cn(
            // `pt-7` is the 1.75rem half of `pt-safe-header`; the notch inset half is on the
            // <header> above, where the collapse cannot take it away. Do not merge them back.
            'pt-7 px-safe pb-4',
            'transition-transform duration-280 ease-out-soft motion-reduce:transition-none',
            /*
             * `100%` PLUS THE INSET, not `100%`. Overflow clips to the PADDING BOX, so the
             * header's own `pt-safe` band is inside the clip, not outside it — travelling
             * exactly one content-height leaves the content's bottom edge sitting in that band,
             * and the tail of the month header ("18 catatan · 47 item", and the underside of the
             * hero total) stays legible across the notch. Only visible with a real inset, so it
             * reads as clean on any desktop screenshot. One extra inset of travel puts the
             * content's bottom edge on the header's top edge, where the clip finally takes it.
             */
            active && '-translate-y-[calc(100%+env(safe-area-inset-top))]',
          )}
        >
          {children}
        </div>
      </div>
    </header>
  )
}
