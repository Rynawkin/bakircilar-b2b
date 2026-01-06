'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Customer, CreateCustomerRequest } from '@/types';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { LogoLink } from '@/components/ui/Logo';
import { formatDateShort, formatCurrency } from '@/lib/utils/format';
import { CUSTOMER_TYPES, getCustomerTypeName } from '@/lib/utils/customerTypes';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { CustomerEditModal } from '@/components/admin/CustomerEditModal';
import { BulkCreateUsersModal } from '@/components/admin/BulkCreateUsersModal';
import { useAuthStore } from '@/lib/store/authStore';

interface MikroCari {
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

const getPaymentPlanLabel = (cari: {
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

export default function CustomersPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
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
  });

  useEffect(() => {
    loadUserFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user === null) return;
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'HEAD_ADMIN' && user.role !== 'SALES_REP') {
      router.push('/login');
      return;
    }

    fetchCustomers();
    fetchCariList();
  }, [user, router]);

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
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(lowerSearch) ||
          c.email.toLowerCase().includes(lowerSearch) ||
          c.mikroCariCode.toLowerCase().includes(lowerSearch) ||
          c.city?.toLowerCase().includes(lowerSearch) ||
          c.district?.toLowerCase().includes(lowerSearch) ||
          c.phone?.toLowerCase().includes(lowerSearch)
      );
    }

    return filtered;
  }, [customers, searchTerm, filterActive]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createCustomer(formData);
      toast.success('Müşteri başarıyla oluşturuldu! ✅');
      setShowForm(false);
      setFormData({ email: '', password: '', name: '', customerType: 'PERAKENDE', mikroCariCode: '' });
      setSelectedCari(null);
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Müşteri oluşturulamadı');
    }
  };

  const handleEditCustomer = async (customerId: string, data: {
    email?: string;
    customerType?: string;
    active?: boolean;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
  }) => {
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

  const canOpenCustomer =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    user?.role === 'HEAD_ADMIN' ||
    user?.role === 'SALES_REP';
  const canEditCustomer =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    user?.role === 'HEAD_ADMIN';
  const canBulkCreate =
    user?.role === 'ADMIN' ||
    user?.role === 'HEAD_ADMIN';

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">👥 Müşteri Yönetimi</h1>
                <p className="text-sm text-primary-100">Müşteri hesapları ve bilgileri</p>
              </div>
            </div>
            <div className="flex gap-3">
              {canBulkCreate && (
                <Button
                  variant="secondary"
                  onClick={() => setShowBulkCreateModal(true)}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  👥 Toplu Kullanıcı Oluştur
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  if (showForm) {
                    // Closing form - reset everything
                    setShowForm(false);
                    setFormData({ email: '', password: '', name: '', customerType: 'PERAKENDE', mikroCariCode: '' });
                    setSelectedCari(null);
                  } else {
                    // Opening form
                    setShowForm(true);
                  }
                }}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                {showForm ? 'İptal' : '+ Yeni Müşteri'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                ← Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        {showForm && (
          <Card title="Yeni Müşteri Ekle" className="mb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Mikro Cari Seç *</label>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCariModal(true)}
                  className="w-full"
                >
                  {formData.mikroCariCode ? `${formData.mikroCariCode} - ${formData.name}` : 'Mikro\'dan Seç'}
                </Button>
                <p className="text-xs text-gray-500 mt-1">Mikro ERP'den cari seçmek için tıklayın</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Ad Soyad"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Cari seçince otomatik dolar"
                />

                <div>
                  <label className="block text-sm font-medium mb-1">Müşteri Segmenti *</label>
                  <select
                    className="input"
                    value={formData.customerType}
                    onChange={(e) => setFormData({ ...formData, customerType: e.target.value as any })}
                    required
                  >
                    {CUSTOMER_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Fiyatlandırma segmenti</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">📋 Mikro ERP Bilgileri (Otomatik Doldurulur)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Şehir"
                    value={selectedCari?.city || ''}
                    readOnly
                    disabled={!selectedCari}
                    placeholder="Cari seçilince dolar"
                  />

                  <Input
                    label="İlçe"
                    value={selectedCari?.district || ''}
                    readOnly
                    disabled={!selectedCari}
                    placeholder="Cari seçilince dolar"
                  />

                  <Input
                    label="Telefon"
                    value={selectedCari?.phone || ''}
                    readOnly
                    disabled={!selectedCari}
                    placeholder="Cari seçilince dolar"
                  />

                  <Input
                    label="Grup Kodu"
                    value={selectedCari?.groupCode || ''}
                    readOnly
                    disabled={!selectedCari}
                    placeholder="Cari seçilince dolar"
                  />

                  <Input
                    label="Sektör Kodu"
                    value={selectedCari?.sectorCode || ''}
                    readOnly
                    disabled={!selectedCari}
                    placeholder="Cari seçilince dolar"
                  />

                  <Input
                    label="Vade Planı"
                    value={selectedCari ? getPaymentPlanLabel(selectedCari) : ''}
                    readOnly
                    disabled={!selectedCari}
                    placeholder="Cari seçilince dolar"
                  />

                  <Input
                    label="Bakiye"
                    value={selectedCari ? formatCurrency(selectedCari.balance) : ''}
                    readOnly
                    disabled={!selectedCari}
                    placeholder="Cari seçilince dolar"
                    className={selectedCari && selectedCari.balance >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}
                  />

                  <div>
                    <label className="block text-sm font-medium mb-1">Durum</label>
                    <div className="flex gap-2 h-10 items-center">
                      {selectedCari ? (
                        <>
                          {selectedCari.hasEInvoice && <Badge variant="success">E-Fatura</Badge>}
                          {selectedCari.isLocked && <Badge variant="danger">Kilitli</Badge>}
                          {!selectedCari.hasEInvoice && !selectedCari.isLocked && <Badge variant="info">Normal</Badge>}
                        </>
                      ) : (
                        <span className="text-gray-400 text-sm">Cari seçilince görünür</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">🔐 Hesap Bilgileri</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="ornek@email.com"
                  />
                  <Input
                    label="Şifre"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                    placeholder="En az 6 karakter"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={!selectedCari}>
                {selectedCari ? 'Müşteri Oluştur' : 'Önce Mikro Cari Seçin'}
              </Button>
            </form>
          </Card>
        )}

        <CariSelectModal
          isOpen={showCariModal}
          onClose={() => setShowCariModal(false)}
          onSelect={handleCariSelect}
          cariList={cariList}
        />

        <Card title={`Müşteriler (${filteredCustomers.length} / ${customers.length})`}>
          <div className="space-y-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Ad, email, cari kodu, şehir, ilçe veya telefon ile ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterActive === 'all' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilterActive('all')}
                >
                  Tümü
                </Button>
                <Button
                  variant={filterActive === 'active' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilterActive('active')}
                >
                  Aktif
                </Button>
                <Button
                  variant={filterActive === 'inactive' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilterActive('inactive')}
                >
                  Pasif
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left text-sm text-gray-600">
                  <th className="px-4 py-3 font-medium">Ad</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">Mikro Cari</th>
                  <th className="px-4 py-3 font-medium">Şehir</th>
                  <th className="px-4 py-3 font-medium">İlçe</th>
                  <th className="px-4 py-3 font-medium">Telefon</th>
                  <th className="px-4 py-3 font-medium">Grup Kodu</th>
                  <th className="px-4 py-3 font-medium">Sektör Kodu</th>
                  <th className="px-4 py-3 font-medium">Vade Planı</th>
                  <th className="px-4 py-3 font-medium">E-Fatura</th>
                  <th className="px-4 py-3 font-medium">Bakiye</th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                  <th className="px-4 py-3 font-medium">Kayıt</th>
                  <th className="px-4 py-3 font-medium text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-8 text-center text-gray-500">
                      Müşteri bulunamadı
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="text-sm hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{customer.name}</td>
                      <td className="px-4 py-3 text-gray-600">{customer.email}</td>
                      <td className="px-4 py-3">
                        <Badge>{getCustomerTypeName(customer.customerType || '')}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{customer.mikroCariCode}</td>
                      <td className="px-4 py-3 text-gray-600">{customer.city || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{customer.district || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{customer.phone || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{customer.groupCode || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{customer.sectorCode || '-'}</td>
                      <td className="px-4 py-3 text-center">{getPaymentPlanLabel(customer)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={customer.hasEInvoice ? 'success' : 'default'}>
                          {customer.hasEInvoice ? 'Evet' : 'Hayır'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-right">
                        {customer.balance !== undefined ? formatCurrency(customer.balance) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {customer.isLocked ? (
                          <Badge variant="danger">Kilitli</Badge>
                        ) : (
                          <Badge variant={customer.active ? 'success' : 'default'}>
                            {customer.active ? 'Aktif' : 'Pasif'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateShort(customer.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        {canOpenCustomer ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditModal(customer)}
                          >
                            {canEditCustomer ? '✏️ Düzenle' : '👤 Kişiler'}
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400">Yetki yok</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <CustomerEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          customer={customerToEdit}
          onSave={handleEditCustomer}
          canEditFields={canEditCustomer}
        />

        <BulkCreateUsersModal
          isOpen={showBulkCreateModal}
          onClose={() => setShowBulkCreateModal(false)}
          onSuccess={() => {
            fetchCustomers();
            setShowBulkCreateModal(false);
          }}
        />
      </div>
    </div>
  );
}
