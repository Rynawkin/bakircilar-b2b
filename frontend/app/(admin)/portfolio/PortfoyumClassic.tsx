'use client';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { usePortfoyum } from './usePortfoyum';

/**
 * Klasik gorunum Musteri Portfoyum.
 * Mevcut page.tsx JSX'i BIRE BIR korunmustur; tum mantik usePortfoyum'dan gelir.
 */
export default function PortfoyumClassic() {
  const {
    isLoading,
    searchTerm,
    setSearchTerm,
    filterActive,
    setFilterActive,
    counts,
    filteredCustomers,
  } = usePortfoyum();

  return (
    <div className="container-custom py-6 space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Musteri Portfoyum</h1>
            <p className="text-sm text-gray-600">Atanan musterilerinizi tek ekranda takip edin.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-lg">
              Toplam: <strong>{counts.total}</strong>
            </div>
            <div className="bg-green-100 text-green-700 text-sm px-3 py-1.5 rounded-lg">
              Aktif: <strong>{counts.active}</strong>
            </div>
            <div className="bg-red-100 text-red-700 text-sm px-3 py-1.5 rounded-lg">
              Pasif: <strong>{counts.inactive}</strong>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Input
              placeholder="Cari kodu, isim, sehir, telefon..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            {[
              { key: 'all', label: 'Hepsi' },
              { key: 'active', label: 'Aktif' },
              { key: 'inactive', label: 'Pasif' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilterActive(option.key as 'all' | 'active' | 'inactive')}
                className={`px-4 py-2 text-xs font-semibold rounded-full border transition-all ${
                  filterActive === option.key
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-6 text-sm text-gray-500">Yukleniyor...</Card>
      ) : filteredCustomers.length === 0 ? (
        <Card className="p-6 text-sm text-gray-500">Kayit bulunamadi.</Card>
      ) : (
        <div className="grid gap-4">
          {filteredCustomers.map((customer) => (
            <div key={customer.id} className="relative">
              <CustomerInfoCard
                customer={{
                  name: customer.name,
                  email: customer.email,
                  mikroCariCode: customer.mikroCariCode,
                  customerType: customer.customerType,
                  city: customer.city,
                  district: customer.district,
                  phone: customer.phone,
                  groupCode: customer.groupCode,
                  sectorCode: customer.sectorCode,
                  paymentTerm: customer.paymentTerm,
                  paymentPlanNo: customer.paymentPlanNo,
                  paymentPlanCode: customer.paymentPlanCode,
                  paymentPlanName: customer.paymentPlanName,
                  hasEInvoice: customer.hasEInvoice,
                  balance: customer.balance,
                  isLocked: customer.isLocked,
                }}
                compact
              />
              <div className="absolute top-3 right-3">
                <Badge variant={customer.active ? 'success' : 'danger'}>
                  {customer.active ? 'Aktif' : 'Pasif'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
