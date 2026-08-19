#!/usr/bin/env bash
# F05 audits — the mechanical half of the plan's §14/§15 sweeps.
#
# Kept in the repo rather than run once, because every one of these fails SILENTLY: Tailwind
# emits nothing for a class it cannot resolve, and a single sub-17px field re-introduces a
# Safari zoom that tapping away does not undo. "Someone will notice" is not a plan.
set -u
FEATURE='app/(bare)/new'
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

check "no F05 control given a sub-17px type size" \
  "$(grep -rnE 'text-(label|meta|action|btn|chip|body|item|money-sm)' "$FEATURE" |
    grep -iE '<(Input|TextArea|MoneyInput)|CONTROL_CLASS' || true)"

# components/ui/index.ts: never write a raw <input>. type="hidden" is exempt — no font size,
# cannot take focus.
check "no bare focusable input/textarea/select" \
  "$(grep -rnE '<(input|textarea|select)[ />]' "$FEATURE" | grep -v 'type="hidden"' || true)"

# R-52j reset the colour namespace; these names no longer exist.
check "no dead R-52j token names" \
  "$(grep -rnE 'bg-gray-|text-neutral-|bg-neutral-|border-neutral-|(bg|text|border)-red-[0-9]|--color-(surface|border|danger|text-muted|warning|focus)' \
    "$FEATURE" lib/hooks app/actions/expenses.ts || true)"

# 100vh on iOS is the URL-bar-collapsed height. --app-h, with 100dvh as the only fallback.
check "no 100vh" \
  "$(grep -rn '100vh' "$FEATURE" lib/hooks | grep -v 'must appear nowhere' || true)"

check "Button uses fullWidth/destructive, not full/danger" \
  "$(grep -rnE '<Button[^>]*\b(full|variant="danger")\b' "$FEATURE" || true)"

# F05 holds StagedPhoto[] and nothing else: no upload, no compression, no Blob, no DB.
check "F05 imports no db, blob or attachPhoto" \
  "$(grep -rnE "^import .*(@/lib/db|@/lib/blob)|attachPhoto\(" "$FEATURE" || true)"

exit $fail
