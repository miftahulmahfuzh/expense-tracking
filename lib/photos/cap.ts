import 'server-only'

import { env } from '@/lib/env'

/**
 * The effective per-group photo cap, for this deployment.
 *
 * Why a function and not an exported const: nothing here is expensive, and a const would
 * read as a compile-time value at every call site — which is exactly the mistake this file
 * exists to prevent. The cap is configuration now, so it is spelled like configuration.
 *
 * Why this lives beside ./constants rather than in it: `constants.ts` is imported by client
 * components, and `@/lib/env` is `server-only`. Merging the two would pull `server-only`
 * into the browser bundle and break the build — see the header of ./constants and the
 * module-graph assertions in tests/photos.bundle.test.ts.
 *
 * OPERATIONAL NOTE. `env` is validated once at module load, and Vercel applies an
 * environment-variable change only to *new* deployments — never retroactively to a running
 * one. So changing `PHOTO_MAX_PER_GROUP` needs a redeploy to take effect. It does not need
 * a commit, which was the point: Project Settings > Environment Variables, then Redeploy
 * (or `vercel --prod`).
 *
 * The value reaches the browser as a PROP, never as an import — `/new` and `/e/[id]` read
 * it in their Server Components and hand it to `PhotoPicker`. That is deliberate: the
 * `NEXT_PUBLIC_` alternative would inline the number into the client bundle at BUILD time,
 * which is both a rebuild rather than a redeploy and a violation of the rule .env.example
 * states without exception.
 */
export function maxPhotosPerGroup(): number {
  return env.PHOTO_MAX_PER_GROUP
}
