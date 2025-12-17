'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { CustomerNavigation } from '@/components/layout/CustomerNavigation';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart } = useCartStore();

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
  }, [loadUserFromStorage, fetchCart]);

  const cartItemCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <CustomerNavigation cartItemCount={cartItemCount} />
      <main>{children}</main>
    </div>
  );
}
