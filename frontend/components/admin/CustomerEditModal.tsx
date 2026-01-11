'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Customer, CustomerContact } from '@/types';
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
    priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  }) => Promise<void>;
  canEditFields?: boolean;
}

interface SubUser {
  id: string;
  name: string;
  email?: string;
  active: boolean;
  createdAt: string;
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

export function CustomerEditModal({
  isOpen,
  onClose,
  customer,
  onSave,
  canEditFields = true,
}: CustomerEditModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    customerType: 'PERAKENDE',
    active: true,
    invoicedPriceListNo: '',
    whitePriceListNo: '',
    priceVisibility: 'INVOICED_ONLY',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
  });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [subUsersLoading, setSubUsersLoading] = useState(false);
  const [subUserForm, setSubUserForm] = useState({
    name: '',
    email: '',
    password: '',
    active: true,
  });
  const [autoCredentials, setAutoCredentials] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ username: string; password: string } | null>(null);
  const [editingSubUserId, setEditingSubUserId] = useState<string | null>(null);
  const [subUserSaving, setSubUserSaving] = useState(false);

  useEffect(() => {
      if (customer) {
        setFormData({
          email: customer.email || '',
          customerType: customer.customerType || 'PERAKENDE',
          active: customer.active,
        invoicedPriceListNo: customer.invoicedPriceListNo ? String(customer.invoicedPriceListNo) : '',
        whitePriceListNo: customer.whitePriceListNo ? String(customer.whitePriceListNo) : '',
        priceVisibility: customer.priceVisibility || 'INVOICED_ONLY',
      });
    }
  }, [customer]);

  const paymentPlanLabel = customer
    ? customer.paymentPlanName || customer.paymentPlanCode
      ? [customer.paymentPlanCode, customer.paymentPlanName].filter(Boolean).join(' - ')
      : customer.paymentTerm !== undefined && customer.paymentTerm !== null
        ? `${customer.paymentTerm} gun`
        : '-'
    : '-';

  useEffect(() => {
    if (!isOpen || !customer) return;
    setContactForm({ name: '', phone: '', email: '' });
    setEditingContactId(null);
    setSubUserForm({ name: '', email: '', password: '', active: true });
    setEditingSubUserId(null);
    setAutoCredentials(false);
    setGeneratedCredentials(null);
    const loadContacts = async () => {
      setContactsLoading(true);
      try {
        const result = await adminApi.getCustomerContacts(customer.id);
        setContacts(result.contacts || []);
      } catch (error) {
        console.error('Kişi listesi yüklenemedi:', error);
        toast.error('Kişi listesi yüklenemedi.');
        setContacts([]);
      } finally {
        setContactsLoading(false);
      }
    };

    loadContacts();
    if (canEditFields) {
      const loadSubUsers = async () => {
        setSubUsersLoading(true);
        try {
          const result = await adminApi.getCustomerSubUsers(customer.id);
          setSubUsers(result.subUsers || []);
        } catch (error) {
          console.error('Alt kullanici listesi yuklenemedi:', error);
          toast.error('Alt kullanici listesi yuklenemedi.');
          setSubUsers([]);
        } finally {
          setSubUsersLoading(false);
        }
      };
      loadSubUsers();
    } else {
      setSubUsers([]);
    }
  }, [isOpen, customer, canEditFields]);

  const resetContactForm = () => {
    setContactForm({ name: '', phone: '', email: '' });
    setEditingContactId(null);
  };

  const handleContactSave = async () => {
    if (!customer) return;
    const trimmedName = contactForm.name.trim();
    if (!trimmedName) {
      toast.error('Kişi adı gerekli.');
      return;
    }

    setContactSaving(true);
    try {
      if (editingContactId) {
        await adminApi.updateCustomerContact(customer.id, editingContactId, {
          name: trimmedName,
          phone: contactForm.phone ? contactForm.phone.trim() : undefined,
          email: contactForm.email ? contactForm.email.trim() : undefined,
        });
        toast.success('Kişi güncellendi.');
      } else {
        await adminApi.createCustomerContact(customer.id, {
          name: trimmedName,
          phone: contactForm.phone ? contactForm.phone.trim() : undefined,
          email: contactForm.email ? contactForm.email.trim() : undefined,
        });
        toast.success('Kişi eklendi.');
      }
      const result = await adminApi.getCustomerContacts(customer.id);
      setContacts(result.contacts || []);
      resetContactForm();
    } catch (error) {
      console.error('Kişi kaydedilemedi:', error);
      toast.error('Kişi kaydedilemedi.');
    } finally {
      setContactSaving(false);
    }
  };

  const handleEditContact = (contact: CustomerContact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name || '',
      phone: contact.phone || '',
      email: contact.email || '',
    });
  };

  const handleDeleteContact = async (contact: CustomerContact) => {
    if (!customer) return;
    if (!confirm('Kişiyi silmek istediğinize emin misiniz?')) return;

    setContactSaving(true);
    try {
      await adminApi.deleteCustomerContact(customer.id, contact.id);
      toast.success('Kişi silindi.');
      const result = await adminApi.getCustomerContacts(customer.id);
      setContacts(result.contacts || []);
      if (editingContactId === contact.id) {
        resetContactForm();
      }
    } catch (error) {
      console.error('Kişi silinemedi:', error);
      toast.error('Kişi silinemedi.');
    } finally {
      setContactSaving(false);
    }
  };

  const resetSubUserForm = (keepCredentials = false) => {
    setSubUserForm({ name: '', email: '', password: '', active: true });
    setEditingSubUserId(null);
    setAutoCredentials(false);
    if (!keepCredentials) {
      setGeneratedCredentials(null);
    }
  };

  const handleSubUserSave = async () => {
    if (!customer) return;
    if (!canEditFields) return;

    setGeneratedCredentials(null);

    const trimmedName = subUserForm.name.trim();
    const trimmedEmail = subUserForm.email.trim();
    const trimmedPassword = subUserForm.password.trim();
    const shouldAutoGenerate = !editingSubUserId && autoCredentials;

    if (!trimmedName) {
      toast.error('Alt kullanici adi gerekli.');
      return;
    }
    if (!editingSubUserId && !shouldAutoGenerate && !trimmedEmail) {
      toast.error('Alt kullanici kullanici adi gerekli.');
      return;
    }
    if (!editingSubUserId && !shouldAutoGenerate && !trimmedPassword) {
      toast.error('Alt kullanici sifresi gerekli.');
      return;
    }

    setSubUserSaving(true);
    try {
      let keepCredentials = false;
      if (editingSubUserId) {
        await adminApi.updateCustomerSubUser(editingSubUserId, {
          name: trimmedName,
          email: trimmedEmail || undefined,
          password: trimmedPassword || undefined,
          active: subUserForm.active,
        });
        toast.success('Alt kullanici guncellendi.');
      } else {
        const createResult = await adminApi.createCustomerSubUser(customer.id, {
          name: trimmedName,
          email: trimmedEmail || undefined,
          password: trimmedPassword || undefined,
          active: subUserForm.active,
          autoCredentials: shouldAutoGenerate,
        });
        setGeneratedCredentials(createResult.credentials || null);
        keepCredentials = Boolean(createResult.credentials);
        toast.success('Alt kullanici eklendi.');
      }
      const listResult = await adminApi.getCustomerSubUsers(customer.id);
      setSubUsers(listResult.subUsers || []);
      resetSubUserForm(keepCredentials);
    } catch (error) {
      console.error('Alt kullanici kaydedilemedi:', error);
      toast.error('Alt kullanici kaydedilemedi.');
    } finally {
      setSubUserSaving(false);
    }
  };

  const handleEditSubUser = (subUser: SubUser) => {
    setEditingSubUserId(subUser.id);
    setSubUserForm({
      name: subUser.name || '',
      email: subUser.email || '',
      password: '',
      active: subUser.active,
    });
    setAutoCredentials(false);
    setGeneratedCredentials(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    if (!canEditFields) return;

    setIsSaving(true);
    try {
      await onSave(customer.id, {
        email: formData.email.trim() || undefined,
        customerType: formData.customerType,
        active: formData.active,
        invoicedPriceListNo: formData.invoicedPriceListNo
          ? parseInt(formData.invoicedPriceListNo, 10)
          : null,
        whitePriceListNo: formData.whitePriceListNo
          ? parseInt(formData.whitePriceListNo, 10)
          : null,
        priceVisibility: formData.priceVisibility as 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH',
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
        {canEditFields && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">✏️ Düzenlenebilir Alanlar</h3>

            <Input
              label="Kullanici Adi / E-posta"
              type="text"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="ornek@firma.com veya 120.01.0001"
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
                  <option value="">Varsayilan (genel ayar)</option>
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
                  <option value="">Varsayilan (genel ayar)</option>
                  {RETAIL_LISTS.map((list) => (
                    <option key={list.value} value={list.value}>
                      {list.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Bos birakilirsa genel fiyat listesi kullanilir.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Fiyat Gorunurlugu</label>
            <select
              className="input"
              value={formData.priceVisibility}
              onChange={(e) => setFormData({ ...formData, priceVisibility: e.target.value })}
            >
              <option value="INVOICED_ONLY">Sadece faturali</option>
              <option value="WHITE_ONLY">Sadece beyaz</option>
              <option value="BOTH">Faturali + beyaz</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Musterinin gorebilecegi fiyat tiplerini belirler.
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
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">İletişim Kişileri</h3>
              <p className="text-xs text-gray-500">Müşteri için kayıtlı ilgili kişiler.</p>
            </div>
            {contactsLoading && (
              <span className="text-xs text-gray-400">Yükleniyor...</span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              label="Ad Soyad"
              type="text"
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              placeholder="Örn: Ahmet Yılmaz"
            />
            <Input
              label="Telefon"
              type="text"
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              placeholder="05xx..."
            />
            <Input
              label="E-Posta"
              type="email"
              value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              placeholder="ornek@email.com"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={handleContactSave}
              isLoading={contactSaving}
            >
              {editingContactId ? 'Kişiyi Güncelle' : 'Kişi Ekle'}
            </Button>
            {editingContactId && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={resetContactForm}
                disabled={contactSaving}
              >
                Vazgeç
              </Button>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            {!contactsLoading && contacts.length === 0 && (
              <div className="text-xs text-gray-500">Kayıtlı kişi yok.</div>
            )}
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{contact.name}</div>
                    <div className="text-xs text-gray-500">
                      Tel: {contact.phone || '-'} | Mail: {contact.email || '-'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleEditContact(contact)}
                    >
                      Düzenle
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => handleDeleteContact(contact)}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {canEditFields && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Alt Kullanicilar</h3>
              <p className="text-xs text-gray-500">Alt kullanicilar sepette talep olusturur, yonetici onaylar.</p>
            </div>
            {subUsersLoading && (
              <span className="text-xs text-gray-400">Yukleniyor...</span>
            )}
          </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <Input
                label="Ad Soyad"
                type="text"
                value={subUserForm.name}
                onChange={(e) => setSubUserForm({ ...subUserForm, name: e.target.value })}
                placeholder="Orn: Ali Yilmaz"
              />
              <Input
                label="Kullanici Adi / E-posta"
                type="text"
                value={subUserForm.email}
                onChange={(e) => setSubUserForm({ ...subUserForm, email: e.target.value })}
                placeholder={autoCredentials && !editingSubUserId ? 'Otomatik olusturulacak' : 'ornek@firma.com veya 120.01.0001'}
                disabled={autoCredentials && !editingSubUserId}
              />
              <Input
                label="Sifre"
                type="password"
                value={subUserForm.password}
                onChange={(e) => setSubUserForm({ ...subUserForm, password: e.target.value })}
                placeholder={
                  autoCredentials && !editingSubUserId
                    ? 'Otomatik olusturulacak'
                    : (editingSubUserId ? 'Bos birakilabilir' : 'En az 6 karakter')
                }
                disabled={autoCredentials && !editingSubUserId}
              />
              <div>
                <label className="block text-xs text-gray-600 mb-1">Durum</label>
                <select
                  className="input"
                  value={subUserForm.active ? 'active' : 'inactive'}
                onChange={(e) => setSubUserForm({ ...subUserForm, active: e.target.value === 'active' })}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Pasif</option>
                </select>
              </div>
            </div>
            {!editingSubUserId && (
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={autoCredentials}
                  onChange={(e) => setAutoCredentials(e.target.checked)}
                />
                Otomatik kullanici adi ve sifre ata
              </label>
            )}
            {generatedCredentials && (
              <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">
                <div>
                  Kullanici Adi: <span className="font-mono">{generatedCredentials.username}</span>
                </div>
                <div>
                  Sifre: <span className="font-mono">{generatedCredentials.password}</span>
                </div>
              </div>
            )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={handleSubUserSave}
              isLoading={subUserSaving}
            >
              {editingSubUserId ? 'Alt Kullanici Guncelle' : 'Alt Kullanici Ekle'}
            </Button>
            {editingSubUserId && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={resetSubUserForm}
                disabled={subUserSaving}
              >
                Vazgec
              </Button>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            {!subUsersLoading && subUsers.length === 0 && (
              <div className="text-xs text-gray-500">Kayitli alt kullanici yok.</div>
            )}
            {subUsers.map((subUser) => (
              <div
                key={subUser.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{subUser.name}</div>
                      <div className="text-xs text-gray-500">Kullanici: {subUser.email || '-'}</div>
                    <div className="text-xs text-gray-500">Durum: {subUser.active ? 'Aktif' : 'Pasif'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleEditSubUser(subUser)}
                    >
                      Duzenle
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

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
              <label className="block text-xs font-medium text-gray-600 mb-1">Vade Planı</label>
              <div className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-800">
                {paymentPlanLabel}
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
          {canEditFields && (
            <Button type="submit" variant="primary" className="flex-1" isLoading={isSaving}>
              {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
