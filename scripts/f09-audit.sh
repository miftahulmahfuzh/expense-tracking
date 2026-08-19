#!/usr/bin/env bash
# F09 audits — the mechanical half of the "is the public page actually public-safe" sweep.
#
# Kept in the repo rather than run once, because EVERY check below fails silently. A share
# page that leaks a mutation still looks right; a share page served from a cache still looks
# right — it looks exactly like a live one, which is the whole problem with revoke; a `/s`
# entry in the proxy matcher just bounces the recipient to a Google sign-in and reads as
# "the link is broken"; and a bare colour swatch instead of a category code renders fine for
# everyone except the readers R-50's waiver was written for.
#
# Usage: bash scripts/f09-audit.sh
set -u
SHARE='app/(bare)/s/[token]'
LIB='lib/share'
COMP='components/share'
ACTION='app/actions/share.ts'
fail=0

check() { # check <label> <offending-lines>
  if [ -z "$2" ]; then
    echo "PASS  $1"
  else
    echo "FAIL  $1"
    echo "$2" | sed 's/^/        /'
    fail=1
  fi
}

expect_count() { # expect_count <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    echo "PASS  $1 ($3)"
  else
    echo "FAIL  $1 — expected $2, got $3"
    fail=1
  fi
}

# Drop `file:line:` hits whose line is a comment. Every identifier this script forbids is
# NAMED in a docblock explaining why it must not appear, so an un-filtered grep fails on the
# documentation rather than on the code.
# The `([^:]*:)?` is because `grep -n` over ONE file prints `12:` and over a directory
# prints `path:12:`; this script does both.
nocomment() { grep -vE '^([^:]*:)?[0-9]+: *(\*|//|/\*)' || true; }

present() { # present <label> <file> <pattern>
  if grep -q -- "$3" "$2"; then echo "PASS  $1"; else echo "FAIL  $1 — not found in $2"; fail=1; fi
}

# ---- the route must be reachable without a session -------------------------------------
# INVARIANT B in proxy.ts. If /s is ever matched, the friend gets a sign-in page instead of
# the expense and nothing downstream in this feature works at all.
check "proxy.ts does not match /s" \
  "$(grep -n "matcher" -A3 proxy.ts | grep -E "'/s(/|')" || true)"
check "/s reads no session" \
  "$(grep -rn "requireUserId\|from '@/auth'\|auth()" "$SHARE" | nocomment)"

# ---- no mutation surface on a public page ----------------------------------------------
# A Server Action referenced from a client module ships its callable id in that bundle.
check "no Server Action is imported anywhere under /s" \
  "$(grep -rn "@/app/actions\|from '\.\./\.\./\.\./actions" "$SHARE" | nocomment)"
# The barrel re-exports PhotoManager, which imports deletePhoto — so the gallery must be
# imported by its own path, or R-80's property rests on tree-shaking a re-export.
check "/s imports PhotoGallery by path, never through the photos barrel" \
  "$(grep -rn "from '@/components/photos'" "$SHARE" | nocomment)"
check "/s never reaches PhotoManager" \
  "$(grep -rn "PhotoManager" "$SHARE" | nocomment)"
check "/s renders no owner-side share control" \
  "$(grep -rn "ShareButton\|ShareLinkPanel\|@/components/share" "$SHARE" | nocomment)"

# ---- freshness: a revoked link must die within seconds ----------------------------------
# This route reads no cookie, so NOTHING else makes it dynamic (unlike /stats and /m, where
# R-75/R-115 correctly removed this export as a no-op). Without it the page is a prerender
# candidate and a revoked link can be served from the Full Route Cache.
present "/s is force-dynamic" "$SHARE/page.tsx" "export const dynamic = 'force-dynamic'"
check "no caching machinery on /s" \
  "$(grep -rn "unstable_cache\|'use cache'\|generateStaticParams\|revalidate = " "$SHARE" | nocomment)"
