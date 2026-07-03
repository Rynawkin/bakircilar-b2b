'use client';

/**
 * AdminNavigationNew — yeni (redesign) yonetim paneli ust cubugu.
 * Klasik AdminNavigation ile AYNI mantik/veri/izin/bildirim; yalnizca gorsel yeni
 * (beyaz-premium topbar, musteri paneliyle tutarli). theme==='new' iken render edilir.
 */

import { useState, Fragment, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import { LogoLink } from '@/components/ui/Logo';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';
import { Notification } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import { navItems, settingsItems, NavItem } from './AdminNavigation';

// Tasarimda one cikan 6 birincil modul (gerisi "Digerleri"ne duser).
const PRIMARY_HREFS = ['/dashboard', '/orders', '/quotes', '/order-tracking', '/operations', '/customers'];
import { ChevronDown, MoreHorizontal, Settings, Bell, LogOut, Menu as MenuIcon, X } from 'lucide-react';

export function AdminNavigationNew() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { theme: uiTheme, setTheme: setUiTheme, hydrate: hydrateUiTheme } = useUiThemeStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    setNotificationLoading(true);
    try {
      const { notifications: data, unreadCount: unread } = await adminApi.getNotifications({ limit: 10 });
      setNotifications(data || []);
      setUnreadCount(unread || 0);
    } catch (error) {
      console.error('Notifications not loaded:', error);
    } finally {
      setNotificationLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await adminApi.markNotificationsReadAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Notifications not updated:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await adminApi.markNotificationsRead([notification.id]);
        setNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Notification not updated:', error);
      }
    }
    if (notification.linkUrl) router.push(notification.linkUrl);
  };

  useEffect(() => {
    hydrateUiTheme();
  }, [hydrateUiTheme]);

  // Mobil menu acikken arka plandaki sayfa kaymasini kilitle.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mobileMenuOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const changeUiTheme = (next: 'new' | 'old') => {
    if (next === uiTheme) return;
    setUiTheme(next);
    if (typeof window !== 'undefined') window.location.reload();
  };

  const isActive = (href: string) => pathname === href;

  const canAccess = (permission?: string | string[]) => {
    if (!permission) return true;
    if (permissionsLoading) return true;
    if (Array.isArray(permission)) return permission.some((perm) => hasPermission(perm));
    return hasPermission(permission);
  };

  const visibleNavItems = navItems.filter((item) => canAccess(item.permission));
  const visibleSettingsItems = settingsItems.filter((item) => canAccess(item.permission));
  // Birincil = tasarimdaki onemli 6 (izin varsa, tasarim sirasinda); gerisi taskinda.
  const primaryNavItems = PRIMARY_HREFS
    .map((href) => visibleNavItems.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const overflowNavItems = visibleNavItems.filter((item) => !PRIMARY_HREFS.includes(item.href));
  const homeHref = user?.role === 'DEPOCU' ? '/warehouse' : '/dashboard';

  const dropdownPanel = 'origin-top-right rounded-xl bg-white shadow-[0_18px_36px_rgba(20,34,59,0.14)] ring-1 ring-[var(--line)] focus:outline-none';

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-white">
      <div className="mx-auto flex h-[60px] w-full max-w-[1900px] items-center gap-3.5 px-4 sm:px-6 lg:px-8">
        {/* Logo + marka */}
        <div className="flex flex-none items-center gap-2.5">
          <LogoLink href={homeHref} variant="dark" />
          <div className="hidden border-l border-[var(--line)] pl-3 md:block">
            <p className="text-[13.5px] font-semibold leading-tight text-[var(--ink-1)]">Yönetim Paneli</p>
            <p className="text-[11px] text-[var(--ink-3)]">{user?.name}</p>
          </div>
        </div>

        {/* Birincil nav (lg+) */}
        <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
          {primaryNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.description}
              className={`flex h-[38px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden xl:inline">{item.name}</span>
            </Link>
          ))}

          {overflowNavItems.length > 0 && (
            <Menu as="div" className="relative">
              <Menu.Button className="flex h-[38px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]">
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden xl:inline">Diğerleri</span>
                <ChevronDown className="h-3 w-3" />
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
                <Menu.Items className={`absolute left-0 mt-2 max-h-[calc(100vh-5rem)] w-[min(92vw,620px)] overflow-y-auto p-2 ${dropdownPanel}`}>
                  <div className="grid grid-cols-2 gap-1 xl:grid-cols-2">
                    {overflowNavItems.map((item) => (
                      <Menu.Item key={item.href}>
                        {({ active }) => (
                          <Link
                            href={item.href}
                            className={`flex min-w-0 items-start gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                              active ? 'bg-[var(--surface-0)]' : ''
                            } ${isActive(item.href) ? 'bg-primary-50' : ''}`}
                          >
                            <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-2)]" />
                            <div className="min-w-0 text-left">
                              <div className="truncate text-[13px] font-semibold text-[var(--ink-1)]">{item.name}</div>
                              {item.description && (
                                <div className="line-clamp-1 text-[11px] text-[var(--ink-3)]">{item.description}</div>
                              )}
                            </div>
                          </Link>
                        )}
                      </Menu.Item>
                    ))}
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          )}
        </nav>

        {/* Sag aksiyonlar */}
        <div className="ml-auto flex flex-none items-center gap-2">
          {/* Ayarlar */}
          {visibleSettingsItems.length > 0 && (
            <Menu as="div" className="relative hidden lg:block">
              <Menu.Button className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]">
                <Settings className="h-4 w-4" />
                <span className="hidden xl:inline">Ayarlar</span>
                <ChevronDown className="h-3 w-3" />
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
                <Menu.Items className={`absolute right-0 mt-2 w-64 p-2 ${dropdownPanel}`}>
                  {visibleSettingsItems.map((item) => (
                    <Menu.Item key={item.href}>
                      {({ active }) => (
                        <Link
                          href={item.href}
                          className={`flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                            active ? 'bg-[var(--surface-0)]' : ''
                          } ${isActive(item.href) ? 'bg-primary-50' : ''}`}
                        >
                          <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-2)]" />
                          <div className="text-left">
                            <div className="text-[13px] font-semibold text-[var(--ink-1)]">{item.name}</div>
                            {item.description && (
                              <div className="text-[11px] text-[var(--ink-3)]">{item.description}</div>
                            )}
                          </div>
                        </Link>
                      )}
                    </Menu.Item>
                  ))}
                </Menu.Items>
              </Transition>
            </Menu>
          )}

          {/* Bildirimler */}
          <Menu as="div" className="relative">
            <Menu.Button
              onClick={fetchNotifications}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white transition-colors hover:bg-[var(--surface-0)]"
              aria-label="Bildirimler"
            >
              <Bell className="h-[18px] w-[18px] text-[var(--ink-2)]" />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-semibold text-white">
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
              <Menu.Items className={`absolute right-0 mt-2 w-80 overflow-hidden ${dropdownPanel}`}>
                <div className="flex items-center justify-between border-b border-[var(--line)] px-3.5 py-3">
                  <span className="text-[13px] font-semibold text-[var(--ink-1)]">Bildirimler</span>
                  <button type="button" onClick={handleMarkAllRead} className="text-[11.5px] font-medium text-primary-600 hover:text-primary-700">
                    Tümünü okundu yap
                  </button>
                </div>
                <div className="max-h-80 space-y-2 overflow-auto p-2">
                  {notificationLoading && <div className="px-2 py-3 text-xs text-[var(--ink-3)]">Yükleniyor...</div>}
                  {!notificationLoading && notifications.length === 0 && (
                    <div className="px-2 py-3 text-xs text-[var(--ink-3)]">Bildirim yok.</div>
                  )}
                  {!notificationLoading &&
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        type="button"
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          notification.isRead
                            ? 'border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
                            : 'border-primary-200 bg-primary-50 text-[var(--ink-1)] hover:bg-primary-100'
                        }`}
                      >
                        <div className="text-[12.5px] font-semibold">{notification.title}</div>
                        {notification.body && (
                          <div className="mt-1 line-clamp-2 text-[11.5px] text-[var(--ink-2)]">{notification.body}</div>
                        )}
                        <div className="mt-1 text-[10.5px] text-[var(--ink-3)]">{formatDateShort(notification.createdAt)}</div>
                      </button>
                    ))}
                </div>
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Kullanici menusu + Gorunum toggle */}
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white py-1 pl-1 pr-2.5 transition-colors hover:bg-[var(--surface-0)]">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-primary-50 text-[12px] font-semibold text-primary-700">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)]" />
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
              <Menu.Items className={`absolute right-0 mt-2 w-60 p-2 ${dropdownPanel}`}>
                <div className="border-b border-[var(--line)] px-2.5 pb-2.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--ink-1)]">{user?.name}</span>
                    <span className="rounded-full border border-primary-100 bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                      Admin
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">{user?.email}</div>
                </div>

                {/* Gorunum gecisi */}
                <div className="px-1 pt-2">
                  <div className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">Görünüm</div>
                  <div className="mb-1 flex gap-1 px-0.5">
                    <button
                      type="button"
                      onClick={() => changeUiTheme('new')}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                        uiTheme === 'new' ? 'bg-primary-600 text-white' : 'bg-[var(--surface-0)] text-[var(--ink-2)] hover:bg-gray-100'
                      }`}
                    >
                      Yeni
                    </button>
                    <button
                      type="button"
                      onClick={() => changeUiTheme('old')}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                        uiTheme === 'old' ? 'bg-primary-600 text-white' : 'bg-[var(--surface-0)] text-[var(--ink-2)] hover:bg-gray-100'
                      }`}
                    >
                      Klasik
                    </button>
                  </div>
                </div>

                <div className="my-1 border-t border-[var(--line)]" />
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={handleLogout}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        active ? 'bg-red-50 text-red-700' : 'text-[var(--ink-2)]'
                      }`}
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Çıkış Yap</span>
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Mobil menu butonu */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--surface-0)] lg:hidden"
            aria-label="Menü"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobil menu */}
      {mobileMenuOpen && (
        <div className="border-t border-[var(--line)] bg-white px-4 py-3 lg:hidden max-h-[calc(100dvh-60px)] overflow-y-auto overscroll-contain">
          <div className="space-y-1">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive(item.href) ? 'bg-primary-50 text-primary-700' : 'text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            ))}
            {visibleSettingsItems.length > 0 && (
              <div className="mt-2 border-t border-[var(--line)] pt-2">
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">Ayarlar</p>
                {visibleSettingsItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive(item.href) ? 'bg-primary-50 text-primary-700' : 'text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-2 border-t border-[var(--line)] pt-2">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-5 w-5" />
                <span>Çıkış Yap</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default AdminNavigationNew;
