'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Customer, VadeAssignment } from '@/types';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { Customer, VadeAssignment } from '@/types';

export type StaffUser = {
  id: string;
  name: string;
  email?: string;
  role: string;
};

/**
 * Vade Atamalari ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useVadeAtamalari() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignments, setAssignments] = useState<VadeAssignment[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [staffResponse, customersResponse] = await Promise.all([
          adminApi.getStaffMembers(),
          adminApi.getCustomers(),
        ]);
        setStaff(staffResponse.staff || []);
        setCustomers(customersResponse.customers || []);
      } catch (error) {
        console.error('Assignments load error:', error);
        toast.error('Veriler yuklenemedi');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    const loadAssignments = async () => {
      if (!selectedStaffId) {
        setAssignments([]);
        return;
      }
      try {
        const response = await adminApi.getVadeAssignments({ staffId: selectedStaffId });
        setAssignments(response.assignments || []);
      } catch (error) {
        console.error('Assignments load error:', error);
        toast.error('Atamalar yuklenemedi');
      }
    };
    loadAssignments();
  }, [selectedStaffId]);

  const sectors = useMemo(() => {
    const unique = new Set<string>();
    customers.forEach((customer) => {
      if (customer.sectorCode) unique.add(customer.sectorCode);
    });
    return ['all', ...Array.from(unique).sort()];
  }, [customers]);

  const visibleCustomers = useMemo(() => {
    const tokens = buildSearchTokens(search);
    return customers.filter((customer) => {
      if (selectedSector !== 'all' && customer.sectorCode !== selectedSector) {
        return false;
      }
      if (tokens.length === 0) return true;
      const haystack = normalizeSearchText(`${customer.name} ${customer.mikroCariCode ?? ''} ${customer.sectorCode ?? ''}`);
      return matchesSearchTokens(haystack, tokens);
    });
  }, [customers, selectedSector, search]);

  const toggleCustomer = (customerId: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  };

  const handleAssign = async () => {
    if (!selectedStaffId) {
      toast.error('Personel secin');
      return;
    }
    if (selectedCustomerIds.size === 0) {
      toast.error('Cari secin');
      return;
    }
    setSaving(true);
    try {
      await adminApi.assignVadeCustomers({
        staffId: selectedStaffId,
        customerIds: Array.from(selectedCustomerIds),
      });
      toast.success('Atamalar kaydedildi');
      setSelectedCustomerIds(new Set());
      const response = await adminApi.getVadeAssignments({ staffId: selectedStaffId });
      setAssignments(response.assignments || []);
    } catch (error) {
      console.error('Assign error:', error);
      toast.error('Atama kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (assignment: VadeAssignment) => {
    if (!assignment.staffId || !assignment.customerId) return;
    try {
      await adminApi.removeVadeAssignment({ staffId: assignment.staffId, customerId: assignment.customerId });
      setAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
    } catch (error) {
      console.error('Assignment remove error:', error);
      toast.error('Atama kaldirilamadi');
    }
  };

  return {
    // state
    staff,
    customers,
    assignments,
    selectedStaffId,
    setSelectedStaffId,
    selectedSector,
    setSelectedSector,
    search,
    setSearch,
    selectedCustomerIds,
    setSelectedCustomerIds,
    loading,
    saving,
    // turetilmis
    sectors,
    visibleCustomers,
    // handlerlar
    toggleCustomer,
    handleAssign,
    handleRemove,
  };
}

export default useVadeAtamalari;
