'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Customer, CreateCustomerRequest } from '@/types';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { LogoLink } from '@/components/ui/Logo';
import { formatDateShort } from '@/lib/utils/format';
import { CUSTOMER_TYPES, getCustomerTypeName } from '@/lib/utils/customerTypes';

interface MikroCari {
  code: string;
  name: string;
  type: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cariList, setCariList] = useState<MikroCari[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<CreateCustomerRequest>({
    email: '',
    password: '',
    name: '',
    customerType: 'PERAKENDE',
    mikroCariCode: '',
  });

  useEffect(() => {
    fetchCustomers();
    fetchCariList();
  }, []);

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

  const handleCariSelect = (cariCode: string) => {
    const selectedCari = cariList.find(c => c.code === cariCode);
    if (selectedCari) {
      setFormData({
        ...formData,
        mikroCariCode: selectedCari.code,
        name: formData.name || selectedCari.name,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createCustomer(formData);
      toast.success('Müşteri başarıyla oluşturuldu! ✅');
      setShowForm(false);
      setFormData({ email: '', password: '', name: '', customerType: 'PERAKENDE', mikroCariCode: '' });
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Müşteri oluşturulamadı');
    }
  };

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
              <Button
                variant="secondary"
                onClick={() => setShowForm(!showForm)}
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
                <label className="block text-sm font-medium mb-1">Mikro Cari Seç</label>
                <select
                  className="input"
                  value={formData.mikroCariCode}
                  onChange={(e) => handleCariSelect(e.target.value)}
                  required
                >
                  <option value="">-- Cari Seçin --</option>
                  {cariList.map((cari) => (
                    <option key={cari.code} value={cari.code}>
                      {cari.code} - {cari.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Mikro ERP'den cari listesi çekilmektedir</p>
              </div>

              <Input
                label="Ad Soyad"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Cari seçince otomatik dolar"
              />

              <div>
                <label className="block text-sm font-medium mb-1">Müşteri Segmenti</label>
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
                <p className="text-xs text-gray-500 mt-1">Fiyatlandırma segmenti belirleyin</p>
              </div>

              <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
              <Input label="Şifre" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required minLength={6} />

              <Button type="submit" className="w-full">Müşteri Oluştur</Button>
            </form>
          </Card>
        )}

        <Card title={`Müşteriler (${customers.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-gray-600">
                  <th className="pb-2">Ad</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Tip</th>
                  <th className="pb-2">Mikro Cari</th>
                  <th className="pb-2">Durum</th>
                  <th className="pb-2">Kayıt</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((customer) => (
                  <tr key={customer.id} className="text-sm">
                    <td className="py-3">{customer.name}</td>
                    <td>{customer.email}</td>
                    <td><Badge>{getCustomerTypeName(customer.customerType || '')}</Badge></td>
                    <td className="font-mono text-xs">{customer.mikroCariCode}</td>
                    <td><Badge variant={customer.active ? 'success' : 'danger'}>{customer.active ? 'Aktif' : 'Pasif'}</Badge></td>
                    <td className="text-gray-500">{formatDateShort(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
