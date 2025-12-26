import { Badge } from './Badge';
import { formatCurrency } from '@/lib/utils/format';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';

interface CustomerInfo {
  name: string;
  email?: string;
  mikroCariCode: string;
  customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  city?: string;
  district?: string;
  phone?: string;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  hasEInvoice?: boolean;
  balance?: number;
  isLocked?: boolean;
}

interface CustomerInfoCardProps {
  customer: CustomerInfo;
  compact?: boolean;
}

const getCustomerTypeBadge = (type?: string) => {
  if (!type) return null;

  const badges: Record<string, { variant: 'success' | 'warning' | 'info' | 'default' }> = {
    BAYI: { variant: 'info' },
    PERAKENDE: { variant: 'default' },
    VIP: { variant: 'success' },
    OZEL: { variant: 'warning' },
  };

  const badgeInfo = badges[type] || { variant: 'info' as const };
  return <Badge variant={badgeInfo.variant}>{getCustomerTypeName(type)}</Badge>;
};

export function CustomerInfoCard({ customer, compact = false }: CustomerInfoCardProps) {
  if (compact) {
    return (
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <strong>{customer.name}</strong>
          {customer.customerType && getCustomerTypeBadge(customer.customerType)}
          {customer.isLocked && <Badge variant="danger">Kilitli</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
          <div>
            <span className="font-medium">Mikro Cari:</span> {customer.mikroCariCode}
          </div>
          {customer.city && (
            <div>
              <span className="font-medium">Sehir:</span> {customer.city}
              {customer.district && ` / ${customer.district}`}
            </div>
          )}
          {customer.phone && (
            <div>
              <span className="font-medium">Telefon:</span> {customer.phone}
            </div>
          )}
          {customer.paymentTerm !== undefined && customer.paymentTerm !== null && (
            <div>
              <span className="font-medium">Vade:</span> {customer.paymentTerm} gun
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-bold text-lg text-gray-900">{customer.name}</h4>
          {customer.email && <p className="text-sm text-gray-600">{customer.email}</p>}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {customer.customerType && getCustomerTypeBadge(customer.customerType)}
          {customer.hasEInvoice && <Badge variant="success">E-Fatura</Badge>}
          {customer.isLocked && <Badge variant="danger">Kilitli</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <div className="bg-white rounded p-3 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">Mikro Cari Kodu</p>
          <p className="font-semibold text-primary-700">{customer.mikroCariCode}</p>
        </div>

        {customer.city && (
          <div className="bg-white rounded p-3 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">Sehir / Ilce</p>
            <p className="font-semibold text-gray-900">
              {customer.city}
              {customer.district && ` / ${customer.district}`}
            </p>
          </div>
        )}

        {customer.phone && (
          <div className="bg-white rounded p-3 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">Telefon</p>
            <p className="font-semibold text-gray-900">{customer.phone}</p>
          </div>
        )}

        {customer.paymentTerm !== undefined && customer.paymentTerm !== null && (
          <div className="bg-white rounded p-3 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">Vade (Gun)</p>
            <p className="font-semibold text-gray-900">{customer.paymentTerm} gun</p>
          </div>
        )}

        {customer.balance !== undefined && customer.balance !== null && (
          <div className="bg-white rounded p-3 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">Guncel Bakiye</p>
            <p className={`font-semibold ${customer.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(customer.balance)}
            </p>
          </div>
        )}

        {customer.groupCode && (
          <div className="bg-white rounded p-3 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">Grup Kodu</p>
            <p className="font-semibold text-gray-900">{customer.groupCode}</p>
          </div>
        )}

        {customer.sectorCode && (
          <div className="bg-white rounded p-3 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">Sektor Kodu</p>
            <p className="font-semibold text-gray-900">{customer.sectorCode}</p>
          </div>
        )}
      </div>
    </div>
  );
}
