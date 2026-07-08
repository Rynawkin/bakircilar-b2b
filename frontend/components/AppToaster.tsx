'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';

export function AppToaster() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <Toaster
      key={isMobile ? 'mobile' : 'default'}
      position="top-right"
      toastOptions={{
        duration: isMobile ? 1000 : 3000,
        style: {
          background: '#fff',
          color: '#363636',
          padding: isMobile ? '10px 12px' : '16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          maxWidth: isMobile ? '280px' : '360px',
          fontSize: isMobile ? '12px' : '14px',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
        },
      }}
    />
  );
}
