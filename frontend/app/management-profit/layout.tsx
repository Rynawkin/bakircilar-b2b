import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Yönetim Karlılık Raporu | Bakırcılar',
  description: 'PIN korumalı yönetim karlılık raporu.',
  referrer: 'no-referrer',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function ManagementProfitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
