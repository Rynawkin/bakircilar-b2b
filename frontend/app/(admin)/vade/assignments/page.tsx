'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Customer, VadeAssignment } from '@/types';

type StaffUser = {
  id: string;
  name: string;
  email?: string;
  role: string;
};

export default function VadeAssignmentsPage() {
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
    const lower = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (selectedSector !== 'all' && customer.sectorCode !== selectedSector) {
        return false;
      }
      if (!lower) return true;
      const haystack = `${customer.name} ${customer.mikroCariCode ?? ''}`.toLowerCase();
      return haystack.includes(lower);
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

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Vade Atamalari</h1>
          <p className="text-sm text-muted-foreground">Personel bazli cari atamalari.</p>
        </div>

        <Card className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Personel</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={selectedStaffId}
                onChange={(event) => setSelectedStaffId(event.target.value)}
              >
                <option value="">Personel secin</option>
                {staff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Sektor</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={selectedSector}
                onChange={(event) => setSelectedSector(event.target.value)}
              >
                {sectors.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector === 'all' ? 'Tum sektorler' : sector}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Arama</label>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kodu veya unvan" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleAssign} disabled={saving || loading}>
              {saving ? 'Kaydediliyor...' : 'Secilenleri Ata'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelectedCustomerIds(new Set(visibleCustomers.map((customer) => customer.id)))}
              disabled={loading}
            >
              Tumunu Sec
            </Button>
            <Button variant="outline" onClick={() => setSelectedCustomerIds(new Set())} disabled={loading}>
              Temizle
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          {loading && <div className="text-sm text-muted-foreground">Yukleniyor...</div>}
          {!loading && visibleCustomers.length === 0 && (
            <div className="text-sm text-muted-foreground">Cari bulunamadi.</div>
          )}
          {!loading && visibleCustomers.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {visibleCustomers.map((customer) => (
                <label
                  key={customer.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.has(customer.id)}
                    onChange={() => toggleCustomer(customer.id)}
                  />
                  <div>
                    <div className="font-medium">{customer.name}</div>
                    <div className="text-xs text-muted-foreground">{customer.mikroCariCode}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Mevcut Atamalar</div>
          {assignments.length === 0 && (
            <div className="text-sm text-muted-foreground">Atama bulunamadi.</div>
          )}
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{assignment.customer?.name || 'Cari'}</div>
                <div className="text-xs text-muted-foreground">{assignment.customer?.mikroCariCode}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleRemove(assignment)}>
                Kaldir
              </Button>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
