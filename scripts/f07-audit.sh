#!/usr/bin/env bash
# F07 audits — the mechanical half of the security and design sweeps for /m/[month] and /e/[id].
#
# Kept in the repo rather than run once, for the same reason F05's is: every check below fails
# SILENTLY. Tailwind emits nothing for a class it cannot resolve; a sub-17px field re-introduces
# a Safari zoom that tapping away does not undo; and an unscoped mutation is invisible until it
# is someone else's data.
set -u
MONTH='app/(shell)/m'
DETAIL='app/(bare)/e'
ACTIONS='app/actions/items.ts app/actions/expenses.ts app/actions/_revalidate.ts'
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

# ---- security ---------------------------------------------------------------

# R-5: requireUserId() is the boundary, not proxy.ts. One per exported action, plus one per
# protected page and one for the detail page's generateMetadata.
expect_count "every action in items.ts opens with requireUserId" 3 \
  "$(grep -c 'await requireUserId()' app/actions/items.ts)"
expect_count "createExpense + updateExpenseMeta + deleteExpense all call requireUserId" 3 \
  "$(grep -c 'await requireUserId()' app/actions/expenses.ts)"

# §4.4: an item id proves nothing. Every write must be preceded by an ownership anchor and
# scoped by what it proved.
check "no mutation in F07's actions scoped by a bare id" \
  "$(grep -nE '\.where\(eq\((expenseItems|expenseGroups)\.id' app/actions/items.ts app/actions/expenses.ts || true)"

# R-77: import the ownership primitives, never re-declare them. F07's plan proposed a private
# app/actions/_guard.ts; two copies of this check is how one of them stops being hardened.
check "F07 declares no second ownership check" \
  "$(grep -rnE 'function (assertOwned|assertGroupOwned|itemOwnedBy|photoOwnedBy)' app/actions "$MONTH" "$DETAIL" || true)"

# A client bundle must never reach the database or the blob token.
check "no client module under /e or /m imports lib/db or lib/blob" \
  "$(grep -rln "'use client'" "$MONTH" "$DETAIL" |
    xargs -r grep -nE "^import .*(@/lib/db|@/lib/blob)" | grep -v 'import type' || true)"

# R-17 / CD-2: deleteExpense signals by throwing NEXT_REDIRECT. A catch-all swallows it.
check "no try/catch around deleteExpense" \
  "$(grep -rn -A3 'await deleteExpense(' "$DETAIL" | grep -E 'catch' || true)"

# ---- freshness --------------------------------------------------------------

# Every mutating action must bust /e/<id> AND the group's month, or the month list keeps
# reporting a total that is no longer true.
expect_count "every write in items.ts revalidates the group" 3 \
  "$(grep -c 'revalidateGroup(' app/actions/items.ts)"
check "F07's actions revalidate through the shared helper, not ad-hoc paths" \
  "$(grep -n "revalidatePath(\`/m/" app/actions/items.ts || true)"

# ---- iOS / design system ----------------------------------------------------

check "no F07 control given a sub-17px type size" \
  "$(grep -rnE 'text-(label|meta|action|btn|chip|body|item|money-sm)' "$MONTH" "$DETAIL" |
    grep -iE '<(Input|TextArea|MoneyInput)|CONTROL_CLASS' || true)"

# components/ui/index.ts: never write a raw <input>.
check "no bare focusable input/textarea/select" \
  "$(grep -rnE '<(input|textarea|select)[ />]' "$MONTH" "$DETAIL" | grep -v 'type="hidden"' || true)"

# R-52j reset the colour namespace; these names no longer exist and compile to nothing.
check "no dead R-52j token names" \
  "$(grep -rnE 'bg-gray-|text-neutral-|bg-neutral-|border-neutral-|(bg|text|border)-red-[0-9]|--color-(surface|border|danger|text-muted|warning|focus)' \
    "$MONTH" "$DETAIL" $ACTIONS || true)"

# 100vh on iOS is the URL-bar-collapsed height.
check "no 100vh" \
  "$(grep -rn '100vh' "$MONTH" "$DETAIL" || true)"

check "Button uses fullWidth/destructive, not full/danger" \
  "$(grep -rnE '<Button[^>]*\b(full|variant="danger")\b' "$MONTH" "$DETAIL" || true)"

# R-90: the (bare) layout already pads by env(safe-area-inset-bottom). A second inset on a
# screen inside it double-pads and, on a fixed-height screen, makes the page wobble.
check "no second safe-area-inset-bottom inside (bare)/e" \
  "$(grep -rn 'safe-area-inset-bottom\|pb-safe' "$DETAIL" || true)"

# Money is the only thing allowed to typeset an amount (components/ui/index.ts).
check "no hand-formatted money in F07's screens" \
  "$(grep -rnE 'formatIdr(Digits|Compact)?\(' "$MONTH" "$DETAIL" || true)"

# R-84: /e/[id] is now the photo harness, so the dev scaffold must be gone.
check "the /dev/photos harness has been deleted" \
  "$([ -d app/dev/photos ] && echo 'app/dev/photos still exists' || true)"

exit $fail
