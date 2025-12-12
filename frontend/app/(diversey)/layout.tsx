'use client';

import { useAuthStore } from '@/lib/store/authStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DiverseyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loadUserFromStorage, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null) {
      return; // Still loading
    }

    if (!user) {
      router.push('/login');
    } else if (user.role !== 'DIVERSEY') {
      router.push('/dashboard');
    }
  }, [user, router]);

  if (user === null || !user || user.role !== 'DIVERSEY') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Diversey Stok Görüntüleme</h1>
              <p className="text-sm text-gray-600">Hoşgeldiniz, {user.name}</p>
            </div>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </div>
    </div>
  );
}
