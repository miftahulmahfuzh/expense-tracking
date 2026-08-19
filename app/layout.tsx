import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Expense Tracking',
  description: 'Catat pengeluaran dengan cara paling malas: tempel teks, biar rapi sendiri.',
}

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve on iPhone XS Max.
// F10 builds the safe-area-aware tab bar on top of this.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
