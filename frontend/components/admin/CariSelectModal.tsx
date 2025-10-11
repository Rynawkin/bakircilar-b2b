'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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
  hasEInvoice: boolean;
  balance: number;
}

interface CariSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (cari: MikroCari) => void;
  cariList: MikroCari[];
}

export function CariSelectModal({ isOpen, onClose, onSelect, cariList }: CariSelectModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCari, setSelectedCari] = useState<MikroCari | null>(null);

  const filteredCariList = useMemo(() => {
    if (!searchTerm) return cariList;

    const lowerSearch = searchTerm.toLowerCase();
    return cariList.filter(
      cari =>
        (cari.code?.toLowerCase() || '').includes(lowerSearch) ||
        (cari.name?.toLowerCase() || '').includes(lowerSearch) ||
        (cari.city?.toLowerCase() || '').includes(lowerSearch) ||
        (cari.district?.toLowerCase() || '').includes(lowerSearch) ||
        (cari.phone?.toLowerCase() || '').includes(lowerSearch) ||
        (cari.sectorCode?.toLowerCase() || '').includes(lowerSearch) ||
        (cari.groupCode?.toLowerCase() || '').includes(lowerSearch)
    );
  }, [cariList, searchTerm]);

  const handleRowClick = (cari: MikroCari) => {
    setSelectedCari(cari);
  };

  const handleConfirm = () => {
    if (selectedCari) {
      onSelect(selectedCari);
      setSelectedCari(null);
      setSearchTerm('');
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedCari(null);
    setSearchTerm('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Mikro ERP'den Cari Seç"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            İptal
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedCari}
          >
            Seçili Cariyi Onayla
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Input
            placeholder="Cari kodu, isim veya tip ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            {filteredCariList.length} cari bulundu
          </p>
        </div>

        {selectedCari && (
          <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg">
            <p className="text-sm font-medium text-primary-900 mb-3 flex items-center gap-2">
              ✅ Seçili Cari
              {selectedCari.isLocked && <Badge variant="danger">Kilitli</Badge>}
              {selectedCari.hasEInvoice && <Badge variant="success">E-Fatura</Badge>}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <p><span className="font-medium">Cari Kodu:</span> {selectedCari.code}</p>
              <p><span className="font-medium">İsim:</span> {selectedCari.name}</p>
              <p><span className="font-medium">Şehir:</span> {selectedCari.city || '-'}</p>
              <p><span className="font-medium">İlçe:</span> {selectedCari.district || '-'}</p>
              <p><span className="font-medium">Telefon:</span> {selectedCari.phone || '-'}</p>
              <p><span className="font-medium">Grup Kodu:</span> {selectedCari.groupCode || '-'}</p>
              <p><span className="font-medium">Sektör Kodu:</span> {selectedCari.sectorCode || '-'}</p>
              <p><span className="font-medium">Vade:</span> {selectedCari.paymentTerm !== undefined ? `${selectedCari.paymentTerm} gün` : '-'}</p>
              <p className="col-span-2">
                <span className="font-medium">Bakiye:</span>{' '}
                <span className={selectedCari.balance >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {selectedCari.balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                </span>
              </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-4 py-3 font-medium">Cari Kodu</th>
                <th className="px-4 py-3 font-medium">İsim</th>
                <th className="px-4 py-3 font-medium">Şehir/İlçe</th>
                <th className="px-4 py-3 font-medium">Telefon</th>
                <th className="px-4 py-3 font-medium">Grup Kodu</th>
                <th className="px-4 py-3 font-medium">Sektör Kodu</th>
                <th className="px-4 py-3 font-medium">Vade</th>
                <th className="px-4 py-3 font-medium">Bakiye</th>
                <th className="px-4 py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCariList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    Cari bulunamadı
                  </td>
                </tr>
              ) : (
                filteredCariList.map((cari) => (
                  <tr
                    key={cari.code}
                    onClick={() => handleRowClick(cari)}
                    className={`cursor-pointer transition-colors ${
                      selectedCari?.code === cari.code
                        ? 'bg-primary-100 hover:bg-primary-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-sm">{cari.code}</td>
                    <td className="px-4 py-3 text-sm">{cari.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {cari.city || '-'}
                      {cari.district && ` / ${cari.district}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {cari.phone || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {cari.groupCode || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {cari.sectorCode || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">
                      {cari.paymentTerm !== undefined ? `${cari.paymentTerm} gün` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      <span className={cari.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {cari.balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {cari.isLocked && <Badge variant="danger">Kilitli</Badge>}
                        {cari.hasEInvoice && <Badge variant="success">E-Fatura</Badge>}
                        {!cari.isLocked && !cari.hasEInvoice && <Badge variant="info">Normal</Badge>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
