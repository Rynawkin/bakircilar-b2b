'use client';

import { useState, Fragment, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { LogoLink } from '@/components/ui/Logo';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';
import { Notification } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import {
  LayoutDashboard,
  ClipboardList,
  Mail,
  MonitorSmartphone,
  Users,
  Package,
  Target,
  BarChart3,
  Folder,
  Tag,
  Ban,
  FileText,
  ListTodo,
  Clock,
  Download,
  Settings,
  Bell,
  ImageOff,
  ChevronDown,
  Menu as MenuIcon,
  X,
  LogOut,
  Percent
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  permission?: string | string[];
}

const navItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Genel bakÄ±ÅŸ',
    permission: [
      'dashboard:orders',
      'dashboard:customers',
      'dashboard:excess-stock',
      'dashboard:sync',
      'dashboard:stok-ara',
      'dashboard:cari-ara',
      'dashboard:ekstre',
      'dashboard:diversey-stok',
    ],
  },
  { name: 'SipariÅŸler', href: '/orders', icon: ClipboardList, description: 'SipariÅŸ yÃ¶netimi', permission: 'admin:orders' },
  { name: 'Teklifler', href: '/quotes', icon: FileText, description: 'Teklif yÃ¶netimi', permission: 'admin:quotes' },
  { name: 'Teklif Kalemleri', href: '/quotes/lines', icon: FileText, description: 'Teklif kalemleri', permission: 'admin:quotes' },
  { name: 'SipariÅŸ Takip', href: '/order-tracking', icon: Mail, description: 'Bekleyen sipariÅŸler', permission: 'admin:order-tracking' },
  { name: 'Depo Kiosk', href: '/warehouse', icon: MonitorSmartphone, description: 'Toplama ve yÃ¼kleme ekranÄ±', permission: 'admin:order-tracking' },
  { name: 'Perakende Satis', href: '/warehouse/retail', icon: MonitorSmartphone, description: 'Hizli satis ekrani', permission: 'admin:order-tracking' },
  { name: 'Resim Hata Talepleri', href: '/warehouse/image-issues', icon: ImageOff, description: 'Depodan gelen urun resmi hatalari', permission: 'admin:order-tracking' },
  { name: 'MÃ¼ÅŸteriler', href: '/customers', icon: Users, description: 'MÃ¼ÅŸteri listesi', permission: 'admin:customers' },
  { name: 'Musteri Portfoyum', href: '/portfolio', icon: Users, description: 'Musteri portfoyu', permission: 'admin:customers' },
  { name: 'AnlaÅŸmalÄ± Fiyatlar', href: '/customer-agreements', icon: Tag, description: 'MÃ¼ÅŸteri anlaÅŸmalarÄ±', permission: 'admin:agreements' },
  { name: 'Vade Takip', href: '/vade', icon: Clock, description: 'Vade ve alacak takibi', permission: 'admin:vade' },
  { name: 'Faturalar', href: '/einvoices', icon: Download, description: 'E-fatura PDF arÅŸivi', permission: 'admin:einvoices' },
  { name: 'ÃœrÃ¼nler', href: '/admin-products', icon: Package, description: 'ÃœrÃ¼n yÃ¶netimi', permission: 'admin:products' },
  { name: 'Talepler', href: '/requests', icon: ListTodo, description: 'GÃ¶rev ve talepler', permission: 'admin:requests' },
  { name: 'Kampanyalar', href: '/campaigns', icon: Target, description: 'Ä°ndirim kampanyalarÄ±', permission: 'admin:campaigns' },
  {
    name: 'Raporlar',
    href: '/reports',
    icon: BarChart3,
    description: 'Raporlar ve analizler',
    permission: [
      'reports:margin-compliance',
      'reports:price-history',
      'reports:pending-orders',
      'reports:cost-update-alerts',
      'reports:profit-analysis',
      'reports:top-products',
      'reports:top-customers',
      'reports:supplier-price-lists',
      'reports:complement-missing',
    ],
  },
];

navItems.splice(6, 0, {
  name: 'Operasyon Merkezi',
  href: '/operations',
  icon: BarChart3,
  description: 'ATP, risk, ikame ve data quality',
  permission: ['admin:order-tracking', 'admin:orders', 'reports:customer-activity', 'admin:vade'],
});


const settingsItems: NavItem[] = [
  { name: 'Kategoriler', href: '/categories', icon: Folder, description: 'Fiyatlandirma ayarlari', permission: 'admin:price-rules' },
  { name: 'Urun Override', href: '/product-overrides', icon: Tag, description: 'Ozel fiyatlar', permission: 'admin:price-rules' },
  { name: 'Tedarikci Iskonto', href: '/supplier-price-list-settings', icon: Percent, description: 'Tedarikci iskonto ayarlari', permission: 'admin:supplier-price-lists' },
  { name: 'Haric Tutma', href: '/exclusions', icon: Ban, description: 'Rapor filtreleme', permission: 'admin:exclusions' },
  { name: 'Personel', href: '/staff', icon: Users, description: 'Personel yonetimi', permission: 'admin:staff' },
  { name: 'Ayarlar', href: '/settings', icon: Settings, description: 'Sistem ayarlari', permission: 'admin:settings' },
];



