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
 * THE PADDING MOVED OFF THE `<header>` and onto the inner row on purpose. Padding on the
 * header would survive the collapse — you would be left with a 60-odd px white band of notch
 * inset and `pb-4` that never goes away. Rendering is identical in the open state: an opaque
 * block with its padding inside is the same block.
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
        'sticky top-0 z-30 grid overflow-clip border-b bg-card',
        'transition-[grid-template-rows,border-color] duration-280 ease-out-soft',
        'motion-reduce:transition-none',
        active ? 'grid-rows-[0fr] border-transparent' : 'grid-rows-[1fr] border-rule',
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
       * height is set to. With `pt-safe-header pb-4` on the item, `0fr` bottomed out at 45px:
       * a white band of pure inset that never went away, header "collapsed" and all.
       *
       * So the item holds no padding and genuinely reaches zero, and the padded box inside it
       * overflows and is clipped by the header.
       */}
      <div className="min-h-0">
        {/*
         * The content also LEAVES UPWARD rather than just being sliced: the row collapsing on
         * its own reads as a window closing, and the brief was that the header moves up and
         * off the screen.
         */}
        <div
          className={cn(
            'pt-safe-header px-safe pb-4',
            'transition-transform duration-280 ease-out-soft motion-reduce:transition-none',
            active && '-translate-y-full',
          )}
        >
          {children}
        </div>
      </div>
    </header>
  )
}
