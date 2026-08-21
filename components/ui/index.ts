/**
 * The design system. Everything F05, F06, F07, F08 and F09 import lives here.
 *
 * Two rules that are not negotiable, because they are the reason this barrel exists:
 *  - Never write a raw `<input>`. Use `Input` / `TextArea` / `MoneyInput`, which carry the
 *    17px floor that stops Safari zooming the page on focus.
 *  - Never typeset an amount by hand. Use `Money`, which carries the tabular money rail —
 *    Archivo is proportional, so nothing else keeps a column of rupiah aligned.
 */

export { Button, ButtonLink, LoadingDots, Spinner, buttonClasses } from './Button'
export type {
  ButtonProps,
  ButtonLinkProps,
  ButtonVariant,
  ButtonSize,
  ButtonBaseProps,
} from './Button'

export { Card } from './Card'
export type { CardProps } from './Card'

export { Money } from './Money'
export type { MoneyProps, MoneySize, MoneyTone } from './Money'

export { CONTROL_CLASS, Field, Input, TextArea, useFieldContext } from './Field'
export type { FieldProps, InputProps, TextAreaProps } from './Field'

export { MoneyInput } from './MoneyInput'
export type { MoneyInputProps } from './MoneyInput'

export { Sheet } from './Sheet'
export type { SheetProps } from './Sheet'

export { CategoryCode, CategoryDisc, CategoryDot, Chip } from './Chip'
export type { ChipProps } from './Chip'

export { INK_STICKER, RED_STICKER } from './stickers'

/**
 * THE ICON SET. A closed list — `components/ui/Icon.tsx` is the only module allowed to import
 * `lucide-react` (enforced by `no-restricted-imports` in eslint.config.mjs and by
 * tests/icon.contract.test.ts), and it exports finished components rather than an adapter, so
 * the 2.5-stroke square-cap contract has no bypass. A new glyph is a new line in that file.
 */
export {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CollapseIcon,
  DownloadIcon,
  ExpandIcon,
  PhotoStackIcon,
  ShareIcon,
  TrashIcon,
  TrendDownIcon,
  TrendFlatIcon,
  TrendUpIcon,
} from './Icon'
export type { GlyphProps, IconSize } from './Icon'

export { TitlePresets } from './TitlePresets'

export { CategoryPicker } from './CategoryPicker'
export type { CategoryPickerProps } from './CategoryPicker'

export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export { TabBar } from './TabBar'
export type { TabBarProps } from './TabBar'

export { ToastProvider, useToast } from './Toast'
export type { ToastApi, ToastOptions, ToastAction } from './Toast'