export function AdminNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
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
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href;

  // Role-based navigation filtering
  const canAccess = (permission?: string | string[]) => {
    if (!permission) return true;
    if (permissionsLoading) return true;
    if (Array.isArray(permission)) {
      return permission.some((perm) => hasPermission(perm));
    }
    return hasPermission(permission);
  };

  const getVisibleNavItems = () => {
    return navItems.filter((item) => canAccess(item.permission));
  };

  const getVisibleSettingsItems = () => {
    return settingsItems.filter((item) => canAccess(item.permission));
  };

  const visibleNavItems = getVisibleNavItems();
  const visibleSettingsItems = getVisibleSettingsItems();
  const primaryNavItems = visibleNavItems.slice(0, 6);
  const overflowNavItems = visibleNavItems.slice(6);

  return (
    <nav className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg sticky top-0 z-50">
      <div className="container-custom">
        <div className="flex justify-between items-center h-14">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <LogoLink href="/dashboard" variant="light" />
            <div className="hidden md:block border-l border-primary-500 pl-4">
              <p className="text-sm font-semibold text-white">YÃ¶netim Paneli</p>
              <p className="text-xs text-primary-100">{user?.name}</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {primaryNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive(item.href)
                    ? 'bg-white text-primary-700 shadow-md'
                    : 'text-white hover:bg-primary-800/50'
                }`}
                title={item.description}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden xl:inline">{item.name}</span>
              </Link>
            ))}

            {overflowNavItems.length > 0 && (
              <Menu as="div" className="relative">
                <Menu.Button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-primary-800/50 transition-all">
                  <MenuIcon className="w-4 h-4" />
                  <span className="hidden xl:inline">Digerleri</span>
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
                    <div className="p-2">
                      {overflowNavItems.map((item) => (
                        <Menu.Item key={item.href}>
                          {({ active }) => (
                            <Link
                              href={item.href}
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
                            </Link>
                          )}
                        </Menu.Item>
                      ))}
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            )}

            {/* Settings Dropdown - Sadece ayarlar varsa gÃ¶ster */}
            {visibleSettingsItems.length > 0 && (
              <Menu as="div" className="relative">
              <Menu.Button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white hover:bg-primary-800/50 transition-all">
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
                            <Link
                              href={item.href}
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
                            </Link>
                          )}
                        </Menu.Item>
                      ))}
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            )}

            {/* Notifications */}
            <Menu as="div" className="relative ml-1">
              <Menu.Button
                className="relative flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-primary-800/50 transition-all"
                onClick={fetchNotifications}
                aria-label="Bildirimler"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
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
                <Menu.Items className="absolute right-0 mt-2 w-80 origin-top-right bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
                    <div className="text-sm font-semibold text-gray-800">Bildirimler</div>
                    <button
                      className="text-xs text-primary-600 hover:text-primary-700"
                      onClick={handleMarkAllRead}
                      type="button"
                    >
                      Tumunu okundu yap
                    </button>
                  </div>
                  <div className="max-h-80 overflow-auto p-2 space-y-2">
                    {notificationLoading && (
                      <div className="text-xs text-gray-500 px-2 py-3">Yukleniyor...</div>
                    )}
                    {!notificationLoading && notifications.length === 0 && (
                      <div className="text-xs text-gray-500 px-2 py-3">Bildirim yok.</div>
                    )}
                    {!notificationLoading && notifications.map((notification) => (
                      <button
                        key={notification.id}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          notification.isRead
                            ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            : 'border-primary-200 bg-primary-50 text-gray-800 hover:bg-primary-100'
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                        type="button"
                      >
                        <div className="text-sm font-medium">{notification.title}</div>
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
              <Menu.Button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-primary-800/50 text-white hover:bg-primary-800 transition-all">
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
                    <p className="text-xs text-primary-600 font-medium mt-1">ğŸ‘‘ Admin</p>
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
                          <span>Ã‡Ä±kÄ±ÅŸ Yap</span>
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
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
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
              </Link>
            ))}

            {visibleSettingsItems.length > 0 && (
              <div className="border-t border-primary-500 pt-2 mt-2">
                <p className="px-4 py-2 text-xs font-semibold text-primary-200">Ayarlar</p>
                {visibleSettingsItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
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
                  </Link>
                ))}
              </div>
            )}

            <div className="border-t border-primary-500 pt-2 mt-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-white hover:bg-red-500/20"
              >
                <LogOut className="w-5 h-5" />
                <span>Ã‡Ä±kÄ±ÅŸ Yap</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
