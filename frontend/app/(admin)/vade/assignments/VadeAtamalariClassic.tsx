'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useVadeAtamalari } from './useVadeAtamalari';

/**
 * Klasik gorunum Vade Atamalari ekrani. Mevcut TUM mantik useVadeAtamalari'ndan gelir;
 * JSX, eski page.tsx ile BIRE BIR aynidir. Hicbir oge degistirilmemistir.
 */
export default function VadeAtamalariClassic() {
  const {
    staff,
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
    sectors,
    visibleCustomers,
    toggleCustomer,
    handleAssign,
    handleRemove,
  } = useVadeAtamalari();

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
