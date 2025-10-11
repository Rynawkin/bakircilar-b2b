'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface MikroCari {
  code: string;
  name: string;
  type: string;
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
        (cari.type?.toLowerCase() || '').includes(lowerSearch)
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
            <p className="text-sm font-medium text-primary-900 mb-2">Seçili Cari:</p>
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Kod:</span> {selectedCari.code}</p>
              <p><span className="font-medium">İsim:</span> {selectedCari.name}</p>
              <p><span className="font-medium">Tip:</span> <Badge variant="info">{selectedCari.type}</Badge></p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-sm text-gray-600">
                <th className="px-4 py-3 font-medium">Cari Kodu</th>
                <th className="px-4 py-3 font-medium">İsim</th>
                <th className="px-4 py-3 font-medium">Tip</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCariList.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
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
                    <td className="px-4 py-3">
                      <Badge variant="info">{cari.type}</Badge>
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
