'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Customer } from '@/types';
import { CUSTOMER_TYPES } from '@/lib/utils/customerTypes';
import { formatCurrency } from '@/lib/utils/format';

interface CustomerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSave: (customerId: string, data: {
    email?: string;
    customerType?: string;
    active?: boolean;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
  }) => Promise<void>;
}

const RETAIL_LISTS = [
  { value: 1, label: 'Perakende Satis 1' },
  { value: 2, label: 'Perakende Satis 2' },
  { value: 3, label: 'Perakende Satis 3' },
  { value: 4, label: 'Perakende Satis 4' },
  { value: 5, label: 'Perakende Satis 5' },
];

const WHOLESALE_LISTS = [
  { value: 6, label: 'Toptan Satis 1' },
  { value: 7, label: 'Toptan Satis 2' },
  { value: 8, label: 'Toptan Satis 3' },
  { value: 9, label: 'Toptan Satis 4' },
  { value: 10, label: 'Toptan Satis 5' },
];

export function CustomerEditModal({ isOpen, onClose, customer, onSave }: CustomerEditModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    customerType: 'PERAKENDE',
    active: true,
    invoicedPriceListNo: '',
    whitePriceListNo: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData({
        email: customer.email,
        customerType: customer.customerType || 'PERAKENDE',
        active: customer.active,
        invoicedPriceListNo: customer.invoicedPriceListNo ? String(customer.invoicedPriceListNo) : '',
        whitePriceListNo: customer.whitePriceListNo ? String(customer.whitePriceListNo) : '',
      });
    }
  }, [customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    setIsSaving(true);
    try {
      await onSave(customer.id, {
        email: formData.email,
        customerType: formData.customerType,
        active: formData.active,
        invoicedPriceListNo: formData.invoicedPriceListNo
          ? parseInt(formData.invoicedPriceListNo, 10)
          : null,
        whitePriceListNo: formData.whitePriceListNo
          ? parseInt(formData.whitePriceListNo, 10)
          : null,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!customer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Müşteri Düzenle" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Editable Fields Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">✏️ Düzenlenebilir Alanlar</h3>

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            placeholder="ornek@email.com"
          />

          <div>
            <label className="block text-sm font-medium mb-1">Müşteri Segmenti *</label>
            <select
              className="input"
              value={formData.customerType}
              onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
              required
            >
              {CUSTOMER_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Fiyatlandırma segmenti</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fiyat Listesi Override</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Faturali Liste (Toptan)</label>
                <select
                  className="input"
                  value={formData.invoicedPriceListNo}
                  onChange={(e) => setFormData({ ...formData, invoicedPriceListNo: e.target.value })}
                >
                  <option value="">Varsayilan (segment ayari)</option>
                  {WHOLESALE_LISTS.map((list) => (
                    <option key={list.value} value={list.value}>
                      {list.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Beyaz Liste (Perakende)</label>
                <select
                  className="input"
                  value={formData.whitePriceListNo}
                  onChange={(e) => setFormData({ ...formData, whitePriceListNo: e.target.value })}
                >
                  <option value="">Varsayilan (segment ayari)</option>
                  {RETAIL_LISTS.map((list) => (
                    <option key={list.value} value={list.value}>
                      {list.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Bos birakilirsa segment bazli fiyat listesi kullanilir.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Hesap Durumu</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, active: true })}
                className={`flex-1 px-4 py-2 rounded border-2 transition-colors ${
                  formData.active
                    ? 'bg-green-50 border-green-600 text-green-700 font-semibold'
                    : 'bg-gray-50 border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                ✅ Aktif
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, active: false })}
                className={`flex-1 px-4 py-2 rounded border-2 transition-colors ${
                  !formData.active
                    ? 'bg-red-50 border-red-600 text-red-700 font-semibold'
                    : 'bg-gray-50 border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                ⛔ Pasif
              </button>
            </div>
          </div>
        </div>

        {/* Read-Only Mikro Fields Section */}
        <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            🔒 Mikro ERP Bilgileri (Sadece Görüntüleme)
          </h3>
          <p className="text-xs text-gray-500 mb-4 italic">
            Bu alanlar Mikro ERP'den senkronize edilir ve düzenlenemez
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ad Soyad</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 font-medium">
                {customer.name || '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mikro Cari Kodu</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm font-mono text-gray-800">
                {customer.mikroCariCode || '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Şehir</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800">
                {customer.city || '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">İlçe</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800">
                {customer.district || '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm font-mono text-gray-800">
                {customer.phone || '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grup Kodu</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800">
                {customer.groupCode || '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sektör Kodu</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800">
                {customer.sectorCode || '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vade Günü</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800">
                {customer.paymentTerm ? `${customer.paymentTerm} gün` : '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bakiye</label>
              <div className={`bg-white border border-gray-200 rounded px-3 py-2 text-sm font-semibold ${
                customer.balance !== undefined && customer.balance >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {customer.balance !== undefined ? formatCurrency(customer.balance) : '-'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Durum Bilgileri</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 flex gap-2">
                {customer.hasEInvoice && <Badge variant="success">E-Fatura</Badge>}
                {customer.isLocked && <Badge variant="danger">Kilitli</Badge>}
                {!customer.hasEInvoice && !customer.isLocked && <Badge variant="info">Normal</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={isSaving}>
            İptal
          </Button>
          <Button type="submit" variant="primary" className="flex-1" isLoading={isSaving}>
            {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
