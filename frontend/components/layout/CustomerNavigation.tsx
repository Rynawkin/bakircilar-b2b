'use client';

import { useState, Fragment, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, Transition } from '@headlessui/react';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import customerApi, { CustomerFinancials } from '@/lib/api/customer';
import { formatDateShort, formatCurrency } from '@/lib/utils/format';
import { buildCategoryTree, getCategoryPath } from '@/lib/utils/categoryTree';
import { normalizeSearchText } from '@/lib/utils/search';
import { Notification, Category } from '@/types';
import {
  Search,
  LayoutGrid,
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
  ChevronRight,
  Menu as MenuIcon,
  X,
} from 'lucide-react';

const ACCOUNT_LINKS = (pendingRequestCount: number, isSubUser: boolean) => [
  { name: 'Siparişlerim', href: '/my-orders', icon: Package },
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
  const [megaOpen, setMegaOpen] = useState(false);
  const [megaRootId, setMegaRootId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [agreementsAvailable, setAgreementsAvailable] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [financials, setFinancials] = useState<CustomerFinancials | null>(null);

  const isSubUser = Boolean(user?.parentCustomerId);
  const cartCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? cartItemCount;
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
      {/* ── ÜST BAR ──────────────────────────────────────────────── */}
      <div className="border-b border-[var(--line)]">
        <div className="mx-auto flex h-16 w-full max-w-[1900px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:gap-4 lg:px-8">
          {/* Logo */}
          <Link href="/home" className="flex flex-shrink-0 items-center gap-2.5">
            <span className="flex h-10 items-center justify-center rounded-lg bg-primary-600 px-2.5 sm:px-3">
              <img src="/logo.png" alt="Bakırcılar" className="h-[22px] w-auto object-contain" />
            </span>
            <span className="mt-0.5 hidden text-[9px] font-medium tracking-[0.17em] text-[var(--ink-3)] xl:block">
              TOPTAN SİPARİŞ PORTALI
            </span>
          </Link>

          {/* Arama */}
          <div className="relative flex h-10 min-w-0 flex-1 items-center">
            <form onSubmit={handleSearch} className="flex h-10 w-full items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-3">
              <Search className="h-4 w-4 flex-shrink-0 text-[var(--ink-3)]" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Ürün adı, Mikro kodu veya marka ara…"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)]"
              />
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

          {/* Bakiye / Vadesi gecen */}
          {financials && (
            <div className="hidden flex-shrink-0 items-center gap-3 rounded-xl border border-[var(--line)] px-3.5 py-1.5 xl:flex">
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-medium text-[var(--ink-3)]">Bakiye</span>
                <span className="text-[13px] font-semibold text-[var(--ink-1)]">{formatCurrency(financials.totalBalance)}</span>
              </div>
              {financials.pastDueBalance > 0 && (
                <>
                  <span className="h-6 w-px bg-[var(--line)]" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] font-medium text-[var(--ink-3)]">Vadesi geçen</span>
                    <span className="text-[13px] font-semibold text-amber-700">{formatCurrency(financials.pastDueBalance)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bildirim */}
          <Menu as="div" className="relative flex-shrink-0">
            <Menu.Button
              onClick={fetchNotifications}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
              aria-label="Bildirimler"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
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
                  <button className="text-xs font-medium text-primary-600 hover:text-primary-700" onClick={handleMarkAllRead} type="button">
                    Tümünü okundu yap
                  </button>
                </div>
                <div className="max-h-80 space-y-1.5 overflow-auto p-2">
                  {notificationLoading && <div className="px-2 py-3 text-xs text-[var(--ink-3)]">Yükleniyor…</div>}
                  {!notificationLoading && notifications.length === 0 && (
                    <div className="px-2 py-6 text-center text-xs text-[var(--ink-3)]">Bildiriminiz bulunmuyor.</div>
                  )}
                  {!notificationLoading &&
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          notification.isRead
                            ? 'border-transparent text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
                            : 'border-primary-100 bg-primary-50 text-[var(--ink-1)] hover:bg-primary-100/70'
                        }`}
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
                    ))}
                </div>
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Hesap menüsü */}
          <Menu as="div" className="relative hidden flex-shrink-0 md:block">
            <Menu.Button className="flex items-center gap-2 rounded-xl border border-[var(--line)] py-1 pl-1 pr-2.5 transition-colors hover:bg-[var(--surface-0)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-[12.5px] font-semibold text-primary-600">
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

          {/* Sepet */}
          <Link
            href="/cart"
            className="flex h-10 flex-shrink-0 items-center gap-2.5 rounded-xl bg-primary-600 px-2.5 text-white transition-colors hover:bg-primary-700 sm:px-3.5"
          >
            <span className="relative flex">
              <ShoppingCart className="h-[18px] w-[18px]" />
              {cartCount > 0 && (
                <span className="absolute -right-2.5 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary-600">
                  {cartCount}
                </span>
              )}
            </span>
            <span className="hidden flex-col items-start leading-tight sm:flex">
              <span className="text-[10px] font-medium text-primary-100">Sepet</span>
              <span className="text-[13px] font-semibold">{formatCurrency(cartTotal)}</span>
            </span>
          </Link>

          {/* Mobil menü butonu */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--ink-2)] lg:hidden"
            aria-label="Menü"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── KATEGORİ / GEZİNME SATIRI ────────────────────────────── */}
      <div className="relative hidden border-b border-[var(--line)] md:block" onMouseLeave={() => setMegaOpen(false)}>
        <div className="mx-auto flex h-12 w-full max-w-[1900px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-0.5 whitespace-nowrap">
            <button
              type="button"
              onMouseEnter={() => setMegaOpen(true)}
              onClick={() => router.push('/products')}
              className="flex h-12 items-center gap-2 px-3 text-[13.5px] font-semibold text-primary-600"
            >
              <LayoutGrid className="h-4 w-4" />
              Tüm Kategoriler
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <Link href="/products" className="flex h-12 items-center px-3 text-[13.5px] font-semibold text-primary-600 hover:text-primary-700">
              Tüm Ürünler
            </Link>
          </nav>

          <div className="flex items-center">
            {rightLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex h-12 items-center gap-1.5 px-3 text-[13px] font-medium transition-colors ${
                  link.accent ? 'text-emerald-700 hover:text-emerald-800' : 'text-[var(--ink-2)] hover:text-primary-600'
                } ${isActive(link.href) ? 'underline decoration-2 underline-offset-[14px]' : ''}`}
              >
                <link.icon className="h-4 w-4" />
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
          <div className="absolute inset-x-0 top-12 z-40 border-b border-[var(--line)] bg-white shadow-[0_18px_36px_rgba(20,34,59,0.12)]">
            <div className="mx-auto w-full max-w-[1900px] px-4 py-5 sm:px-6 lg:px-8">
              <div className="w-full max-w-[1180px]">
              <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-[var(--line)] md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[262px_minmax(0,1fr)_230px]">
                {/* Sol — ANA kategoriler */}
                <div className="max-h-[460px] overflow-y-auto border-b border-[var(--line)] bg-[var(--surface-0)] py-2 md:border-b-0 md:border-r">
                  {roots.map((root) => {
                    const active = root.id === megaActiveRootId;
                    return (
                      <button
                        key={root.id}
                        type="button"
                        onMouseEnter={() => setMegaRootId(root.id)}
                        onClick={() => { setMegaOpen(false); router.push(`/products?categoryId=${root.id}`); }}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[13px] transition-colors ${
                          active ? 'bg-white font-semibold text-primary-700' : 'text-[var(--ink-2)] hover:bg-white hover:text-[var(--ink-1)]'
                        }`}
                      >
                        <span className="min-w-0 truncate">{root.name}</span>
                        <ChevronRight className={`h-4 w-4 shrink-0 ${active ? 'text-primary-600' : 'text-[var(--ink-3)]'}`} />
                      </button>
                    );
                  })}
                </div>

                {/* Sag — secili ananin ALT + EN-ALT'lari (cok kolon, genislige yayilir) */}
                <div className="max-h-[460px] overflow-y-auto p-5">
                  {megaActiveRoot && (
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2">
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
                    <div className="columns-1 [column-gap:1.75rem] sm:columns-2 lg:columns-3">
                      {megaAlts.map((alt) => {
                        const leaves = (childrenById.get(alt.id) || [])
                          .map((id) => nodesById.get(id))
                          .filter((c): c is Category => Boolean(c));
                        return (
                          <div key={alt.id} className="mb-4 break-inside-avoid">
                            <Link
                              href={`/products?categoryId=${alt.id}`}
                              onClick={() => setMegaOpen(false)}
                              className="block truncate text-[12.5px] font-semibold text-[var(--ink-1)] transition-colors hover:text-primary-700"
                            >
                              {alt.name}
                            </Link>
                            {leaves.length > 0 && (
                              <div className="mt-1 flex flex-col gap-0.5">
                                {leaves.map((leaf) => (
                                  <Link
                                    key={leaf.id}
                                    href={`/products?categoryId=${leaf.id}`}
                                    onClick={() => setMegaOpen(false)}
                                    className="truncate text-[12px] text-[var(--ink-2)] transition-colors hover:text-primary-700"
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

                {/* Sag — promo kart (Vitrin: lacivert gradient, net fiyat) */}
                <Link
                  href="/discounted-products"
                  onClick={() => setMegaOpen(false)}
                  className="relative m-4 hidden flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br from-primary-700 to-primary-800 p-4 text-white transition-transform hover:-translate-y-0.5 lg:flex"
                >
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.05)_10px,transparent_10px,transparent_20px)]" />
                  <div className="relative">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                      <Percent className="h-3.5 w-3.5" />
                      NET FİYAT
                    </span>
                    <div className="mt-2 text-[17px] font-extrabold leading-tight">İndirimli ürünlerde fırsatlar</div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
                      Keşfet
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      {/* ── MOBİL MENÜ ───────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-[var(--line)] bg-white lg:hidden">
          <div className="space-y-1 px-4 py-4">
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

      {/* ── MOBİL ALT SEKME ÇUBUĞU ───────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-[var(--line)] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Mobil gezinme"
      >
        <Link
          href="/home"
          onClick={() => setMobileMenuOpen(false)}
          className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-semibold transition-colors ${
            isActive('/home') ? 'text-primary-600' : 'text-[var(--ink-3)]'
          }`}
        >
          <LayoutGrid className={`h-5 w-5 ${isActive('/home') ? 'stroke-[2.4]' : ''}`} />
          <span>Anasayfa</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-semibold transition-colors ${
            mobileMenuOpen ? 'text-primary-600' : 'text-[var(--ink-3)]'
          }`}
          aria-label="Kategoriler ve menü"
          aria-expanded={mobileMenuOpen}
        >
          <Package className={`h-5 w-5 ${mobileMenuOpen ? 'stroke-[2.4]' : ''}`} />
          <span>Kategoriler</span>
        </button>

        <Link
          href="/cart"
          onClick={() => setMobileMenuOpen(false)}
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
          onClick={() => setMobileMenuOpen((prev) => !prev)}
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
