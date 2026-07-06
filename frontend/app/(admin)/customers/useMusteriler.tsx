'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Customer, CreateCustomerRequest } from '@/types';
import adminApi, { PaginationMeta } from '@/lib/api/admin';
import { CUSTOMER_TYPES, getCustomerTypeName } from '@/lib/utils/customerTypes';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

// Sunucu-tarafli sayfalama: sabit sayfa boyutu
const PAGE_SIZE = 25;

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { Customer, CreateCustomerRequest } from '@/types';

export interface MikroCari {
  code: string;
  name: string;
  city?: string;
  district?: string;
  phone?: string;
  isLocked: boolean;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  paymentPlanNo?: number | null;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
  hasEInvoice: boolean;
  balance: number;
}

export const getPaymentPlanLabel = (cari: {
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
  paymentTerm?: number | null;
}) => {
  if (cari.paymentPlanName || cari.paymentPlanCode) {
    return [cari.paymentPlanCode, cari.paymentPlanName].filter(Boolean).join(' - ');
  }
  if (cari.paymentTerm !== undefined && cari.paymentTerm !== null) {
    return `${cari.paymentTerm} gun`;
  }
  return '-';
};

// Düzenle modalindan gelen kaydetme tipi (Classic/New ortak kullanir)
export type EditCustomerData = {
  email?: string;
  customerType?: string;
  active?: boolean;
  invoicedPriceListNo?: number | null;
  whitePriceListNo?: number | null;
  priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  useLastPrices?: boolean;
  lastPriceGuardType?: 'COST' | 'PRICE_LIST';
  lastPriceCostBasis?: 'CURRENT_COST' | 'LAST_ENTRY';
  lastPriceMinCostPercent?: number;
};

