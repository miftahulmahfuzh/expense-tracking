/**
 * The loading state for a parse.
 *
 * A SKELETON, NOT A SPINNER, and the design system agrees — "nothing in this system spins"
 * (R-52b). It shows the SHAPE of what is coming, sized from the paste's line count, so the
 * page does not reflow when the real table lands. A spinner would tell the user only that
 * something is happening; this tells them what to expect.
 *
 * `.skeleton` is F10's global class (the pulse and the fill live in globals.css), so the
 * animation matches F07's and F08's loading states rather than being re-invented here.
 *
 * aria-hidden because it is decorative: the announcement is the role="status" line in
 * PasteStage, which says it once instead of reading eight empty rows.
 */
export function ReviewSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true">
      <div className="skeleton mb-2 h-3 w-16" />
      <div className="skeleton mb-4 h-control w-2/3" />
      <div className="skeleton mb-2 h-3 w-14" />
      <div className="skeleton mb-5 h-control w-1/2" />

      <ul className="rounded-card bg-card px-3">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="border-b border-rule py-3 last:border-b-0">
            <div className="flex gap-2">
              <div className="skeleton h-control flex-1" />
              <div className="size-touch shrink-0" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="skeleton size-disc rounded-full" />
              <div className="skeleton h-touch w-24 rounded-full" />
              <div className="skeleton ml-auto h-control w-[9.5rem]" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
