'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils/format';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';

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

interface BulkCreateResult {
  created: string[];
  skipped: string[];
  errors: Array<{ code: string; error: string }>;
}

interface BulkCreateUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkCreateUsersModal({ isOpen, onClose, onSuccess }: BulkCreateUsersModalProps) {
  const [availableCaris, setAvailableCaris] = useState<MikroCari[]>([]);
  const [selectedCariCodes, setSelectedCariCodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [result, setResult] = useState<BulkCreateResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAvailableCaris();
    } else {
      // Reset state when modal closes
      setSelectedCariCodes(new Set());
      setSearchTerm('');
      setResult(null);
    }
  }, [isOpen]);

  const fetchAvailableCaris = async () => {
    setIsLoading(true);
    try {
      const response = await adminApi.getAvailableCaris();
      setAvailableCaris(response.caris);
    } catch (error) {
      toast.error('Cari listesi yüklenemedi');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleCari = (code: string) => {
    const newSelection = new Set(selectedCariCodes);
    if (newSelection.has(code)) {
      newSelection.delete(code);
    } else {
      newSelection.add(code);
    }
    setSelectedCariCodes(newSelection);
  };

  const handleSelectAll = () => {
    const filteredCodes = filteredCaris.map(c => c.code);
    if (selectedCariCodes.size === filteredCodes.length) {
      setSelectedCariCodes(new Set());
    } else {
      setSelectedCariCodes(new Set(filteredCodes));
    }
  };

  const handleBulkCreate = async () => {
    if (selectedCariCodes.size === 0) {
      toast.error('Lütfen en az bir cari seçin');
      return;
    }

    setIsCreating(true);
    try {
      const response = await adminApi.bulkCreateUsers(Array.from(selectedCariCodes));
      setResult(response.results);

      // Show summary
      if (response.results.created.length > 0) {
        toast.success(`${response.results.created.length} kullanıcı başarıyla oluşturuldu! ✅`);
      }
      if (response.results.skipped.length > 0) {
        toast(`${response.results.skipped.length} kullanıcı zaten mevcut (atlandı)`, {
          icon: 'ℹ️',
        });
      }
      if (response.results.errors.length > 0) {
        toast.error(`${response.results.errors.length} kullanıcı oluşturulamadı`);
      }

      // Refresh the list if any were created
      if (response.results.created.length > 0) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Kullanıcılar oluşturulamadı');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredCaris = availableCaris.filter((cari) => {
    const tokens = buildSearchTokens(searchTerm);
    if (tokens.length === 0) return true;
    const haystack = normalizeSearchText([
      cari.code,
      cari.name,
      cari.city,
      cari.district,
    ].filter(Boolean).join(' '));
    return matchesSearchTokens(haystack, tokens);
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Toplu Kullanıcı Oluştur"
      size="xl"
    >
      <div className="space-y-4">
        {result ? (
          // Show results
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">✅ Oluşturulan Kullanıcılar ({result.created.length})</h3>
              {result.created.length === 0 ? (
                <p className="text-sm text-green-700">Hiç kullanıcı oluşturulmadı</p>
              ) : (
                <div className="space-y-1">
                  {result.created.map(code => (
                    <div key={code} className="text-sm font-mono text-green-800 bg-white rounded px-3 py-2">
                      {code}
                      <span className="text-xs text-gray-500 ml-2">(Şifre: {code}123)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {result.skipped.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Atlandı (Zaten Mevcut) ({result.skipped.length})</h3>
                <div className="space-y-1">
                  {result.skipped.map(code => (
                    <div key={code} className="text-sm font-mono text-blue-800 bg-white rounded px-3 py-2">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-2">❌ Hatalar ({result.errors.length})</h3>
                <div className="space-y-1">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="text-sm bg-white rounded px-3 py-2">
                      <span className="font-mono text-red-800">{err.code}</span>
                      <span className="text-gray-600 ml-2">- {err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="primary" onClick={onClose}>
                Kapat
              </Button>
            </div>
          </div>
        ) : (
          // Show selection
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Not:</strong> Bu işlem, seçilen Mikro carilerden otomatik olarak kullanıcı hesapları oluşturur.
              </p>
              <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
                <li>Kullanıcı adı: Cari kodu (örn: 120.01.1670)</li>
                <li>Şifre: Cari kodu + "123" (örn: 120.01.1670123)</li>
                <li>Email adresi boş bırakılacak</li>
              </ul>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">
                  Toplam: <strong>{filteredCaris.length}</strong> cari bulundu
                  {selectedCariCodes.size > 0 && (
                    <> • <strong className="text-primary-600">{selectedCariCodes.size}</strong> seçili</>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSelectAll}
              >
                {selectedCariCodes.size === filteredCaris.length ? 'Hiçbirini Seçme' : 'Tümünü Seç'}
              </Button>
            </div>

            <Input
              placeholder="Cari kodu, isim, şehir veya ilçe ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : filteredCaris.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  {searchTerm ? 'Arama sonucu bulunamadı' : 'Henüz kullanıcı oluşturulmamış cari bulunamadı'}
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr className="text-left text-sm text-gray-600">
                      <th className="px-4 py-3 w-12">
                        <input
                          type="checkbox"
                          checked={selectedCariCodes.size === filteredCaris.length && filteredCaris.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">Cari Kodu</th>
                      <th className="px-4 py-3 font-medium">İsim</th>
                      <th className="px-4 py-3 font-medium">Şehir</th>
                      <th className="px-4 py-3 font-medium">Grup Kodu</th>
                      <th className="px-4 py-3 font-medium text-right">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCaris.map(cari => (
                      <tr
                        key={cari.code}
                        className={`text-sm hover:bg-gray-50 cursor-pointer ${
                          selectedCariCodes.has(cari.code) ? 'bg-primary-50' : ''
                        }`}
                        onClick={() => handleToggleCari(cari.code)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedCariCodes.has(cari.code)}
                            onChange={() => handleToggleCari(cari.code)}
                            className="rounded border-gray-300"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-medium">{cari.code}</td>
                        <td className="px-4 py-3">{cari.name}</td>
                        <td className="px-4 py-3 text-gray-600">{cari.city || '-'}</td>
                        <td className="px-4 py-3">
                          {cari.groupCode && <Badge>{cari.groupCode}</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(cari.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="secondary" onClick={onClose} disabled={isCreating}>
                İptal
              </Button>
              <Button
                variant="primary"
                onClick={handleBulkCreate}
                disabled={selectedCariCodes.size === 0 || isCreating}
              >
                {isCreating ? 'Oluşturuluyor...' : `${selectedCariCodes.size} Kullanıcı Oluştur`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
