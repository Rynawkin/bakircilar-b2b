'use client';

import { useState, Fragment, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { LogoLink } from '@/components/ui/Logo';
import customerApi from '@/lib/api/customer';
import { formatDateShort } from '@/lib/utils/format';
import { Notification } from '@/types';
import {
  Home,
  ShoppingBag,
  ShoppingCart,
  Package,
  Clock,
  FileText,
  ListTodo,
  ClipboardList,
  Tag,
  Percent,
  User,
  Settings,
  Bell,
  LogOut,
  ChevronDown,
  Menu as MenuIcon,
  X
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  badge?: number;
}

export function CustomerNavigation({ cartItemCount = 0 }: { cartItemCount?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [agreementsAvailable, setAgreementsAvailable] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    setNotificationLoading(true);
    try {
      const { notifications: data, unreadCount: unread } = await customerApi.getNotifications({ limit: 10 });
      setNotifications(data || []);
      setUnreadCount(unread || 0);
    } catch (error) {
      console.error('Notifications not loaded:', error);
    } finally {
      setNotificationLoading(false);
    }
  };

  const fetchPendingRequestCount = async () => {
    if (!user || user.parentCustomerId) {
      setPendingRequestCount(0);
      return;
    }
    try {
      const { count } = await customerApi.getOrderRequestPendingCount();
      setPendingRequestCount(count || 0);
    } catch (error) {
      console.error('Pending request count not loaded:', error);
    }
  };

  const fetchAgreementsAvailability = async () => {
    if (!user) return;
    try {
      const { available } = await customerApi.getAgreementsAvailability();
      setAgreementsAvailable(Boolean(available));
    } catch (error) {
      console.error('Agreements availability not loaded:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await customerApi.markNotificationsReadAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Notifications not updated:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await customerApi.markNotificationsRead([notification.id]);
        setNotifications((prev) =>
          prev.map((item) => item.id === notification.id ? { ...item, isRead: true } : item)
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Notification not updated:', error);
      }
    }
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    fetchPendingRequestCount();
    fetchAgreementsAvailability();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchPendingRequestCount();
    }, 60000);
    return () => clearInterval(interval);
  }, [user?.id, user?.parentCustomerId]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems: NavItem[] = [
    { name: 'Ana Sayfa', href: '/home', icon: Home },
    { name: 'Ürünler', href: '/products', icon: ShoppingBag },
    // Anlasmali Urunler menusu sadece musteriye tanimli AKTIF anlasma varsa gosterilir
    ...(agreementsAvailable ? [{ name: 'Anlasmali Urunler', href: '/agreements', icon: Tag }] : []),
    { name: 'Indirimli Urunler', href: '/discounted-products', icon: Percent },
    { name: 'Daha Once Aldiklarim', href: '/previously-purchased', icon: Clock },
    { name: 'Sepetim', href: '/cart', icon: ShoppingCart, badge: cartItemCount },
    { name: 'Siparişlerim', href: '/my-orders', icon: Package },
    { name: 'Faturalarim', href: '/invoices', icon: FileText },
    { name: 'Siparis Talepleri', href: '/order-requests', icon: ClipboardList, badge: user?.parentCustomerId ? undefined : pendingRequestCount },
    { name: 'Tekliflerim', href: '/my-quotes', icon: FileText },
    { name: 'Taleplerim', href: '/my-requests', icon: ListTodo },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="bg-primary-700 border-b border-white/10 shadow-sm shadow-primary-900/10 sticky top-0 z-50">
      <div className="container-custom">
        <div className="flex justify-between items-center h-14">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3.5">
            <LogoLink href="/home" variant="light" />
            <div className="hidden md:block border-l border-white/15 pl-3.5 min-w-0">
              <p className="text-sm font-semibold text-white truncate max-w-[220px] leading-tight" title={user?.name}>{user?.name}</p>
              {user?.mikroCariCode && (
                <p className="text-[11px] text-primary-200/90 truncate max-w-[220px] leading-tight font-mono">Kod: {user.mikroCariCode}</p>
              )}
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-0.5">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isActive(item.href)
                    ? 'bg-white text-primary-700 shadow-sm shadow-primary-900/20'
                    : 'text-primary-100/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" strokeWidth={isActive(item.href) ? 2.25 : 2} />
                <span className="hidden lg:inline">{item.name}</span>
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ring-2 ring-primary-700">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}

            {/* Divider */}
            <div className="mx-2 h-6 w-px bg-white/15" />

            {/* Notifications */}
            <Menu as="div" className="relative">
              <Menu.Button
                className="relative flex items-center justify-center w-9 h-9 rounded-lg text-primary-100/90 hover:bg-white/10 hover:text-white transition-colors"
                onClick={fetchNotifications}
                aria-label="Bildirimler"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ring-2 ring-primary-700">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
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
                <Menu.Items className="absolute right-0 mt-2 w-80 origin-top-right bg-white rounded-xl shadow-lg ring-1 ring-[var(--line)] focus:outline-none overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
                    <div className="text-sm font-semibold text-gray-900">Bildirimler</div>
                    <button
                      className="text-xs font-medium text-primary-600 hover:text-primary-700"
                      onClick={handleMarkAllRead}
                      type="button"
                    >
                      Tümünü okundu yap
                    </button>
                  </div>
                  <div className="max-h-80 overflow-auto p-2 space-y-1.5">
                    {notificationLoading && (
                      <div className="text-xs text-gray-500 px-2 py-3">Yükleniyor...</div>
                    )}
                    {!notificationLoading && notifications.length === 0 && (
                      <div className="text-xs text-gray-500 px-2 py-6 text-center">Bildiriminiz bulunmuyor.</div>
                    )}
                    {!notificationLoading && notifications.map((notification) => (
                      <button
                        key={notification.id}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                          notification.isRead
                            ? 'border-transparent text-gray-600 hover:bg-gray-50'
                            : 'border-primary-100 bg-primary-50 text-gray-900 hover:bg-primary-100/70'
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                        type="button"
                      >
                        <div className="text-sm font-medium flex items-start gap-2">
                          {!notification.isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-600 flex-shrink-0" />}
                          <span className="flex-1">{notification.title}</span>
                        </div>
                        {notification.body && (
                          <div className="text-xs text-gray-600 line-clamp-2 mt-1">{notification.body}</div>
                        )}
                        <div className="text-[11px] text-gray-400 mt-1">
                          {formatDateShort(notification.createdAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>

            {/* User Menu */}
            <Menu as="div" className="relative ml-1">
              <Menu.Button className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium text-primary-100/90 hover:bg-white/10 hover:text-white transition-colors">
                <div className="w-7 h-7 rounded-full bg-white text-primary-700 flex items-center justify-center font-bold text-sm ring-1 ring-white/40">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <span className="hidden lg:block max-w-[100px] truncate">{user?.name?.split(' ')[0]}</span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
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
                <Menu.Items className="absolute right-0 mt-2 w-60 origin-top-right bg-white rounded-xl shadow-lg ring-1 ring-[var(--line)] focus:outline-none overflow-hidden">
                  <div className="p-4 border-b border-[var(--line)]">
                    <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    {user?.mikroCariCode && (
                      <p className="text-xs text-primary-600 font-medium mt-1.5 font-mono">
                        Kod: {user.mikroCariCode}
                      </p>
                    )}
                  </div>
                  <div className="p-1.5">
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          href="/profile"
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                            active ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <User className="w-4 h-4" />
                          <span>Profilim</span>
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          href="/preferences"
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                            active ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <Settings className="w-4 h-4" />
                          <span>Tercihlerim</span>
                        </Link>
                      )}
                    </Menu.Item>
                    <div className="border-t border-[var(--line)] my-1.5"></div>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors ${
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
            className="md:hidden p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
            aria-label="Menü"
            aria-expanded={mobileMenuOpen}
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
          <div className="md:hidden border-t border-white/10 py-4 space-y-1">
            <div className="px-4 py-2 mb-2">
              <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs text-primary-200/90 truncate">{user?.email}</p>
              {user?.mikroCariCode && (
                <p className="text-[11px] text-primary-200/90 font-mono mt-0.5">Kod: {user.mikroCariCode}</p>
              )}
            </div>

            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`relative flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-white text-primary-700'
                    : 'text-primary-100/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
                {item.badge && item.badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}

            <div className="border-t border-white/10 pt-2 mt-2 space-y-1">
              <Link
                href="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-primary-100/90 hover:bg-white/10 hover:text-white transition-colors"
              >
                <User className="w-5 h-5 flex-shrink-0" />
                <span>Profilim</span>
              </Link>
              <Link
                href="/preferences"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-primary-100/90 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Settings className="w-5 h-5 flex-shrink-0" />
                <span>Tercihlerim</span>
              </Link>
            </div>

            <div className="border-t border-white/10 pt-2 mt-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-primary-100/90 hover:bg-red-500/20 hover:text-white transition-colors"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span>Çıkış Yap</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}



