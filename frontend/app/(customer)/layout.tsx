import { Suspense, type ReactNode } from 'react';
import CustomerLayoutClient from './CustomerLayoutClient';

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CustomerLayoutClient>{children}</CustomerLayoutClient>
    </Suspense>
  );
}