# R-98: a loading.tsx is a Suspense boundary, and a 200 that has begun streaming cannot
# become a 404. On the one public route the status code is what scanners and archivers read.
check "no loading.tsx over the token lookup" \
  "$(ls "$SHARE/loading.tsx" 2>/dev/null || true)"
present "Cache-Control: no-store on /s/:token" next.config.ts "private, no-store"
present "X-Robots-Tag: noindex on /s/:token" next.config.ts "noindex, nofollow, noarchive"

# robots.txt must NOT disallow /s: Meta's crawler honours it and the WhatsApp preview card
# would vanish, while Google could still index the URL without ever seeing the noindex.
check "robots.txt does not disallow /s" \
  "$(grep -n "disallow" -A2 app/robots.ts | grep -E "'/s(/|')" || true)"

# ---- the actions are the security boundary (R-5) ----------------------------------------
expect_count "every share action starts with requireUserId()" 2 \
  "$(grep -c "await requireUserId()" "$ACTION" | tr -d ' ')"
expect_count "every share action proves ownership via F03's anchor (R-99)" 2 \
  "$(grep -c "await getOwnedGroupAnchor(userId" "$ACTION" | tr -d ' ')"
# R-77: import the ownership check, never re-declare it. A second copy is the one that does
# not get hardened.
check "no hand-rolled ownership query in the share action" \
  "$(grep -n "expenseGroups" "$ACTION" | nocomment)"
# The bare form absorbs BOTH unique constraints; a targeted one lets a token collision
# escape as an unhandled 23505 (F09 §2.1, R-60).
present "the mint absorbs both unique constraints" "$ACTION" "onConflictDoNothing()"
check "onConflictDoNothing names no target" \
  "$(grep -n "onConflictDoNothing({" "$ACTION" | nocomment)"

# ---- the token ---------------------------------------------------------------------------
check "the token comes from the app's one CSPRNG generator" \
  "$(grep -rn "Math.random" "$LIB" "$COMP" "$ACTION" "$SHARE" | nocomment)"
present "mints with newShareToken()" "$ACTION" "newShareToken()"
# A token in a log line is a share link in a log aggregator, forever.
check "nothing logs a token" \
  "$(grep -rn "console\." "$LIB" "$COMP" "$ACTION" "$SHARE" | nocomment)"

# ---- the shared URL ----------------------------------------------------------------------
# window.location.origin on a preview deployment produces a *.vercel.app link that dies at
# the next push — a friend would be sent a URL that is already broken.
check "the origin is never read from the browser" \
  "$(grep -rn "window.location" "$COMP" "$LIB" | nocomment)"
check "lib/share/config.ts stays client-safe (no process.env)" \
  "$(grep -n "process.env" "$LIB/config.ts" | nocomment)"

# ---- design tokens and the CVD waiver ----------------------------------------------------
# R-24 / R-110: features define no colour. A literal hex renders correctly in whichever
# scheme its author had open and wrongly in the other.
check "no hardcoded hex in the share UI" \
  "$(grep -rniE '#[0-9a-f]{3,8}\b' "$SHARE" "$COMP" --include='*.tsx' || true)"
# R-111's standing constraint: F10's eight category hues are only legal because nothing keys
# a category by colour alone, and /s shows categories to a reader who is not the owner.
present "/s renders CategoryCode, not a bare colour swatch" "$SHARE/page.tsx" "CategoryCode"
check "/s uses no CategoryDot" \
  "$(grep -rn "CategoryDot" "$SHARE" || true)"

# ---- the preview card --------------------------------------------------------------------
# One static image for every link: Meta caches a scraped card for days, past a revoke.
check "no per-link opengraph-image" \
  "$(ls "$SHARE"/opengraph-image* 2>/dev/null || true)"
check "og-default.png exists" \
  "$([ -f public/og-default.png ] && echo '' || echo 'public/og-default.png missing — run npm run icons:generate')"

echo
if [ "$fail" = 0 ]; then echo "F09 audit: all checks passed"; else echo "F09 audit: FAILURES above"; fi
exit "$fail"
