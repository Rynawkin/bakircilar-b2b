'use client';

import { useState, Fragment } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { LogoLink } from '@/components/ui/Logo';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  description?: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '🎯', description: 'Genel bakış' },
  { name: 'Siparişler', href: '/orders', icon: '📋', description: 'Sipariş yönetimi' },
  { name: 'Sipariş Takip', href: '/order-tracking', icon: '📧', description: 'Bekleyen siparişler' },
  { name: 'Müşteriler', href: '/customers', icon: '👥', description: 'Müşteri listesi' },
  { name: 'Ürünler', href: '/admin-products', icon: '📦', description: 'Ürün yönetimi' },
  { name: 'Kampanyalar', href: '/campaigns', icon: '🎯', description: 'İndirim kampanyaları' },
  { name: 'Raporlar', href: '/reports', icon: '📊', description: 'Raporlar ve analizler' },
];

const settingsItems: NavItem[] = [
  { name: 'Kategoriler', href: '/categories', icon: '📁', description: 'Fiyatlandırma ayarları' },
  { name: 'Ürün Override', href: '/product-overrides', icon: '🏷️', description: 'Özel fiyatlar' },
  { name: 'Hariç Tutma', href: '/exclusions', icon: '🚫', description: 'Rapor filtreleme' },
  { name: 'Personel', href: '/staff', icon: '👥', description: 'Personel yönetimi' },
  { name: 'Ayarlar', href: '/settings', icon: '⚙️', description: 'Sistem ayarları' },
];

export function AdminNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg sticky top-0 z-50">
      <div className="container-custom">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <LogoLink href="/dashboard" variant="light" />
            <div className="hidden md:block border-l border-primary-500 pl-4">
              <p className="text-sm font-semibold text-white">Yönetim Paneli</p>
              <p className="text-xs text-primary-100">{user?.name}</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-white text-primary-700 shadow-md'
                    : 'text-white hover:bg-primary-800/50'
                }`}
                title={item.description}
              >
                <span className="text-sm">{item.icon}</span>
                <span className="hidden xl:inline">{item.name}</span>
              </button>
            ))}

            {/* Settings Dropdown */}
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-white hover:bg-primary-800/50 transition-all">
                <span className="text-sm">⚙️</span>
                <span className="hidden xl:inline">Ayarlar</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-64 origin-top-right bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="p-2">
                    {settingsItems.map((item) => (
                      <Menu.Item key={item.href}>
                        {({ active }) => (
                          <button
                            onClick={() => router.push(item.href)}
                            className={`flex items-start gap-3 w-full px-3 py-2 rounded-md text-sm ${
                              active ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                            } ${isActive(item.href) ? 'bg-primary-100 font-semibold' : ''}`}
                          >
                            <span className="text-lg">{item.icon}</span>
                            <div className="text-left">
                              <div className="font-medium">{item.name}</div>
                              {item.description && (
                                <div className="text-xs text-gray-500">{item.description}</div>
                              )}
                            </div>
                          </button>
                        )}
                      </Menu.Item>
                    ))}
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>

            {/* User Menu */}
            <Menu as="div" className="relative ml-1">
              <Menu.Button className="flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium bg-primary-800/50 text-white hover:bg-primary-800 transition-all">
                <div className="w-7 h-7 rounded-full bg-white text-primary-700 flex items-center justify-center font-bold text-xs">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="p-3 border-b border-gray-200">
                    <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                    <p className="text-xs text-primary-600 font-medium mt-1">👑 Admin</p>
                  </div>
                  <div className="p-2">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm ${
                            active ? 'bg-red-50 text-red-700' : 'text-gray-700'
                          }`}
                        >
                          <span>🚪</span>
                          <span>Çıkış Yap</span>
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-white hover:bg-primary-800/50"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-primary-500 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => {
                  router.push(item.href);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-white text-primary-700'
                    : 'text-white hover:bg-primary-800/50'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <div className="text-left">
                  <div>{item.name}</div>
                  {item.description && (
                    <div className="text-xs opacity-75">{item.description}</div>
                  )}
                </div>
              </button>
            ))}

            <div className="border-t border-primary-500 pt-2 mt-2">
              <p className="px-4 py-2 text-xs font-semibold text-primary-200">Ayarlar</p>
              {settingsItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive(item.href)
                      ? 'bg-white text-primary-700'
                      : 'text-white hover:bg-primary-800/50'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <div className="text-left">
                    <div>{item.name}</div>
                    {item.description && (
                      <div className="text-xs opacity-75">{item.description}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-primary-500 pt-2 mt-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-white hover:bg-red-500/20"
              >
                <span className="text-lg">🚪</span>
                <span>Çıkış Yap</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
