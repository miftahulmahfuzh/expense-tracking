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

# ─── F13, and read the arithmetic rather than the conclusion ──────────────────────────────
# `/new`'s review row puts MoneyInput in a fixed `w-[9.5rem]` column. At a 414px viewport the
# row has 340px for chip + amount (414 − 44 `px-safe` − 22 `Card padded="rows"` − 8 `gap-2`),
# the column takes 152, and MoneyInput's own chrome takes 50 of that:
#
#     pl-3.5 + pr-1.5 .... 20      → input = 152 − 52 = 100px, measured at 414x896
#     border ............. 2         `4.500.000` needs 81. Headroom: 19px.
#     static `Rp` span ... 20        `999.999.999` needs ~100. Headroom: ~0.
#     one gap-2.5 ........ 10
#
# Mind the border: the padding alone says 102, and the field is 100. It was ~110px of chrome
# until F13 dropped R-34's `IDR` badge, leaving the input 43 — and
# `min-w-0` meant it absorbed the whole 38px shortfall SILENTLY. That is the class of bug this
# check exists for: a clipped <input> throws no error, logs nothing, and looks like a smaller
# number, so `4.500.000` read `4.500.` on the screen the product exists for, in production,
# for a whole release (issue #3).
#
# So the floor is the guard, and this only holds the floor in place. A grep cannot measure a
# rendered width; an explicit `min-width` makes the next too-narrow container overflow where
# somebody sees it. Note that nothing here runs in CI — ci.yml is lint · typecheck · test ·
# db:check · build · format:check — which is the other half of why the guard has to be CSS.
#
# Comment lines are excluded, because the component explains this fix at length and would
# otherwise trip its own guard. A reintroduction lands inside a `className="…"` string, which
# carries no `//` or `*`, so the exclusion costs the check nothing.
check "MoneyInput keeps its width floor (never min-w-0)" \
  "$(grep -n 'min-w-0' components/ui/MoneyInput.tsx | grep -vE ':[[:space:]]*(//|\*)' || true)"

exit $fail
