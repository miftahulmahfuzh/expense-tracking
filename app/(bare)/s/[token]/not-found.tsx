import Link from 'next/link'

import { FOOTER_LABEL, NOT_FOUND_BODY, NOT_FOUND_TITLE } from './copy'

/**
 * One response for "never existed" and for "revoked" — same body, same status, after the
 * same single indexed lookup, so neither the page nor its timing tells the two apart.
 *
 * It also carries no way into the app beyond `/`. A stranger holding a dead link is not
 * someone to offer a sign-in button to.
 */
export default function ShareNotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-safe text-center">
      <p className="eyebrow">{NOT_FOUND_TITLE}</p>
      <p className="max-w-[28ch] text-item text-pretty text-ink-2">{NOT_FOUND_BODY}</p>
      <Link href="/" className="mt-3 text-meta text-ink-3 underline underline-offset-4">
        {FOOTER_LABEL}
      </Link>
    </main>
  )
}
