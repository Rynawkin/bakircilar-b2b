'use client';

import { useState, Fragment, useEffect, useMemo, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import customerApi, { CustomerFinancials } from '@/lib/api/customer';
import { formatDateShort, formatCurrency } from '@/lib/utils/format';
import { buildCategoryTree, getCategoryPath } from '@/lib/utils/categoryTree';
import { normalizeSearchText } from '@/lib/utils/search';
import { browserPushReasonLabel, registerBrowserPush } from '@/lib/webPush';
import { MobileCategoryPanel } from '@/components/customer/MobileCategoryPanel';
import { LogoLink } from '@/components/ui/Logo';
import { Notification, Category, NotificationPreference } from '@/types';
import {
  Search,
  LayoutGrid,
  ShoppingCart,
  Package,
  Clock,
  FileText,
  CreditCard,
  ListTodo,
  ClipboardList,
  Tag,
  Percent,
  User,
  Settings,
  Bell,
  LogOut,
  ChevronDown,
  ChevronRight,
  Menu as MenuIcon,
  X,
} from 'lucide-react';

const ACCOUNT_LINKS = (pendingRequestCount: number, isSubUser: boolean) => [
  { name: 'Siparişlerim', href: '/my-orders', icon: Package },
  { name: 'Bekleyen Siparişler', href: '/pending-orders', icon: Clock },
  { name: 'Online Ödeme', href: '/payments', icon: CreditCard },
  { name: 'Faturalarım', href: '/invoices', icon: FileText },
  { name: 'Tekliflerim', href: '/my-quotes', icon: FileText },
  ...(!isSubUser
    ? [{ name: 'Sipariş Talepleri', href: '/order-requests', icon: ClipboardList, badge: pendingRequestCount }]
    : []),
  { name: 'Taleplerim', href: '/my-requests', icon: ListTodo },
];

export function CustomerNavigation({ cartItemCount = 0 }: { cartItemCount?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { cart } = useCartStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [megaRootId, setMegaRootId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreference[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationPreferenceBusy, setNotificationPreferenceBusy] = useState<string | null>(null);
  const [markAllReadBusy, setMarkAllReadBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [agreementsAvailable, setAgreementsAvailable] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [financials, setFinancials] = useState<CustomerFinancials | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const megaButtonRef = useRef<HTMLButtonElement>(null);
  const megaFirstItemRef = useRef<HTMLButtonElement>(null);

  const isSubUser = Boolean(user?.parentCustomerId);
  // Sepet rozeti: kalem (satir) sayisi — 2. birim satirlarinda kesirli baz-miktar
  // toplami "0,5" gibi tuhaf gorunmesin diye adet toplami yerine kalem sayisi gosterilir.
  const cartCount = cart?.items?.length ?? cartItemCount;
  const cartTotal = cart?.total ?? 0;

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

  const fetchNotificationPreferences = async () => {
    if (!user) return;
    try {
      const { categories } = await customerApi.getNotificationPreferences();
      setNotificationPreferences(categories || []);
    } catch (error) {
      console.error('Notification preferences not loaded:', error);
    }
  };

  const handleToggleNotificationPreference = async (category: string, enabled: boolean) => {
    if (notificationPreferenceBusy) return;
    const previous = notificationPreferences;
    const next = previous.map((item) => (item.key === category ? { ...item, enabled } : item));
    setNotificationPreferences(next);
    setNotificationPreferenceBusy(category);
    try {
      const { categories } = await customerApi.updateNotificationPreferences(
        next.map((item) => ({ category: item.key, enabled: item.enabled }))
      );
      setNotificationPreferences(categories || next);
    } catch (error) {
      console.error('Notification preferences not updated:', error);
      setNotificationPreferences(previous);
      toast.error('Bildirim tercihi kaydedilemedi. Lütfen tekrar deneyin.', { duration: 5000 });
    } finally {
      setNotificationPreferenceBusy(null);
    }
  };

  const handleEnableBrowserPush = async () => {
    setPushBusy(true);
    try {
      const result = await registerBrowserPush({
        getPublicKey: async () => {
          const { publicKey } = await customerApi.getWebPushPublicKey();
          return publicKey;
        },
        registerSubscription: (subscription) => customerApi.registerWebPushSubscription(subscription),
        afterRegister: async () => {
          await customerApi.sendTestWebPush({
            title: 'Tarayici bildirimleri acildi',
            body: 'Bundan sonra ilgili bildirimler bu tarayiciya da gelecek.',
            linkUrl: '/home',
          });
        },
        localTestNotification: {
          title: 'Tarayici bildirimleri acildi',
          body: 'Bu tarayici Bakircilar B2B bildirimlerini alacak.',
          linkUrl: '/home',
        },
      });
      if (result.enabled) {
        toast.success(
          result.reason === 'test-failed'
            ? 'Tarayici bildirimleri acildi. Sunucu test bildirimi sonra tekrar denenebilir.'
            : 'Tarayici bildirimleri acildi. Test bildirimi gonderildi.'
        );
      } else {
        toast.error(browserPushReasonLabel(result.reason));
      }
    } catch (error) {
      console.error('Browser push not enabled:', error);
      const message = (error as any)?.response?.data?.error || (error as any)?.message || 'Tarayici bildirimi acilamadi.';
      toast.error(message);
    } finally {
      setPushBusy(false);
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

  const fetchCategories = async () => {
    if (!user) return;
    try {
      const { categories: data } = await customerApi.getCategories();
      setCategories(data || []);
    } catch (error) {
      console.error('Categories not loaded:', error);
    }
  };

  const fetchFinancials = async () => {
    if (!user) return;
    try {
      const { financials: data } = await customerApi.getFinancials();
      setFinancials(data);
    } catch (error) {
      console.error('Financials not loaded:', error);
    }
  };

  const handleMarkAllRead = async () => {
    if (markAllReadBusy || unreadCount === 0) return;
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    setMarkAllReadBusy(true);
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    try {
      await customerApi.markNotificationsReadAll();
    } catch (error) {
      console.error('Notifications not updated:', error);
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      toast.error('Bildirimler okundu olarak işaretlenemedi. Lütfen tekrar deneyin.', { duration: 5000 });
    } finally {
      setMarkAllReadBusy(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await customerApi.markNotificationsRead([notification.id]);
        setNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Notification not updated:', error);
      }
    }
    if (notification.linkUrl) router.push(notification.linkUrl);
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    fetchPendingRequestCount();
    fetchAgreementsAvailability();
    fetchCategories();
    fetchFinancials();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchPendingRequestCount();
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.parentCustomerId]);

  // Mobil menu VEYA kategori paneli acikken arka plan (body) kaymasini kilitle —
  // panel/dropdown kendi scroll'unu kullansin, arkadaki sayfayi surumesin.
  // Menu kapaninca eski overflow geri gelir.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!mobileMenuOpen && !mobileCategoriesOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen, mobileCategoriesOpen]);

  // Rota degisince mobil menu ve kategori panelini kapat
  // (link tiklamalari zaten kapatiyor; guvence)
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileCategoriesOpen(false);
    setMegaOpen(false);
  }, [pathname]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      setSearchFocused(true);
    };

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  // Hesap menusu ve kategori paneli birbirini disar (ayni anda bir tanesi acik)
  const openMobileMenu = () => {
    setMobileCategoriesOpen(false);
    setMobileMenuOpen((prev) => !prev);
  };
  const openMobileCategories = () => {
    setMobileMenuOpen(false);
    setMobileCategoriesOpen((prev) => !prev);
  };

  // Kategori panelinden bir kategoriye git: paneli kapat + urunler sayfasina yonlendir
  const goToCategory = (categoryId: string) => {
    setMobileCategoriesOpen(false);
    router.push(`/products?categoryId=${categoryId}`);
  };
  const goToAllProducts = () => {
    setMobileCategoriesOpen(false);
    router.push('/products');
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchTerm.trim();
    router.push(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
  };

  // Ana (kok) kategoriler — mikroCode hiyerarsisinden turetilir
  const { roots, childrenById, nodesById } = useMemo(() => buildCategoryTree(categories), [categories]);

  const goToSearch = () => {
    const term = searchTerm.trim();
    setSearchFocused(false);
    router.push(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
  };

  // Arama barinda KATEGORI onerileri (Turkce-foldlu): "strec" -> "Gida Strecleri"
  // i/I, ç/c, ş/s, ğ/g, ö/o, ü/u farki normalizeSearchText ile yok sayilir.
  const categoryMatches = useMemo(() => {
    const q = normalizeSearchText(searchTerm);
    if (q.length < 2) return [] as Category[];
    return categories
      .map((c) => ({ c, norm: normalizeSearchText(c.name) }))
      .filter((x) => x.norm.includes(q))
      .sort((a, b) => {
        const aStarts = a.norm.startsWith(q) ? 0 : 1;
        const bStarts = b.norm.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.c.name.localeCompare(b.c.name, 'tr');
      })
      .slice(0, 8)
      .map((x) => x.c);
  }, [categories, searchTerm]);

  // Mega menu: sol ANA listesi + secili ananin ALT'lari (her altin altinda EN-ALT'lar).
  // Sag taraf cok-kolonlu akar -> uzun ana kategoride bos alan kalmaz, dagimik durmaz.
  const megaActiveRootId =
    megaRootId && roots.some((r) => r.id === megaRootId) ? megaRootId : roots[0]?.id || null;
  const megaActiveRoot = megaActiveRootId ? nodesById.get(megaActiveRootId) || null : null;
  const megaAlts: Category[] = megaActiveRootId
    ? (childrenById.get(megaActiveRootId) || [])
        .map((id) => nodesById.get(id))
        .filter((c): c is Category => Boolean(c))
    : [];
  const accountLinks = ACCOUNT_LINKS(pendingRequestCount, isSubUser);
  const isActive = (href: string) => pathname === href;

  const rightLinks = [
    { name: 'İndirimli', href: '/discounted-products', icon: Percent, accent: true },
    ...(agreementsAvailable ? [{ name: 'Anlaşmalı', href: '/agreements', icon: Tag, accent: false }] : []),
    { name: 'Daha Önce Aldıklarım', href: '/previously-purchased', icon: Clock, accent: false },
  ];

  return (
    <header className="sticky top-0 z-50 w-full overflow-x-clip bg-white">
      {/* ── ÜST BAR (sticky 64px) ────────────────────────────────── */}
      <div className="border-b border-[var(--line)]">
        <div className="mx-auto flex h-16 w-full max-w-[1900px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:gap-[18px] lg:px-8">
          {/* Logo (sola sabit) */}
          <div className="flex flex-none items-center gap-2.5">
            <LogoLink href="/home" variant="dark" size="md" />
            <span className="mt-0.5 hidden text-[9px] font-medium tracking-[0.17em] text-[var(--ink-3)] xl:block">
              TOPTAN SİPARİŞ PORTALI
            </span>
          </div>

          {/* Arama (flex:1, min-w-0, ÜST SINIR YOK → sağ küme en sağa yaslanır) */}
          <div className="relative flex h-[42px] min-w-0 flex-1 items-center">
            <form onSubmit={handleSearch} className="flex h-[42px] w-full items-center gap-2.5 rounded-[10px] border border-[var(--line)] bg-[#f6f8fc] px-3.5">
              <Search className="h-[18px] w-[18px] flex-none text-[var(--ink-3)]" />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Enter her zaman TERIM aramasina gitsin (kategori onerisi acikken de).
                    e.preventDefault();
                    goToSearch();
                  }
                }}
                placeholder="Ürün adı, Mikro kodu veya marka ara…"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--ink-1)] outline-none placeholder:text-[#9aa6b8]"
              />
              <span className="hidden select-none rounded-[5px] border border-[var(--line)] bg-white px-1.5 py-px text-[11px] text-[#9aa6b8] sm:inline">
                /
              </span>
            </form>

            {/* Kategori onerileri (yazdikca, Turkce-foldlu) */}
            {searchFocused && categoryMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_18px_36px_rgba(20,34,59,0.12)]">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                  Kategoriler
                </div>
                <div className="max-h-72 overflow-y-auto pb-1">
                  {categoryMatches.map((c) => {
                    const path = getCategoryPath(c.id, categories);
                    const parentLabel = path.slice(0, -1).map((p) => p.name).join(' › ');
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearchFocused(false);
                          setSearchTerm('');
                          router.push(`/products?categoryId=${c.id}`);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-0)]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
                          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-1)]">{c.name}</span>
                        </span>
                        {parentLabel && (
                          <span className="hidden max-w-[45%] shrink-0 truncate text-[11.5px] text-[var(--ink-3)] sm:block">
                            {parentLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={goToSearch}
                  className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-left text-[13px] font-semibold text-primary-700 transition-colors hover:bg-primary-50"
                >
                  <Search className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">"{searchTerm.trim()}" için tüm ürünlerde ara</span>
                </button>
              </div>
            )}
          </div>

          {/* Bakiye / Vadesi gecen (bakiye pill) */}
          {financials && (
            <div className="hidden h-[42px] flex-none items-center gap-3.5 rounded-[10px] border border-[var(--line)] px-3.5 xl:flex">
              <div className="flex flex-col leading-[1.2]">
                <span className="text-[10px] font-medium text-[#8b97ac]">Bakiye</span>
                <span className="text-[13px] font-semibold text-[var(--ink-1)]">{formatCurrency(financials.totalBalance)}</span>
              </div>
              {financials.pastDueBalance > 0 && (
                <>
                  <span className="h-6 w-px bg-[var(--line)]" />
                  <div className="flex flex-col leading-[1.2]">
                    <span className="text-[10px] font-medium text-[#8b97ac]">Vadesi gelen</span>
                    <span className="text-[13px] font-semibold text-[#b45309]">{formatCurrency(financials.pastDueBalance)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bildirim */}
          <Menu as="div" className="relative flex-none">
            <Menu.Button
              onClick={() => {
                fetchNotifications();
                fetchNotificationPreferences();
              }}
              className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border border-[var(--line)] text-[var(--ink-2)] transition-colors hover:bg-[#f6f8fc]"
              aria-label="Bildirimler"
            >
              <Bell className="h-[19px] w-[19px]" />
              {unreadCount > 0 && (
                <span className="absolute right-2.5 top-2.5 h-[7px] w-[7px] rounded-full bg-[#dc2626] ring-[1.5px] ring-white" />
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
              <Menu.Items className="absolute right-0 z-[60] mt-2 w-[calc(100vw-1.5rem)] max-w-[20rem] origin-top-right overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[var(--line)] focus:outline-none sm:w-80">
                <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                  <div className="text-sm font-semibold text-[var(--ink-1)]">Bildirimler</div>
                  <button
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleMarkAllRead}
                    disabled={markAllReadBusy || unreadCount === 0}
                    type="button"
                  >
                    {markAllReadBusy ? 'Güncelleniyor…' : 'Tümünü okundu yap'}
                  </button>
                </div>
                <div className="border-b border-[var(--line)] bg-[var(--surface-0)] px-4 py-3">
                  <button
                    className="mb-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-left text-xs font-semibold text-[var(--ink-1)] transition-colors hover:bg-primary-50 disabled:opacity-60"
                    disabled={pushBusy}
                    onClick={handleEnableBrowserPush}
                    type="button"
                  >
                    {pushBusy ? 'Tarayici bildirimi aciliyor...' : 'Tarayici bildirimlerini ac'}
                  </button>
                  {notificationPreferences.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {notificationPreferences.map((item) => (
                        <label key={item.key} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1.5 text-[11px] text-[var(--ink-2)]">
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            disabled={notificationPreferenceBusy !== null}
                            onChange={(event) => handleToggleNotificationPreference(item.key, event.target.checked)}
                            className="h-3.5 w-3.5 accent-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <span className="truncate">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="max-h-80 space-y-1.5 overflow-auto p-2">
                  {notificationLoading && <div className="px-2 py-3 text-xs text-[var(--ink-3)]">Yükleniyor…</div>}
                  {!notificationLoading && notifications.length === 0 && (
                    <div className="px-2 py-6 text-center text-xs text-[var(--ink-3)]">Bildiriminiz bulunmuyor.</div>
                  )}
                  {!notificationLoading &&
                    notifications.map((notification) => (
                      <Menu.Item key={notification.id}>
                        {({ active }) => (
                          <button
                            className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                              notification.isRead
                                ? 'border-transparent text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
                                : 'border-primary-100 bg-primary-50 text-[var(--ink-1)] hover:bg-primary-100/70'
                            } ${active ? 'ring-2 ring-primary-200' : ''}`}
                            onClick={() => handleNotificationClick(notification)}
                            type="button"
                          >
                            <div className="flex items-start gap-2 text-sm font-medium">
                              {!notification.isRead && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-600" />}
                              <span className="flex-1">{notification.title}</span>
                            </div>
                            {notification.body && <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-2)]">{notification.body}</div>}
                            <div className="mt-1 text-[11px] text-[var(--ink-3)]">{formatDateShort(notification.createdAt)}</div>
                          </button>
                        )}
                      </Menu.Item>
                    ))}
                </div>
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Hesap menüsü */}
          <Menu as="div" className="relative hidden flex-none md:block">
            <Menu.Button className="flex h-[42px] items-center gap-2.5 rounded-[10px] border border-[var(--line)] py-1 pl-[5px] pr-2.5 transition-colors hover:bg-[#f6f8fc]">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef2fa] text-[12.5px] font-semibold text-primary-700">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
              <span className="hidden flex-col items-start leading-tight lg:flex">
                <span className="max-w-[120px] truncate text-[12.5px] font-semibold text-[var(--ink-1)]">{user?.name}</span>
                {user?.mikroCariCode && <span className="font-mono text-[10px] text-[var(--ink-3)]">{user.mikroCariCode}</span>}
              </span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-3)]" />
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
              <Menu.Items className="absolute right-0 z-[60] mt-2 w-64 origin-top-right overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[var(--line)] focus:outline-none">
                <div className="border-b border-[var(--line)] p-4">
                  <p className="truncate text-sm font-semibold text-[var(--ink-1)]">{user?.name}</p>
                  <p className="truncate text-xs text-[var(--ink-3)]">{user?.email}</p>
                  {user?.mikroCariCode && <p className="mt-1.5 font-mono text-xs font-medium text-primary-600">Kod: {user.mikroCariCode}</p>}
                </div>
                <div className="p-1.5">
                  {accountLinks.map((link) => (
                    <Menu.Item key={link.href}>
                      {({ active }) => (
                        <Link
                          href={link.href}
                          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                            active ? 'bg-primary-50 text-primary-700' : 'text-[var(--ink-2)]'
                          }`}
                        >
                          <link.icon className="h-4 w-4" />
                          <span className="flex-1">{link.name}</span>
                          {'badge' in link && link.badge && link.badge > 0 ? (
                            <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{link.badge}</span>
                          ) : null}
                        </Link>
                      )}
                    </Menu.Item>
                  ))}
                  <div className="my-1.5 border-t border-[var(--line)]" />
                  <Menu.Item>
                    {({ active }) => (
                      <Link href="/profile" className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-primary-50 text-primary-700' : 'text-[var(--ink-2)]'}`}>
                        <User className="h-4 w-4" />
                        <span>Profilim</span>
                      </Link>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <Link href="/preferences" className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-primary-50 text-primary-700' : 'text-[var(--ink-2)]'}`}>
                        <Settings className="h-4 w-4" />
                        <span>Tercihlerim</span>
                      </Link>
                    )}
                  </Menu.Item>
                  <div className="my-1.5 border-t border-[var(--line)]" />
                  <Menu.Item>
                    {({ active }) => (
                      <button onClick={handleLogout} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-red-50 text-red-700' : 'text-[var(--ink-2)]'}`}>
                        <LogOut className="h-4 w-4" />
                        <span>Çıkış Yap</span>
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Sepet (lacivert) */}
          <Link
            href="/cart"
            className="flex h-[42px] flex-none items-center gap-2.5 rounded-[10px] bg-primary-700 px-2.5 text-white transition-colors hover:bg-primary-600 sm:px-[15px]"
          >
            <span className="relative flex">
              <ShoppingCart className="h-[19px] w-[19px]" />
              {cartCount > 0 && (
                <span className="absolute -right-[9px] -top-[7px] flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-primary-700">
                  {cartCount}
                </span>
              )}
            </span>
            <span className="hidden flex-col items-start leading-[1.2] sm:flex">
              <span className="text-[10px] font-medium text-[#a9bce0]">Sepet</span>
              <span className="text-[13px] font-semibold">{formatCurrency(cartTotal)}</span>
            </span>
          </Link>

          {/* Mobil menü butonu (hamburger = hesap/gezinme menusu) */}
          <button
            onClick={openMobileMenu}
            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] border border-[var(--line)] text-[var(--ink-2)] lg:hidden"
            aria-label="Menü"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── KATEGORİ / GEZİNME SATIRI (48px) ─────────────────────── */}
      <div
        className="relative hidden border-b border-[#eef1f6] md:block"
        onMouseLeave={() => setMegaOpen(false)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMegaOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !megaOpen) return;
          event.preventDefault();
          setMegaOpen(false);
          megaButtonRef.current?.focus();
        }}
      >
        <div className="mx-auto flex h-12 w-full max-w-[1900px] items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Sol — Anasayfa + Tüm Kategoriler (hover mega) + Tüm Ürünler */}
          <nav className="flex items-center gap-0.5 whitespace-nowrap">
            <Link
              href="/home"
              className={`flex h-12 items-center px-3 text-[13.5px] font-semibold text-primary-700 transition-colors hover:text-primary-600 ${
                isActive('/home') ? 'underline decoration-2 underline-offset-[14px]' : ''
              }`}
            >
              Anasayfa
            </Link>
            <button
              ref={megaButtonRef}
              type="button"
              onMouseEnter={() => setMegaOpen(true)}
              onClick={() => setMegaOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                setMegaOpen(true);
                window.requestAnimationFrame(() => megaFirstItemRef.current?.focus());
              }}
              aria-expanded={megaOpen}
              aria-haspopup="true"
              aria-controls="customer-category-mega-menu"
              className="flex h-12 items-center gap-2 px-[13px] text-[13.5px] font-semibold text-primary-700"
            >
              <LayoutGrid className="h-[17px] w-[17px]" />
              Tüm Kategoriler
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${megaOpen ? 'rotate-180' : ''}`} />
            </button>
            <Link
              href="/products"
              className={`flex h-12 items-center px-3 text-[13.5px] font-semibold text-primary-700 transition-colors hover:text-primary-600 ${
                isActive('/products') ? 'underline decoration-2 underline-offset-[14px]' : ''
              }`}
            >
              Tüm Ürünler
            </Link>
          </nav>

          {/* Sağ — İndirimli (emerald) + Anlaşmalı (koşullu) + Daha Önce Aldıklarım */}
          <div className="flex items-center gap-px">
            {rightLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex h-12 items-center gap-1.5 px-[11px] text-[13px] font-medium transition-colors ${
                  link.accent ? 'text-[#047857] hover:text-[#065f46]' : 'text-[var(--ink-2)] hover:text-primary-700'
                } ${isActive(link.href) ? 'underline decoration-2 underline-offset-[14px]' : ''}`}
              >
                <link.icon className="h-[15px] w-[15px]" />
                {link.name}
              </Link>
            ))}
          </div>
        </div>

        {/* Mega menü */}
        <Transition
          show={megaOpen}
          as={Fragment}
          enter="transition ease-out duration-150"
          enterFrom="opacity-0 -translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            id="customer-category-mega-menu"
            className="absolute inset-x-0 top-12 z-40 border-b border-[var(--line)] border-t border-t-[#eef1f6] bg-white shadow-[0_18px_36px_rgba(20,34,59,0.12)]"
            aria-label="Ürün kategorileri"
            role="region"
          >
            <div className="mx-auto w-full max-w-[1900px] px-4 py-[18px] sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-[var(--line)] md:grid-cols-[262px_minmax(0,1fr)] lg:grid-cols-[262px_minmax(0,1fr)_240px]">
                {/* Sol — ANA (kök) kategoriler; hover orta kolonu değiştirir */}
                <div className="max-h-[436px] overflow-y-auto border-b border-[var(--line)] bg-[#f6f8fc] py-2 md:border-b-0 md:border-r">
                  {roots.map((root, index) => {
                    const active = root.id === megaActiveRootId;
                    return (
                      <button
                        ref={index === 0 ? megaFirstItemRef : undefined}
                        key={root.id}
                        type="button"
                        onMouseEnter={() => setMegaRootId(root.id)}
                        onFocus={() => setMegaRootId(root.id)}
                        onClick={() => { setMegaOpen(false); router.push(`/products?categoryId=${root.id}`); }}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[13px] transition-colors ${
                          active ? 'bg-white font-semibold text-primary-700' : 'text-[var(--ink-2)] hover:bg-white hover:text-[var(--ink-1)]'
                        }`}
                      >
                        <span className="min-w-0 truncate">{root.name}</span>
                        <ChevronRight className={`h-[15px] w-[15px] shrink-0 ${active ? 'text-primary-600' : 'text-[var(--ink-3)]'}`} />
                      </button>
                    );
                  })}
                </div>

                {/* Orta — seçili kökün alt kategorileri (kolon akışı) + Tümünü gör → */}
                <div className="max-h-[436px] overflow-y-auto px-[22px] py-[18px]">
                  {megaActiveRoot && (
                    <div className="mb-[13px] flex items-center justify-between gap-3 border-b border-[#eef1f6] pb-[9px]">
                      <span className="min-w-0 truncate text-[13px] font-bold text-[var(--ink-1)]">{megaActiveRoot.name}</span>
                      <Link
                        href={`/products?categoryId=${megaActiveRoot.id}`}
                        onClick={() => setMegaOpen(false)}
                        className="shrink-0 text-[12px] font-semibold text-primary-700 hover:text-primary-800"
                      >
                        Tümünü gör →
                      </Link>
                    </div>
                  )}
                  {megaAlts.length === 0 ? (
                    <div className="text-[12.5px] text-[var(--ink-3)]">Bu kategoride alt kırılım yok.</div>
                  ) : (
                    <div className="[column-gap:22px] [column-width:150px]">
                      {megaAlts.map((alt) => {
                        const leaves = (childrenById.get(alt.id) || [])
                          .map((id) => nodesById.get(id))
                          .filter((c): c is Category => Boolean(c));
                        return (
                          <div key={alt.id} className="mb-4 break-inside-avoid">
                            <Link
                              href={`/products?categoryId=${alt.id}`}
                              onClick={() => setMegaOpen(false)}
                              className="block truncate py-[5px] text-[12.5px] font-semibold text-[var(--ink-1)] transition-colors hover:text-primary-700"
                            >
                              {alt.name}
                            </Link>
                            {leaves.length > 0 && (
                              <div className="flex flex-col">
                                {leaves.map((leaf) => (
                                  <Link
                                    key={leaf.id}
                                    href={`/products?categoryId=${leaf.id}`}
                                    onClick={() => setMegaOpen(false)}
                                    className="block truncate py-[5px] text-[12.5px] text-[var(--ink-2)] transition-colors hover:text-primary-700"
                                  >
                                    {leaf.name}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Sağ — lacivert gradient promo → /discounted-products */}
                <Link
                  href="/discounted-products"
                  onClick={() => setMegaOpen(false)}
                  className="relative hidden flex-col justify-end overflow-hidden bg-gradient-to-br from-primary-700 to-primary-800 p-5 text-white lg:flex"
                >
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.05)_10px,transparent_10px,transparent_20px)]" />
                  <div className="relative">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[#6ee7b7]">
                      <Percent className="h-[13px] w-[13px]" />
                      NET FİYAT
                    </span>
                    <div className="mt-[9px] text-[16px] font-bold leading-[1.25]">İndirimli ürünlerde fırsatlar</div>
                    <div className="mt-[11px] inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
                      Keşfet
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      {/* ── MOBİL MENÜ ───────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-b border-[var(--line)] bg-white lg:hidden">
          {/* Alt gezinme sekme cubugu (~56px + safe-area) kadar ekstra bosluk: son ogeler gizlenmesin */}
          <div className="space-y-1 px-4 py-4 pb-[calc(72px+env(safe-area-inset-bottom))]">
            <div className="mb-2 px-1">
              <p className="truncate text-sm font-semibold text-[var(--ink-1)]">{user?.name}</p>
              <p className="truncate text-xs text-[var(--ink-3)]">{user?.email}</p>
              {user?.mikroCariCode && <p className="mt-0.5 font-mono text-[11px] text-[var(--ink-3)]">Kod: {user.mikroCariCode}</p>}
            </div>
            {[
              { name: 'Ana Sayfa', href: '/home', icon: LayoutGrid },
              { name: 'Tüm Ürünler', href: '/products', icon: Package },
              ...(agreementsAvailable ? [{ name: 'Anlaşmalı Ürünler', href: '/agreements', icon: Tag }] : []),
              { name: 'İndirimli Ürünler', href: '/discounted-products', icon: Percent },
              { name: 'Daha Önce Aldıklarım', href: '/previously-purchased', icon: Clock },
              { name: 'Sepetim', href: '/cart', icon: ShoppingCart },
              ...accountLinks,
              { name: 'Profilim', href: '/profile', icon: User },
              { name: 'Tercihlerim', href: '/preferences', icon: Settings },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href) ? 'bg-primary-50 text-primary-700' : 'text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
                }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span className="min-w-0 truncate">{item.name}</span>
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span>Çıkış Yap</span>
            </button>
          </div>
        </div>
      )}

      {/* ── MOBİL KATEGORİ PANELİ (mega menünün mobil karşılığı) ──── */}
      <MobileCategoryPanel
        open={mobileCategoriesOpen}
        onClose={() => setMobileCategoriesOpen(false)}
        roots={roots}
        childrenById={childrenById}
        nodesById={nodesById}
        onNavigateCategory={goToCategory}
        onNavigateAllProducts={goToAllProducts}
      />

      {/* ── MOBİL ALT SEKME ÇUBUĞU ───────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-[var(--line)] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Mobil gezinme"
      >
        <Link
          href="/home"
          onClick={() => { setMobileMenuOpen(false); setMobileCategoriesOpen(false); }}
          className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-semibold transition-colors ${
            isActive('/home') ? 'text-primary-600' : 'text-[var(--ink-3)]'
          }`}
        >
          <LayoutGrid className={`h-5 w-5 ${isActive('/home') ? 'stroke-[2.4]' : ''}`} />
          <span>Anasayfa</span>
        </Link>

        <button
          type="button"
          onClick={openMobileCategories}
          className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-semibold transition-colors ${
            mobileCategoriesOpen ? 'text-primary-600' : 'text-[var(--ink-3)]'
          }`}
          aria-label="Kategoriler"
          aria-expanded={mobileCategoriesOpen}
        >
          <Package className={`h-5 w-5 ${mobileCategoriesOpen ? 'stroke-[2.4]' : ''}`} />
          <span>Kategoriler</span>
        </button>

        <Link
          href="/cart"
          onClick={() => { setMobileMenuOpen(false); setMobileCategoriesOpen(false); }}
          className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-semibold transition-colors ${
            isActive('/cart') ? 'text-primary-600' : 'text-[var(--ink-3)]'
          }`}
        >
          <span className="relative flex">
            <ShoppingCart className={`h-5 w-5 ${isActive('/cart') ? 'stroke-[2.4]' : ''}`} />
            {cartCount > 0 && (
              <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9.5px] font-bold text-white ring-2 ring-white">
                {cartCount}
              </span>
            )}
          </span>
          <span>Sepet</span>
        </Link>

        <button
          type="button"
          onClick={openMobileMenu}
          className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-semibold transition-colors ${
            mobileMenuOpen ? 'text-primary-600' : 'text-[var(--ink-3)]'
          }`}
          aria-label="Hesabım ve menü"
          aria-expanded={mobileMenuOpen}
        >
          <User className={`h-5 w-5 ${mobileMenuOpen ? 'stroke-[2.4]' : ''}`} />
          <span>Hesabım</span>
        </button>
      </nav>
    </header>
  );
}
