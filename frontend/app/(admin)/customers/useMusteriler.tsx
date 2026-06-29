'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Customer, CreateCustomerRequest } from '@/types';
import adminApi from '@/lib/api/admin';
import { CUSTOMER_TYPES, getCustomerTypeName } from '@/lib/utils/customerTypes';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

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
  const [isLoading, setIsLoading] = useState(true);
  const [showCariModal, setShowCariModal] = useState(false);
  const [selectedCari, setSelectedCari] = useState<MikroCari | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
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

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:customers')) {
      router.push('/dashboard');
      return;
    }

    fetchCustomers();
    fetchCariList();
  }, [user, permissionsLoading, router, hasPermission]);

  const fetchCustomers = async () => {
    try {
      const { customers } = await adminApi.getCustomers();
      setCustomers(customers);
    } finally {
      setIsLoading(false);
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
    setSelectedCari(cari);
    setFormData({
      ...formData,
      mikroCariCode: cari.code,
      name: formData.name || cari.name,
    });
    setShowCariModal(false);
  };

  const filteredCustomers = useMemo(() => {
    let filtered = customers;

    // Filter by active status
    if (filterActive === 'active') {
      filtered = filtered.filter(c => c.active);
    } else if (filterActive === 'inactive') {
      filtered = filtered.filter(c => !c.active);
    }

    // Filter by search term
    const tokens = buildSearchTokens(searchTerm);
    if (tokens.length > 0) {
      filtered = filtered.filter((c) => {
        const haystack = normalizeSearchText([
          c.name,
          c.email,
          c.mikroCariCode,
          c.city,
          c.district,
          c.phone,
        ].filter(Boolean).join(' '));
        return matchesSearchTokens(haystack, tokens);
      });
    }

    return filtered;
  }, [customers, searchTerm, filterActive]);

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
