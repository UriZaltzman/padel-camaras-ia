import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { locale, t } from '@/i18n';

import { fontVariables } from './fonts';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: t('meta.title'),
  description: t('meta.description'),
};

// `cover` lets the page use the notch area; the shells pad it with `env(safe-area-inset-*)`.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
