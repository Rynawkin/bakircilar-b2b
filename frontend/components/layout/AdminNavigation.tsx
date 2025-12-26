'use client';

import { useState, Fragment } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { LogoLink } from '@/components/ui/Logo';
import {
  LayoutDashboard,
  ClipboardList,
  Mail,
  Users,
  Package,
  Target,
  BarChart3,
  Folder,
  Tag,
  Ban,
  FileText,
  Settings,
  ChevronDown,
  Menu as MenuIcon,
  X,
  LogOut
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, description: 'Genel bakış' },
  { name: 'Siparişler', href: '/orders', icon: ClipboardList, description: 'Sipariş yönetimi' },
  { name: 'Teklifler', href: '/quotes', icon: FileText, description: 'Teklif yönetimi' },
  { name: 'Sipariş Takip', href: '/order-tracking', icon: Mail, description: 'Bekleyen siparişler' },
  { name: 'Müşteriler', href: '/customers', icon: Users, description: 'Müşteri listesi' },
  { name: 'Ürünler', href: '/admin-products', icon: Package, description: 'Ürün yönetimi' },
  { name: 'Kampanyalar', href: '/campaigns', icon: Target, description: 'İndirim kampanyaları' },
  { name: 'Raporlar', href: '/reports', icon: BarChart3, description: 'Raporlar ve analizler' },
];

const settingsItems: NavItem[] = [
  { name: 'Kategoriler', href: '/categories', icon: Folder, description: 'Fiyatlandırma ayarları' },
  { name: 'Ürün Override', href: '/product-overrides', icon: Tag, description: 'Özel fiyatlar' },
  { name: 'Hariç Tutma', href: '/exclusions', icon: Ban, description: 'Rapor filtreleme' },
  { name: 'Personel', href: '/staff', icon: Users, description: 'Personel yönetimi' },
  { name: 'Ayarlar', href: '/settings', icon: Settings, description: 'Sistem ayarları' },
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

  // Role-based navigation filtering
  const getVisibleNavItems = () => {
    if (user?.role === 'SALES_REP') {
      // SALES_REP sadece Dashboard, Siparişler ve Sipariş Takip görsün
      return navItems.filter(item =>
        item.href === '/dashboard' ||
        item.href === '/orders' ||
        item.href === '/order-tracking' ||
        item.href === '/quotes'
      );
    }
    // ADMIN, MANAGER, HEAD_ADMIN tüm menüleri görsün
    return navItems;
  };

  const getVisibleSettingsItems = () => {
    if (user?.role === 'SALES_REP') {
      // SALES_REP ayarlar menüsünü hiç görmesin
      return [];
    }
    if (user?.role === 'MANAGER') {
      // MANAGER sadece bazı ayarları görsün
      return settingsItems.filter(item =>
        item.href === '/staff' // Sadece personel yönetimi
      );
    }
    // ADMIN ve HEAD_ADMIN tüm ayarları görsün
    return settingsItems;
  };

  const visibleNavItems = getVisibleNavItems();
  const visibleSettingsItems = getVisibleSettingsItems();

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
            {visibleNavItems.map((item) => (
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
                <item.icon className="w-4 h-4" />
                <span className="hidden xl:inline">{item.name}</span>
              </button>
            ))}

            {/* Settings Dropdown - Sadece ayarlar varsa göster */}
            {visibleSettingsItems.length > 0 && (
              <Menu as="div" className="relative">
                <Menu.Button className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-white hover:bg-primary-800/50 transition-all">
                  <Settings className="w-4 h-4" />
                  <span className="hidden xl:inline">Ayarlar</span>
                  <ChevronDown className="w-3 h-3" />
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
                      {visibleSettingsItems.map((item) => (
                      <Menu.Item key={item.href}>
                        {({ active }) => (
                          <button
                            onClick={() => router.push(item.href)}
                            className={`flex items-start gap-3 w-full px-3 py-2 rounded-md text-sm ${
                              active ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                            } ${isActive(item.href) ? 'bg-primary-100 font-semibold' : ''}`}
                          >
                            <item.icon className="w-4 h-4" />
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
            )}

            {/* User Menu */}
            <Menu as="div" className="relative ml-1">
              <Menu.Button className="flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium bg-primary-800/50 text-white hover:bg-primary-800 transition-all">
                <div className="w-7 h-7 rounded-full bg-white text-primary-700 flex items-center justify-center font-bold text-xs">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <ChevronDown className="w-3 h-3" />
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
                          <LogOut className="w-4 h-4" />
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
              <X className="w-6 h-6" />
            ) : (
              <MenuIcon className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-primary-500 py-4 space-y-2">
            {visibleNavItems.map((item) => (
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
                <item.icon className="w-5 h-5" />
                <div className="text-left">
                  <div>{item.name}</div>
                  {item.description && (
                    <div className="text-xs opacity-75">{item.description}</div>
                  )}
                </div>
              </button>
            ))}

            {visibleSettingsItems.length > 0 && (
              <div className="border-t border-primary-500 pt-2 mt-2">
                <p className="px-4 py-2 text-xs font-semibold text-primary-200">Ayarlar</p>
                {visibleSettingsItems.map((item) => (
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
                  <item.icon className="w-5 h-5" />
                  <div className="text-left">
                    <div>{item.name}</div>
                    {item.description && (
                      <div className="text-xs opacity-75">{item.description}</div>
                    )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-primary-500 pt-2 mt-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-white hover:bg-red-500/20"
              >
                <LogOut className="w-5 h-5" />
                <span>Çıkış Yap</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
