set -u
fail=0
chk() { # chk <label> <file> <regex>
  if [ -f "$2" ] && grep -qE "$3" "$2"; then echo "PASS  $1"; else echo "FAIL  $1  ($2)"; fail=1; fi
}
chk "F03 CATEGORIES"           lib/categories.ts         'export const CATEGORIES'
chk "F03 CATEGORY_META"        lib/categories.ts         'export const CATEGORY_META'
chk "F03 DEFAULT_CATEGORY"     lib/categories.ts         'export const DEFAULT_CATEGORY'
chk "F03 toCategory"           lib/categories.ts         'export function toCategory'
chk "F03 ParsedExpense value"  lib/schema/expense.ts     'export const ParsedExpense'
chk "F03 ParsedExpense type"   lib/schema/expense.ts     'export type ParsedExpense'
chk "F03 CreateExpenseInput"   lib/schema/expense.ts     'export const CreateExpenseInput'
chk "F03 photos (R-2)"         lib/schema/expense.ts     'photos:  *z\.array\(NewPhotoInputSchema\)'
chk "F03 formatIdr"            lib/format.ts             'export function formatIdr'
chk "F03 formatIdrDigits"      lib/format.ts             'export function formatIdrDigits'
chk "F03 parseIdrLoose"        lib/format.ts             'parseIdrLoose'
chk "F03 todayJakartaISO"      lib/format.ts             'todayJakartaISO'
chk "F03 monthKey"             lib/format.ts             'export function monthKey'
chk "F03 newGroupId"           lib/id.ts                 'newGroupId'
chk "F03 db.batch-able db"     lib/db/index.ts           'export const db'
chk "F03 expenseGroups"        lib/db/schema.ts          'export const expenseGroups'
chk "F02 requireUserId"        lib/auth/requireUserId.ts 'export async function requireUserId'
chk "F04 /api/parse"           app/api/parse/route.ts    'export async function POST'
chk "F04 fallbackParse"        lib/llm/fallbackParse.ts  'export function fallbackParse'
chk "F04 ParseSource"          lib/llm/types.ts          'export type ParseSource'
chk "F04 MAX_RAW_TEXT_CHARS"   lib/llm/types.ts          'export const MAX_RAW_TEXT_CHARS'
chk "F04 PARSE_ERROR_COPY"     lib/llm/types.ts          'export const PARSE_ERROR_COPY'
chk "F06 StagedPhoto"          lib/photos/types.ts       'export type StagedPhoto'
chk "F06 PhotoPicker"          components/photos/PhotoPicker.tsx 'export function PhotoPicker'
chk "F06 staged mode"          components/photos/PhotoPicker.tsx "mode: 'staged'"
chk "F06 onBusyChange (R-31)"  components/photos/PhotoPicker.tsx 'onBusyChange'
chk "F06 discardStagedPhotos"  app/actions/photos.ts     'export async function discardStagedPhotos'
chk "F06 STORED_PATHNAME_RE"   lib/photos/constants.ts   'export const PHOTO_STORED_PATHNAME_RE'
chk "F10 Button"               components/ui/Button.tsx        'export function Button'
chk "F10 Button fullWidth"     components/ui/Button.tsx        'fullWidth'
chk "F10 Sheet showModal"      components/ui/Sheet.tsx         'showModal'
chk "F10 Chip"                 components/ui/Chip.tsx          'export function Chip'
chk "F10 CategoryPicker"       components/ui/CategoryPicker.tsx 'export function CategoryPicker'
chk "F10 Field"                components/ui/Field.tsx         'export function Field'
chk "F10 Input"                components/ui/Field.tsx         'export function Input'
chk "F10 TextArea"             components/ui/Field.tsx         'export function TextArea'
chk "F10 MoneyInput"           components/ui/MoneyInput.tsx    'export function MoneyInput'
chk "F10 Money"                components/ui/Money.tsx         'export function Money'
chk "F10 CONTROL_CLASS"        components/ui/Field.tsx         'export const CONTROL_CLASS'
chk "F10 Input honours id"     components/ui/Field.tsx         'id \?\? field\?\.inputId'
chk "F10 .skeleton class"      app/globals.css                 '\.skeleton \{'
chk "F10 viewport-fit"         app/layout.tsx                  'viewport-fit|viewportFit'
chk "F10 17px input floor"     app/globals.css                 '1\.0625rem; /\* 17px'
chk "R-51 (bare) group"        'app/(bare)/layout.tsx'         'BareLayout'

# fallbackParse runs in the BROWSER on the offline path. A stray `server-only` anywhere in
# its module graph turns that rescue into a build error.
if grep -qE "^import 'server-only'" lib/llm/fallbackParse.ts lib/llm/types.ts lib/schema/expense.ts lib/categories.ts lib/format.ts 2>/dev/null; then
  echo "FAIL  fallbackParse graph imports server-only (must stay client-importable)"; fail=1
else
  echo "PASS  fallbackParse graph is client-importable"
fi

# Things the plan assumed exist and do NOT. These are the live deltas.
if [ -f app/actions/expenses.ts ]; then echo "PASS  createExpense action exists"; else echo "DELTA app/actions/expenses.ts absent — F05 writes it (F03 plan §9.4)"; fi
if grep -qE 'ref\??:' components/ui/Field.tsx; then echo "PASS  Field forwards a ref"; else echo "DELTA Input/TextArea do not type a ref — F05 widens it (contract delta 8)"; fi
exit $fail
