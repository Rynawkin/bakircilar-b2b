'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './Button';

interface MenuItem {
  label: string;
  href: string;
  icon?: string;
  onClick?: () => void;
}

interface MobileMenuProps {
  items: MenuItem[];
  user?: { name: string; email: string } | null;
  onLogout?: () => void;
}

export function MobileMenu({ items, user, onLogout }: MobileMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle Escape key to close menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [router]);

  const handleItemClick = (item: MenuItem) => {
    if (item.onClick) {
      item.onClick();
    } else if (item.href) {
      router.push(item.href);
    }
    setIsOpen(false);
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden p-2 text-white hover:bg-primary-800 rounded-lg transition-colors"
        aria-label={isOpen ? 'Menüyü kapat' : 'Menüyü aç'}
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide Menu */}
      <div
        id="mobile-menu"
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="navigation"
        aria-label="Mobil menü"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-700 to-primary-600 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Menü</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-white hover:bg-primary-800 rounded-lg"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {user && (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <p className="text-xs text-primary-100">{user.email}</p>
              </div>
            )}
          </div>

          {/* Menu Items */}
          <nav className="flex-1 overflow-y-auto p-4" aria-label="Ana navigasyon">
            <ul className="space-y-2" role="list">
              {items.map((item, index) => (
                <li key={index}>
                  <button
                    onClick={() => handleItemClick(item)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-primary-500"
                    aria-label={item.label}
                  >
                    {item.icon && <span className="text-xl" aria-hidden="true">{item.icon}</span>}
                    <span className="font-medium text-gray-900">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Logout Button */}
          {onLogout && (
            <div className="p-4 border-t">
              <Button
                onClick={() => {
                  onLogout();
                  setIsOpen(false);
                }}
                variant="danger"
                className="w-full"
              >
                🚪 Çıkış Yap
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
