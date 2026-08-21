import Link from 'next/link'

import { RED_STICKER } from '@/components/ui'

import { FOOTER_LABEL, NOT_FOUND_BODY, NOT_FOUND_TITLE } from './copy'

/**
 * Unknown token, revoked token, deleted photo — one screen for all three (F12 §4).
 *
 * The only outbound link is `/`, matching `/s/[token]`'s rule and asserted the same way by
 * `tests/share.bundle.test.ts`: this page must not advertise that `/m`, `/e`, `/new` or `/stats`
 * exist. They would all bounce to sign-in, so nothing leaks — but it tells a stranger there is
 * an account behind this, and makes the page look broken rather than empty.
 */
export default function PhotoNotFound() {
  return (
    <main className="pt-safe-header px-safe">
      <p className="sticker" style={RED_STICKER}>
        {FOOTER_LABEL}
      </p>
      <h1 className="mt-4 text-title">{NOT_FOUND_TITLE}</h1>
      <p className="mt-2 text-body text-ink-2">{NOT_FOUND_BODY}</p>
      <footer className="mt-9 border-t-2 border-rule pt-3.5 pb-5.5">
        <Link href="/" className="text-meta text-ink-3 underline underline-offset-4">
          {FOOTER_LABEL}
        </Link>
      </footer>
    </main>
  )
}
