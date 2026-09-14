import type { Metadata, Viewport } from 'next';
import LocaleProvider from '@/components/LocaleProvider';
import { ToastProvider } from '@/components/Toast';
import { dirOf } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import './globals.css';
// web-only layer: desktop portal layout + admin refresh (the native app never loads this)
import './portal.css';

export const metadata: Metadata = {
  title: 'Subaidar Hasnain Foundation',
  description:
    'Apply for monthly, accidental, grocery and electricity bill assistance from the Subaidar Hasnain Foundation.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SHF',
  },
  icons: { icon: '/img/logo.svg', apple: '/img/logo.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0e9d63',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LocaleProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
