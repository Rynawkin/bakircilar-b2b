'use client';

import { useState, Fragment } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { LogoLink } from '@/components/ui/Logo';
import {
  ShoppingBag,
  ShoppingCart,
  Package,
  Clock,
  FileText,
  ListTodo,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Menu as MenuIcon,
  X
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function CustomerNavigation({ cartItemCount = 0 }: { cartItemCount?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems: NavItem[] = [
    { name: 'Ürünler', href: '/products', icon: ShoppingBag },
    { name: 'Daha Once Aldiklarim', href: '/previously-purchased', icon: Clock },
    { name: 'Sepetim', href: '/cart', icon: ShoppingCart, badge: cartItemCount },
    { name: 'Siparişlerim', href: '/my-orders', icon: Package },
    { name: 'Tekliflerim', href: '/my-quotes', icon: FileText },
    { name: 'Taleplerim', href: '/my-requests', icon: ListTodo },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg sticky top-0 z-50">
      <div className="container-custom">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <LogoLink href="/products" variant="light" />
            <div className="hidden md:block border-l border-primary-500 pl-4">
              <p className="text-sm font-semibold text-white">{user?.name}</p>
              {user?.mikroCariCode && (
                <p className="text-xs text-primary-100">Kod: {user.mikroCariCode}</p>
              )}
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-white text-primary-700 shadow-md'
                    : 'text-white hover:bg-primary-800/50'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}

            {/* User Menu */}
            <Menu as="div" className="relative ml-2">
              <Menu.Button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary-800/50 text-white hover:bg-primary-800 transition-all">
                <div className="w-8 h-8 rounded-full bg-white text-primary-700 flex items-center justify-center font-bold">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <span className="hidden lg:block">{user?.name?.split(' ')[0]}</span>
                <ChevronDown className="w-4 h-4" />
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
                    {user?.mikroCariCode && (
                      <p className="text-xs text-primary-600 font-medium mt-1">
                        Kod: {user.mikroCariCode}
                      </p>
                    )}
                  </div>
                  <div className="p-2">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => router.push('/profile')}
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm ${
                            active ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <User className="w-4 h-4" />
                          <span>Profilim</span>
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => router.push('/preferences')}
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm ${
                            active ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <Settings className="w-4 h-4" />
                          <span>Tercihlerim</span>
                        </button>
                      )}
                    </Menu.Item>
                    <div className="border-t border-gray-200 my-1"></div>
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
            className="md:hidden p-2 rounded-lg text-white hover:bg-primary-800/50"
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
          <div className="md:hidden border-t border-primary-500 py-4 space-y-2">
            <div className="px-4 py-2 border-b border-primary-500 mb-2">
              <p className="text-sm font-semibold text-white">{user?.name}</p>
              <p className="text-xs text-primary-100">{user?.email}</p>
            </div>

            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => {
                  router.push(item.href);
                  setMobileMenuOpen(false);
                }}
                className={`relative flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-white text-primary-700'
                    : 'text-white hover:bg-primary-800/50'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
                {item.badge && item.badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}

            <div className="border-t border-primary-500 pt-2 mt-2">
              <button
                onClick={() => {
                  router.push('/profile');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-white hover:bg-primary-800/50"
              >
                <User className="w-5 h-5" />
                <span>Profilim</span>
              </button>
              <button
                onClick={() => {
                  router.push('/preferences');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-white hover:bg-primary-800/50"
              >
                <Settings className="w-5 h-5" />
                <span>Tercihlerim</span>
              </button>
            </div>

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
