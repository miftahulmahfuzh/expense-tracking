#!/usr/bin/env bash
# F08 audits — the mechanical half of the bundle, colour and honesty sweeps for /stats.
#
# Kept in the repo rather than run once, because every check below fails SILENTLY:
# a second recharts import promotes ~100 KB into the shared chunk and every route pays for
# it with nothing in the build output looking wrong; a hardcoded hex renders perfectly in
# whichever scheme the author had open; a hex-valued `fill` prop on a <Cell> looks right in
# light mode and stays wrong in dark; and a dropped zero-month is a chart that lies with no
# error anywhere.
set -u
STATS='app/(shell)/stats'
LIB='lib/stats'
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

# ---- bundle ------------------------------------------------------------------

# THE HARD GATE. recharts must be imported in exactly ONE file, and that file must be the
# one loaded through next/dynamic({ ssr: false }).
expect_count "recharts imported in exactly one file" 1 \
  "$(grep -rl "from 'recharts'" app lib components | wc -l | tr -d ' ')"
check "the sole recharts importer is MonthlyChartInner" \
  "$(grep -rl "from 'recharts'" app lib components | grep -v "^$STATS/MonthlyChartInner.tsx$" || true)"

# ssr:false is illegal in a Server Component in Next 16, and a static import of the inner
# file from anywhere would defeat the lazy chunk entirely.
check "MonthlyChartInner is only ever reached through next/dynamic" \
  "$(grep -rn "from './MonthlyChartInner'\|from '@/app/(shell)/stats/MonthlyChartInner'" app lib components \
     | grep -v 'dynamic(' || true)"
check "the dynamic import sets ssr: false" \
  "$(grep -q 'ssr: false' "$STATS/MonthlyChart.tsx" && echo '' || echo 'missing ssr:false in MonthlyChart.tsx')"

# ---- colour ------------------------------------------------------------------

# R-28 / R-50: F08 owns no colour. Every value is an F10 token. A literal hex in a component
# is how a page stops responding to prefers-color-scheme.
check "no hardcoded hex in any /stats component" \
  "$(grep -rniE '#[0-9a-f]{3,8}\b' "$STATS" --include='*.tsx' || true)"
check "no hardcoded hex in lib/stats" \
  "$(grep -rniE '#[0-9a-f]{3,8}\b' "$LIB" --include='*.ts' | grep -v '__tests__' || true)"

# The token bridge only works via className. A `fill="…"` prop writes an SVG presentation
# attribute, and var() does not resolve inside one in Safari.
check "no fill/stroke prop on a recharts mark" \
  "$(grep -nE '<(Cell|Bar|CartesianGrid)[^>]*(fill|stroke)=' "$STATS/MonthlyChartInner.tsx" || true)"

# R-3 / R-39: the category breakdown is a bar list. A pie/donut import would resurrect the
# palette failure that ruling exists to avoid.
check "no donut/pie anywhere on /stats" \
  "$(grep -rnE '<(PieChart|Pie|RadialBar|Sector)[ />]' "$STATS" || true)"

# The dataviz relief rule and R-50's waiver both depend on the code being present, so the
# breakdown must render CategoryCode rather than a bare colour swatch.
check "the breakdown carries the category code, not colour alone" \
  "$(grep -q 'CategoryCode' "$STATS/CategoryBreakdown.tsx" && echo '' || echo 'CategoryBreakdown.tsx does not render CategoryCode')"

# ---- honesty -----------------------------------------------------------------

# D-B: a zero month must be DRAWN as zero. minPointSize > 0 paints a sympathy sliver that
# misstates the value; dashed gridlines are an explicit anti-pattern.
check "zero months are drawn at zero height" \
  "$(grep -nE 'minPointSize=\{[^0]' "$STATS/MonthlyChartInner.tsx" || true)"
# The prop form in JSX, and the CSS form set explicitly to none because Recharts' own
# examples default the gridline to "3 3".
check "no dashed gridlines" \
  "$(grep -rn 'strokeDasharray' "$STATS" --include='*.tsx' || true)"
check "the gridline dash is explicitly cleared in CSS" \
  "$(grep -q 'stroke-dasharray: none' "$STATS/stats.css" && echo '' || echo 'stats.css does not clear stroke-dasharray')"

# Every value must be reachable without an interaction: the persistent readout and the
# <details> table are the two non-hover paths, and the Tooltip must render nothing.
check "the chart ships its table-view twin" \
  "$(grep -q '<details' "$STATS/MonthlyChart.tsx" && echo '' || echo 'MonthlyChart.tsx has no <details> table view')"
check "the tooltip renders nothing (there is no hover on a phone)" \
  "$(grep -q 'content={() => null}' "$STATS/MonthlyChartInner.tsx" && echo '' || echo 'Tooltip is not neutered in MonthlyChartInner.tsx')"

# ---- structure ---------------------------------------------------------------

# R-25: outside the shell group the page renders with no tab bar.
check "/stats lives inside the (shell) route group" \
  "$([ -f "$STATS/page.tsx" ] && echo '' || echo "$STATS/page.tsx not found")"

# R-23: the tab always returns the user to the current month, so its href stays bare.
check "the Statistik tab links to a bare /stats" \
  "$(grep -nE 'href="/stats\?' components/ui/TabBar.tsx || true)"

# D7 / roadmap §4.4: all aggregation is SQL. Four aggregates, one await boundary.
expect_count "exactly one await boundary for the page's reads" 1 \
  "$(grep -c 'await Promise.all(' "$STATS/page.tsx")"
check "the page opens with requireUserId" \
  "$(grep -q 'await requireUserId()' "$STATS/page.tsx" && echo '' || echo 'page.tsx does not call requireUserId')"

# R-75: `export const dynamic` was dropped from Next 16's route-segment config. Shipping it
# reads as a guarantee and does nothing; the session cookie is what makes this route ƒ.
check "no no-op route-segment dynamic export" \
  "$(grep -n "^export const dynamic" "$STATS/page.tsx" || true)"

# R-10: lib/month.ts is deleted. One month-arithmetic implementation, and it is F03's.
check "month arithmetic comes from lib/format.ts only" \
  "$(grep -rn "from '@/lib/month'" "$STATS" "$LIB" || true)"

# F08's biggest-expense deep link is inert without F07's anchor.
check "/e/[id] renders the item anchor the callout links to" \
  "$(grep -qF 'id={`item-${item.id}`}' 'app/(bare)/e/[id]/ExpenseEditor.tsx' && echo '' || echo 'ExpenseEditor.tsx has no id=item-<id> anchor')"

echo
if [ "$fail" = 0 ]; then echo "F08 audit: all checks pass"; else echo "F08 audit: FAILURES above"; fi
exit "$fail"
