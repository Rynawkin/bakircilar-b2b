'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  useAyarlar,
  RETAIL_LISTS,
  WHOLESALE_LISTS,
  DEFAULT_CUSTOMER_PRICE_LISTS,
  CUSTOMER_TYPES,
} from './useAyarlar';

/**
 * Klasik gorunum — Sistem Ayarlari.
 * JSX birebir korunmustur (emoji dahil). Tum mantik useAyarlar'dan gelir.
 */
export default function AyarlarClassic() {
  const {
    settings,
    setSettings,
    isLoading,
    isSaving,
    marginRecipientsInput,
    setMarginRecipientsInput,
    handleSave,
  } = useAyarlar();

  if (isLoading || !settings) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container-custom py-8 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Sistem Ayarlari</h1>
          <p className="text-sm text-gray-600">Genel sistem yapilandirmasi</p>
        </div>
        <form onSubmit={handleSave} className="space-y-6">
          <Card title="Fazla Stok Hesaplama">
            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded mb-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">📊 Fazla Stok Nasıl Hesaplanır?</p>
                <p className="text-sm text-blue-800">
                  <strong>Fazla Stok</strong> = Toplam Stok - Ortalama Satış × Periyot - Bekleyen Siparişler
                  <br/><br/>
                  <strong>Örnek:</strong> 100 adet stok var, aylık ortalama 20 adet satıyoruz, 3 aylık periyot seçiliyse:
                  <br/>→ Fazla Stok = 100 - (20 × 3) - 0 = <strong>40 adet</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">📅 Hesaplama Periyodu (Ay)</label>
                <select
                  className="input"
                  value={settings.calculationPeriodMonths}
                  onChange={(e) => setSettings({ ...settings, calculationPeriodMonths: parseInt(e.target.value) })}
                >
                  <option value={1}>1 Ay (Kısa vadeli satış tahmini)</option>
                  <option value={3}>3 Ay (Orta vadeli - Önerilen)</option>
                  <option value={6}>6 Ay (Uzun vadeli)</option>
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  Son <strong>{settings.calculationPeriodMonths} aylık</strong> satış ortalaması kullanılacak
                </p>
              </div>

              <Input
                label="🔢 Minimum Fazla Stok Eşiği"
                type="number"
                value={settings.minimumExcessThreshold}
                onChange={(e) => setSettings({ ...settings, minimumExcessThreshold: parseInt(e.target.value) })}
              />
              <p className="text-xs text-gray-600 -mt-2">
                Bu değerden az fazla stok varsa ürün listeye eklenmez
              </p>

              <div>
                <label className="block text-sm font-medium mb-2">Maliyet Hesaplama Yöntemi</label>
                <select
                  className="input"
                  value={settings.costCalculationMethod}
                  onChange={(e) => setSettings({ ...settings, costCalculationMethod: e.target.value as any })}
                >
                  <option value="LAST_ENTRY">Son Giriş Fiyatı</option>
                  <option value="CURRENT_COST">Güncel Maliyet</option>
                  <option value="DYNAMIC">Dinamik Hesaplama</option>
                </select>
              </div>

              {settings.costCalculationMethod === 'DYNAMIC' && (
                <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
                  <h4 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <span className="text-xl">⚙️</span>
                    Dinamik Hesaplama Ayarları
                  </h4>

                  <div className="bg-white border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold text-blue-900 mb-3">📘 Nasıl Çalışır?</p>
                    <div className="text-sm text-gray-700 leading-relaxed space-y-2">
                      <p>Bu sistem ürünün maliyetini hesaplarken <strong>iki fiyatı karıştırır</strong>:</p>
                      <div className="bg-blue-50 p-3 rounded">
                        <strong>1️⃣ Son Giriş Fiyatı:</strong> En son ne kadara aldık
                      </div>
                      <div className="bg-blue-50 p-3 rounded">
                        <strong>2️⃣ Güncel Maliyet:</strong> Mikro'daki tanımlı maliyet (stok kartında kayıtlı)
                      </div>
                      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded mt-3">
                        <strong>⏰ Zamana Göre Karar:</strong>
                        <br/>• Eğer <strong>yakın zamanda</strong> (gün eşiği içinde) alış yaptıysak → Son giriş fiyatı daha doğrudur
                        <br/>• Eğer <strong>uzun zaman önce</strong> aldıysak → Güncel maliyet daha günceldir
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Input
                        label="📅 Gün Eşiği (Kaç gün içindeki alışlar 'yeni' sayılsın?)"
                        type="number"
                        value={settings.dynamicCostParams?.dayThreshold || 30}
                        onChange={(e) => setSettings({
                          ...settings,
                          dynamicCostParams: {
                            ...settings.dynamicCostParams,
                            dayThreshold: parseInt(e.target.value)
                          }
                        })}
                        placeholder="30"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        Örnek: 30 gün → Son 30 gün içindeki alışlar "yeni" kabul edilir
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-3">
                        ⚖️ Son Giriş Fiyatı Ağırlığı (Yakın zamanda alındıysa)
                      </label>
                      <div className="flex items-center gap-4">
                        <Input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={(settings.dynamicCostParams?.priceWeightNew || 0.7) * 100}
                          onChange={(e) => {
                            const newWeight = parseFloat(e.target.value) / 100;
                            setSettings({
                              ...settings,
                              dynamicCostParams: {
                                ...settings.dynamicCostParams,
                                priceWeightNew: newWeight,
                                priceWeightOld: 1 - newWeight // Otomatik hesapla
                              }
                            });
                          }}
                          className="flex-1"
                        />
                        <div className="text-right min-w-[100px]">
                          <span className="text-2xl font-bold text-primary-700">
                            %{Math.round((settings.dynamicCostParams?.priceWeightNew || 0.7) * 100)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-primary-50 border border-primary-200 p-3 rounded">
                          <div className="font-semibold text-primary-900">🆕 Son Giriş Fiyatı</div>
                          <div className="text-2xl font-bold text-primary-700">
                            %{Math.round((settings.dynamicCostParams?.priceWeightNew || 0.7) * 100)}
                          </div>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 p-3 rounded">
                          <div className="font-semibold text-gray-900">⏳ Güncel Maliyet</div>
                          <div className="text-2xl font-bold text-gray-700">
                            %{Math.round((settings.dynamicCostParams?.priceWeightOld || 0.3) * 100)}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-3">
                        💡 Slider'ı kaydırın, toplam her zaman %100 olur. Sol tarafa kaydırırsanız güncel maliyete, sağa kaydırırsanız son giriş fiyatına daha fazla güvenirsiniz.
                      </p>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm font-semibold text-green-900 mb-2">✅ Örnek Hesaplama:</p>
                      <div className="text-sm text-gray-700 space-y-2">
                        <div>
                          <strong>Senaryo 1: Yeni Alış (30 gün içinde)</strong>
                          <br/>• Son Giriş: 100 TL, Güncel Maliyet: 120 TL
                          <br/>• Hesaplanan Maliyet = <code className="bg-white px-2 py-1 rounded">100×0.7 + 120×0.3 = 106 TL</code>
                          <br/><span className="text-xs text-green-700">→ Yakın zamanda aldığımız fiyat daha ağır bastı</span>
                        </div>
                        <div className="border-t border-green-200 pt-2">
                          <strong>Senaryo 2: Eski Alış (30 günden eski)</strong>
                          <br/>• Son Giriş: 100 TL, Güncel Maliyet: 120 TL
                          <br/>• Hesaplanan Maliyet = <code className="bg-white px-2 py-1 rounded">120×0.7 + 100×0.3 = 114 TL</code>
                          <br/><span className="text-xs text-green-700">→ Güncel maliyet daha ağır bastı (fiyatlar değişmiş olabilir)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </Card>

          <Card title="Fiyat Listesi Eslesmesi">
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-900">
                Segment bazli fiyat listesi eslesmesi devre disidir. Musteriler kendi kartlarinda
                tanimli fiyat listesinden fiyatlanir; tanimli liste yoksa varsayilan olarak
                Toptan Satis 1 (faturali) ve Perakende Satis 1 (beyaz) kullanilir. Liste atamasi ve
                kategori kurallari musteri kartindan yonetilir.
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={settings.lastPriceIndexationEnabled ?? false}
                    onChange={(e) => setSettings({
                      ...settings,
                      lastPriceIndexationEnabled: e.target.checked,
                    })}
                  />
                  Son satış fiyatını liste değişimine endeksle
                </label>
                <p className="text-xs text-gray-600 mt-1 ml-6">
                  Açıkken: "son satış fiyatı kullan" carilerde eski satış fiyatı, satış anındaki liste
                  konumuna göre güncel listeye endekslenir (zam sonrası kâr erimesini durdurur). Fiyat
                  asla eski fiyatın altına inmez.
                </p>
              </div>
            </div>
          </Card>



          <Card title="Rapor Mail Bildirimleri">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.marginReportEmailEnabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    marginReportEmailEnabled: e.target.checked,
                  })}
                />
                Kar Marji Raporu icin gunluk mail gonder
              </label>

              <div>
                <label className="block text-sm font-medium mb-2">Alici Email'ler</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={3}
                  placeholder="ornek@firma.com, finans@firma.com"
                  value={marginRecipientsInput}
                  onChange={(e) => setMarginRecipientsInput(e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">Virgul veya yeni satir ile ayirabilirsiniz.</p>
              </div>

              <Input
                label="Mail Konusu"
                value={settings.marginReportEmailSubject || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  marginReportEmailSubject: e.target.value,
                })}
              />

              <p className="text-xs text-gray-600">
                Rapor her gun 03:00'te bir onceki gun icin gonderilir.
              </p>
            </div>
          </Card>

          <Button type="submit" isLoading={isSaving} className="w-full">
            Ayarlari Kaydet
          </Button>
        </form>
      </div>
    </div>
  );
}
