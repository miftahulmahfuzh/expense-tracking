import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui'
import { fontVariables } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://expensetracking.online'),
  title: { default: 'Expense Tracking', template: '%s · Expense Tracking' },
  description: 'Catat pengeluaran dengan sekali tempel.',
  applicationName: 'Expense Tracking',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    // Chrome-less from the home screen. Without this, "Add to Home Screen" gives a bookmark
    // that opens in Safari with the URL bar, tab strip and share bar eating ~140px of an
    // 896px screen — the entire difference between "a website I saved" and "an app I have".
    capable: true,
    // ≤12 characters or iOS truncates it under the icon.
    title: 'Expenses',
    // black-translucent = content runs under the status bar. Only safe because every fixed
    // header in this app pads by env(safe-area-inset-top) via `pt-safe-header`.
    statusBarStyle: 'black-translucent',
  },
  // Stop iOS auto-linking "38.500" as a phone number and dates as calendar events. It
  // recolours our amounts and underlines them, which breaks the money rail.
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /*
   * THE SINGLE HIGHEST-CONSEQUENCE LINE IN THE DESIGN SYSTEM. Without it, every
   * env(safe-area-inset-*) in globals.css returns 0 and every safe-area rule silently does
   * nothing — the tab bar sits under the home indicator and the headers under the notch,
   * with no error anywhere to tell you why.
   */
  viewportFit: 'cover',
  /*
   * DELIBERATELY ABSENT: maximumScale and userScalable. Pinch-zoom stays on. `user-scalable=no`
   * is the fix you will find online for Safari's zoom-on-focus; it disables zoom for
   * everyone, which is an accessibility failure. The fix is the 17px input floor instead.
   * If text is too small, change the type scale, not the viewport.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0ede4' },
    { media: '(prefers-color-scheme: dark)', color: '#131311' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // lang="id" so a screen reader uses Indonesian pronunciation for "Makan & Jajan".
    <html lang="id" className={fontVariables}>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
