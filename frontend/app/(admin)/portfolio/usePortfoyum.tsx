'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Customer } from '@/types';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * Musteri Portfoyum ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */

export type { Customer };

export type PortfolioFilter = 'all' | 'active' | 'inactive';

export function usePortfoyum() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<PortfolioFilter>('all');

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
  }, [user, permissionsLoading, hasPermission, router]);

  const fetchCustomers = async () => {
    try {
      const { customers: result } = await adminApi.getCustomers();
      setCustomers(result);
    } finally {
      setIsLoading(false);
    }
  };

  const counts = useMemo(() => {
    const activeCount = customers.filter((customer) => customer.active).length;
    return {
      total: customers.length,
      active: activeCount,
      inactive: customers.length - activeCount,
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const tokens = buildSearchTokens(searchTerm);
    return customers.filter((customer) => {
      if (filterActive === 'active' && !customer.active) return false;
      if (filterActive === 'inactive' && customer.active) return false;
      if (tokens.length === 0) return true;
      const haystack = normalizeSearchText([
        customer.name,
        customer.mikroCariCode,
        customer.email,
        customer.city,
        customer.district,
        customer.phone,
        customer.sectorCode,
        customer.groupCode,
        customer.paymentPlanCode,
        customer.paymentPlanName,
      ].filter(Boolean).join(' '));
      return matchesSearchTokens(haystack, tokens);
    });
  }, [customers, searchTerm, filterActive]);

  return {
    customers,
    isLoading,
    searchTerm,
    setSearchTerm,
    filterActive,
    setFilterActive,
    counts,
    filteredCustomers,
  };
}

export default usePortfoyum;