/**
 * Musteriler ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useMusteriler() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cariList, setCariList] = useState<MikroCari[]>([]);
  const [showForm, setShowForm] = useState(false);
  // isLoading: ilk yukleme (tum ekran spinner). isFetching: sonraki refetch'ler (liste ici gosterge).
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [showCariModal, setShowCariModal] = useState(false);
  const [selectedCari, setSelectedCari] = useState<MikroCari | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // 350ms debounce uygulanmis arama (sunucuya bu deger gonderilir)
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  // Sunucu-tarafli sayfalama state'i
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [showBulkCreateModal, setShowBulkCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateCustomerRequest>({
    email: '',
    password: '',
    name: '',
    customerType: 'PERAKENDE',
    mikroCariCode: '',
    priceVisibility: 'INVOICED_ONLY',
  });

  useEffect(() => {
    loadUserFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yetki kontrolu + Mikro cari listesini (yeni musteri modali icin) bir kez yukle.
  // B2B musteri listesi artik ayri (sunucu-sayfali) effect ile cekilir.
  const accessChecked = useRef(false);
  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:customers')) {
      router.push('/dashboard');
      return;
    }
    if (accessChecked.current) return;
    accessChecked.current = true;
    fetchCariList();
  }, [user, permissionsLoading, router, hasPermission]);

  // Arama icin 350ms debounce: searchTerm -> debouncedSearch
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  // Arama (debounced) veya aktiflik filtresi degisince ilk sayfaya don.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterActive]);

  // Sunucu-tarafli liste cekme: page / debouncedSearch / filterActive degisince refetch.
  // Yetki/oturum hazir olmadan sorgu atilmaz.
  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:customers')) return;
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, permissionsLoading, page, debouncedSearch, filterActive]);

  const fetchCustomers = async () => {
    // Ilk yuklemede tum-ekran spinner; sonraki cekislerde sadece liste-ici gosterge.
    if (hasLoadedOnce.current) {
      setIsFetching(true);
    } else {
      setIsLoading(true);
    }
    try {
      const { customers, pagination } = await adminApi.getCustomers({
        active: filterActive,
        search: debouncedSearch,
        page,
        pageSize: PAGE_SIZE,
      });
      setCustomers(customers);
      setPagination(pagination ?? null);
    } finally {
      hasLoadedOnce.current = true;
      setIsLoading(false);
      setIsFetching(false);
    }
  };

  const fetchCariList = async () => {
    try {
      const { cariList } = await adminApi.getCariList();
      setCariList(cariList);
    } catch (error) {
      console.error('Cari listesi yüklenemedi:', error);
    }
  };

  const handleCariSelect = (cari: MikroCari) => {
    const code = String(cari.code || '').trim();
    setSelectedCari(cari);
    setFormData({
      ...formData,
      email: formData.email || code,
      password: formData.password || `${code}123`,
      mikroCariCode: cari.code,
      name: formData.name || cari.name,
    });
    setShowCariModal(false);
  };

  // Liste artik tamamen sunucu-tarafli filtrelenip sayfalandigi icin
  // client-side filtre/arama yapilmaz. Gosterilen liste dogrudan sunucu `customers`.
  // (Geriye-uyumluluk icin filteredCustomers, customers'a esitlenir.)
  const filteredCustomers = customers;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createCustomer({ ...formData, email: formData.email.trim() });
      toast.success('Müşteri başarıyla oluşturuldu! ✅');
      setShowForm(false);
      setFormData({
        email: '',
        password: '',
        name: '',
        customerType: 'PERAKENDE',
        mikroCariCode: '',
        priceVisibility: 'INVOICED_ONLY',
      });
      setSelectedCari(null);
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Müşteri oluşturulamadı');
    }
  };

  const handleEditCustomer = async (customerId: string, data: EditCustomerData) => {
    try {
      await adminApi.updateCustomer(customerId, data);
      toast.success('Müşteri başarıyla güncellendi! ✅');
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Müşteri güncellenemedi');
      throw error;
    }
  };

  const openEditModal = (customer: Customer) => {
    setCustomerToEdit(customer);
    setShowEditModal(true);
  };

  // "+ Yeni Musteri" / "Iptal" toggle mantigi (form acma/kapama + reset)
  const toggleForm = () => {
    if (showForm) {
      // Closing form - reset everything
      setShowForm(false);
      setFormData({
        email: '',
        password: '',
        name: '',
        customerType: 'PERAKENDE',
        mikroCariCode: '',
        priceVisibility: 'INVOICED_ONLY',
      });
      setSelectedCari(null);
    } else {
      // Opening form
      setShowForm(true);
    }
  };

  const canOpenCustomer = hasPermission('admin:customers');
  const canEditCustomer = hasPermission('admin:customers');
  const canBulkCreate = hasPermission('admin:staff');

  // Sunucu-sayfalama navigasyonu (sahte sayi gosterilmez; sunucu pagination meta'sina dayanir)
  const total = pagination?.total ?? customers.length;
  const totalPages = pagination?.totalPages ?? 1;
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => (totalPages ? Math.min(totalPages, p + 1) : p + 1));

  return {
    // router / user / permissions
    router,
    user,
    hasPermission,
    permissionsLoading,
    // data
    customers,
    cariList,
    filteredCustomers,
    isLoading,
    isFetching,
    // yeni musteri formu
    showForm,
    setShowForm,
    toggleForm,
    formData,
    setFormData,
    selectedCari,
    setSelectedCari,
    handleSubmit,
    // mikro cari secim modal
    showCariModal,
    setShowCariModal,
    handleCariSelect,
    // arama / filtre
    searchTerm,
    setSearchTerm,
    filterActive,
    setFilterActive,
    // sunucu-tarafli sayfalama
    page,
    setPage,
    pagination,
    total,
    totalPages,
    goPrev,
    goNext,
    // duzenleme modal
    showEditModal,
    setShowEditModal,
    customerToEdit,
    openEditModal,
    handleEditCustomer,
    // toplu kullanici modal
    showBulkCreateModal,
    setShowBulkCreateModal,
    // izinler
    canOpenCustomer,
    canEditCustomer,
    canBulkCreate,
    // refresh
    fetchCustomers,
    // helpers / sabitler
    getPaymentPlanLabel,
    getCustomerTypeName,
    CUSTOMER_TYPES,
  };
}

export default useMusteriler;
