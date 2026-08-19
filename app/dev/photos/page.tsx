import { notFound } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getGroupDetail } from '@/lib/db/queries'

import { getOrCreateScratchGroup } from './actions'
import { isDevOnlyRouteEnabled } from './guard'
import { PhotoHarness } from './PhotoHarness'

/**
 * `/dev/photos` — the F06 QA scaffold. NOT SHIPPABLE UI.
 *
 * WHY THIS EXISTS. F06's Phase 8 is a 19-step manual table on a real iPhone XS Max against a
 * real preview deployment, plus the EXIF/GPS privacy gate and the R-29 orientation gate —
 * and R-29 says ship nothing until a real portrait photo renders upright. But F06 ships no
 * page: /new is F05 and /e/[id] is F07. Without this harness every one of those gates would
 * have to wait for two later features, which is precisely how a "hard gate" quietly becomes
 * something nobody ever ran.
 *
 * Both modes are on one screen:
 *   staged    what /new will do — upload now, hold StagedPhoto[] in client state.
 *   attached  what /e/[id] will do — attachPhoto per upload against a real group row,
 *             then the gallery and lightbox read from the database through getGroupDetail.
 *
 * DELETE THIS DIRECTORY when F07 ships. Its scratch group is written by ./actions.ts.
 */
export const metadata = { title: 'Dev · Foto' }

export default async function DevPhotosPage() {
  // Guarded here rather than in a config so deploying it by accident is a 404, not a leak.
  // Open on preview, closed in production — see ./guard.ts for why NODE_ENV is not enough.
  if (!isDevOnlyRouteEnabled()) notFound()

  // /dev is not in proxy.ts's matcher (it enumerates real routes only), so this page is its
  // own boundary — which is the pattern R-5 says every page must follow anyway.
  await requireUserId()

  const userId = await requireUserId()
  const groupId = await getOrCreateScratchGroup()
  const group = await getGroupDetail(userId, groupId)

  return (
    <AppShell>
      <PhotoHarness groupId={groupId} photos={group?.photos ?? []} />
    </AppShell>
  )
}
