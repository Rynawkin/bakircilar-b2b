'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatDateShort, formatCurrency } from '@/lib/utils/format';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { CustomerEditModal } from '@/components/admin/CustomerEditModal';
import { BulkCreateUsersModal } from '@/components/admin/BulkCreateUsersModal';
import { useMusteriler } from './useMusteriler';

/**
 * Klasik (mevcut) Musteriler gorunumu. JSX birebir korunmustur; tum mantik useMusteriler'dan gelir.
 */
export default function MusterilerClassic() {
  const {
    filteredCustomers,
    cariList,
    isLoading,
    isFetching,
    showForm,
    toggleForm,
    formData,
    setFormData,
    selectedCari,
    handleSubmit,
    showCariModal,
    setShowCariModal,
    handleCariSelect,
    searchTerm,
    setSearchTerm,
    filterActive,
    setFilterActive,
    page,
    total,
    totalPages,
    goPrev,
    goNext,
    showEditModal,
    setShowEditModal,
    customerToEdit,
    openEditModal,
    handleEditCustomer,
    showBulkCreateModal,
    setShowBulkCreateModal,
    canOpenCustomer,
    canEditCustomer,
    canBulkCreate,
    fetchCustomers,
    getPaymentPlanLabel,
    getCustomerTypeName,
    CUSTOMER_TYPES,
  } = useMusteriler();

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container-custom py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Musteri Yonetimi</h1>
            <p className="text-sm text-gray-600">Musteri hesaplari ve bilgileri</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canBulkCreate && (
              <Button variant="secondary" onClick={() => setShowBulkCreateModal(true)}>
                Toplu Kullanici Olustur
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={toggleForm}
            >
              {showForm ? 'Iptal' : '+ Yeni Musteri'}
            </Button>
          </div>
        </div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div>
                <label className="block text-sm font-medium mb-1">Fiyat Gorunurlugu</label>
                <select
                  className="input"
                  value={formData.priceVisibility || 'INVOICED_ONLY'}
                  onChange={(e) => setFormData({ ...formData, priceVisibility: e.target.value as any })}
                >
                  <option value="INVOICED_ONLY">Sadece faturali</option>
                  <option value="WHITE_ONLY">Sadece beyaz</option>
                  <option value="BOTH">Faturali + beyaz</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Musterinin gorebilecegi fiyat tiplerini belirler.
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">📋 Mikro ERP Bilgileri (Otomatik Doldurulur)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Kullanici Adi / E-posta"
                      type="text"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      placeholder="ornek@firma.com veya 120.01.0001"
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

        <Card title={`Müşteriler (${total})`}>
          <div className="space-y-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                  <Input
                    placeholder="Ad, kullanici adi, cari kodu, sehir, ilce veya telefon ile ara..."
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
                    <th className="px-4 py-3 font-medium">Kullanici</th>
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
                      {isFetching ? 'Yükleniyor…' : 'Müşteri bulunamadı'}
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

          {/* Sunucu-tarafli sayfalama kontrolu */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="text-sm text-gray-600">
              Sayfa {page} / {totalPages} · Toplam {total}
              {isFetching && <span className="ml-2 text-gray-400">· güncelleniyor…</span>}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={goPrev}
                disabled={page <= 1 || isFetching}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={goNext}
                disabled={page >= totalPages || isFetching}
              >
                Sonraki
              </Button>
            </div>
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
