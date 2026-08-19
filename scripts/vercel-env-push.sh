#!/usr/bin/env bash
# Push the environment variables in .env.local to Vercel.
#
#   ./scripts/vercel-env-push.sh          # dry run: shows what WOULD be pushed
#   ./scripts/vercel-env-push.sh --apply  # actually calls `vercel env add`
#
# Run it after `vercel login` and `vercel link`. It prints variable NAMES and value
# lengths, never values.
#
# Why this exists rather than the one-liner in docs/plans/F01-foundation.md Task 27:
# that loop is `grep "^VAR=" .env.local | cut -d= -f2-`, which keeps any surrounding
# quotes. Several values in this repo's .env.local are quoted, so it would store
# LLM_BASE_URL as "https://api.z.ai/api/anthropic" — quotes included — and the
# production build would then die on lib/env.ts's z.url() check with a message that
# looks like a missing variable rather than a malformed one.
set -euo pipefail

cd "$(dirname "$0")/.."

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

if [[ ! -f .env.local ]]; then
  echo "FAIL  .env.local not found. Run from the repo root." >&2
  exit 1
fi

# Present in every environment.
ALL_ENVS=(LLM_API_KEY LLM_BASE_URL LLM_MODEL DATABASE_URL DATABASE_URL_UNPOOLED AUTH_SECRET)
# Pushed only if already set locally (F02 owns them; they happen to exist already).
OPTIONAL=(AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET)

# Reads a key out of .env.local and strips surrounding single or double quotes.
read_env() {
  local key="$1" line value
  line="$(grep -m1 -E "^${key}=" .env.local || true)"
  [[ -z "$line" ]] && return 1
  value="${line#*=}"
  # Strip one layer of matching quotes.
  if [[ "$value" == \"*\" ]]; then value="${value:1:${#value}-2}"; fi
  if [[ "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
  [[ -z "$value" ]] && return 1
  printf '%s' "$value"
}

push() { # push KEY ENV...
  local key="$1"; shift
  local value
  if ! value="$(read_env "$key")"; then
    echo "skip  $key (absent or empty in .env.local)"
    return 0
  fi
  echo "push  $key -> $* (${#value} chars)"
  if $APPLY; then
    # printf, not echo: no trailing newline gets stored as part of the value.
    printf '%s' "$value" | vercel env add "$key" "$@"
  fi
}

for VAR in "${ALL_ENVS[@]}" "${OPTIONAL[@]}"; do
  # `vercel env add` refuses to combine development with production/preview, so the
  # development environment needs its own invocation.
  push "$VAR" production preview
  push "$VAR" development
done

# AUTH_URL is production-only (roadmap §4.8): every preview deployment has a different
# *.vercel.app origin, so pinning it would break the OAuth callback there. Auth.js
# infers the origin from the request in dev and preview instead.
echo "push  AUTH_URL -> production (https://expensetracking.online)"
if $APPLY; then
  printf 'https://expensetracking.online' | vercel env add AUTH_URL production
fi

if $APPLY; then
  echo
  echo "Done. Verify with: vercel env ls"
  echo "Then mark LLM_API_KEY, DATABASE_URL, DATABASE_URL_UNPOOLED and AUTH_SECRET as"
  echo "Sensitive in Project Settings > Environment Variables."
else
  echo
  echo "DRY RUN — nothing was sent. Re-run with --apply to push."
fi
