import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthInitializer } from '@/components/AuthInitializer';
import { AppToaster } from '@/components/AppToaster';

const inter = Inter({ subsets: ['latin'] });

// Mobilde admin/musteri ekranlarinin yakinlasarak (zoom) acilmasini onler:
// device-width'e sabitler, ilk olcegi 1 yapar, kullanici en fazla 5x buyutur.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Bakırcılar Grup B2B - Sipariş Sistemi',
  description: 'Bakırcılar Grup B2B Sipariş Yönetim Platformu',
  icons: {
    shortcut: '/favicon.ico',
    icon: [
      {
        url: '/favicon.ico',
        sizes: 'any',
      },
      {
        url: '/favicon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className={inter.className}>
        <AuthInitializer />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
