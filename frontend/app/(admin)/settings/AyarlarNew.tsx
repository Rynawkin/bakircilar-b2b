'use client';

import {
  Boxes,
  Calculator,
  Hash,
  Sliders,
  Info,
  Clock,
  CheckCircle2,
  ListChecks,
  Mail,
  Save,
} from 'lucide-react';
import {
  useAyarlar,
  RETAIL_LISTS,
  WHOLESALE_LISTS,
  DEFAULT_CUSTOMER_PRICE_LISTS,
  CUSTOMER_TYPES,
} from './useAyarlar';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl p-[18px]';
const LABEL = 'block text-[11px] text-[#8b97ac] mb-[5px]';
const FIELD =
  'w-full h-[38px] border border-[#e3e8f0] rounded-lg px-[11px] text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white';
const SELECT =
  'w-full h-[38px] border border-[#e3e8f0] rounded-lg px-[9px] text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white cursor-pointer';
const CARD_TITLE =
  'flex items-center gap-2 text-[14px] font-semibold text-[#14223b] mb-[13px]';

/**
 * Yeni gorunum — Sistem Ayarlari.
 * Mevcut TUM mantik useAyarlar'dan gelir; sadece gorsel yeni.
 * Hicbir alan/buton/kolon/durum dusurulmemistir (DYNAMIC blok, slider, ornek
 * hesaplama, 4 segment x faturali/beyaz, mail checkbox/alicilar/konu dahil).
 */
export default function AyarlarNew() {
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#15356b]"></div>
      </div>
    );
  }

  const weightNewPct = Math.round((settings.dynamicCostParams?.priceWeightNew || 0.7) * 100);
  const weightOldPct = Math.round((settings.dynamicCostParams?.priceWeightOld || 0.3) * 100);

  return (
    <div className="min-h-screen">
      <div className="max-w-[860px] mx-auto px-4 md:px-6 pb-12">
        <div className="mt-6 mb-[18px]">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] m-0">
            Sistem Ayarları
          </h1>
          <div className="text-[13px] text-[#8b97ac] mt-[5px]">
            Fazla stok hesaplama, fiyat listesi eşleşmesi, rapor bildirimleri
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-[14px] max-w-[820px]">
          {/* Kart 1 — Fazla Stok Hesaplama */}
          <div className={CARD}>
            <div className={CARD_TITLE}>
              <Boxes size={16} className="text-[#15356b]" />
              Fazla Stok Hesaplama
            </div>

            {/* Aciklama (klasikteki bilgi kutusu korunur) */}
            <div className="flex gap-2 bg-[#eef2fa] border border-[#d6e0f1] rounded-[10px] p-[12px] mb-[14px]">
              <Info size={15} className="text-[#15356b] flex-none mt-[1px]" />
              <p className="text-[12px] text-[#51607a] leading-[1.55] m-0">
                <strong className="text-[#14223b]">Fazla Stok</strong> = Toplam Stok − Ortalama
                Satış × Periyot − Bekleyen Siparişler.
                <br />
                Örnek: 100 adet stok, aylık ortalama 20, 3 aylık periyot →{' '}
                <strong className="text-[#14223b]">100 − (20 × 3) − 0 = 40 adet</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
              <div>
                <label className={LABEL}>Hesaplama Periyodu (Ay)</label>
                <select
                  className={SELECT}
                  value={settings.calculationPeriodMonths}
                  onChange={(e) =>
                    setSettings({ ...settings, calculationPeriodMonths: parseInt(e.target.value) })
                  }
                >
                  <option value={1}>1 Ay (Kısa vadeli satış tahmini)</option>
                  <option value={3}>3 Ay (Orta vadeli - Önerilen)</option>
                  <option value={6}>6 Ay (Uzun vadeli)</option>
                </select>
                <p className="text-[11px] text-[#8b97ac] mt-[5px] m-0">
                  Son <strong className="text-[#51607a]">{settings.calculationPeriodMonths} aylık</strong>{' '}
                  satış ortalaması kullanılacak
                </p>
              </div>

              <div>
                <label className={LABEL}>
                  <span className="inline-flex items-center gap-[5px]">
                    <Hash size={11} className="text-[#8b97ac]" />
                    Min Fazla Stok Eşiği
                  </span>
                </label>
                <input
                  type="number"
                  className={FIELD}
                  value={settings.minimumExcessThreshold}
                  onChange={(e) =>
                    setSettings({ ...settings, minimumExcessThreshold: parseInt(e.target.value) })
                  }
                />
                <p className="text-[11px] text-[#8b97ac] mt-[5px] m-0">
                  Bu değerden az fazla stok varsa ürün listeye eklenmez
                </p>
              </div>

              <div>
                <label className={LABEL}>
                  <span className="inline-flex items-center gap-[5px]">
                    <Calculator size={11} className="text-[#8b97ac]" />
                    Maliyet Yöntemi
                  </span>
                </label>
                <select
                  className={SELECT}
                  value={settings.costCalculationMethod}
                  onChange={(e) =>
                    setSettings({ ...settings, costCalculationMethod: e.target.value as any })
                  }
                >
                  <option value="LAST_ENTRY">Son Giriş Fiyatı</option>
                  <option value="CURRENT_COST">Güncel Maliyet</option>
                  <option value="DYNAMIC">Dinamik Hesaplama</option>
                </select>
              </div>
            </div>

            {/* DYNAMIC alt blok — klasikteki tum alanlar korunur */}
            {settings.costCalculationMethod === 'DYNAMIC' && (
              <div className="mt-[14px] border border-[#d6e0f1] bg-[#fafbfd] rounded-[12px] p-[16px]">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#14223b] mb-[12px]">
                  <Sliders size={15} className="text-[#15356b]" />
                  Dinamik Hesaplama Ayarları
                </div>

                {/* Nasil calisir */}
                <div className="bg-white border border-[#e7ebf2] rounded-[10px] p-[14px] mb-[14px]">
                  <p className="flex items-center gap-[6px] text-[12px] font-semibold text-[#14223b] mb-[10px]">
                    <Info size={14} className="text-[#15356b]" />
                    Nasıl Çalışır?
                  </p>
                  <div className="text-[12px] text-[#51607a] leading-[1.55] flex flex-col gap-2">
                    <p className="m-0">
                      Bu sistem ürünün maliyetini hesaplarken{' '}
                      <strong className="text-[#14223b]">iki fiyatı karıştırır</strong>:
                    </p>
                    <div className="bg-[#eef2fa] border border-[#d6e0f1] rounded-[8px] p-[10px]">
                      <strong className="text-[#14223b]">1. Son Giriş Fiyatı:</strong> En son ne
                      kadara aldık
                    </div>
                    <div className="bg-[#eef2fa] border border-[#d6e0f1] rounded-[8px] p-[10px]">
                      <strong className="text-[#14223b]">2. Güncel Maliyet:</strong> Mikro'daki
                      tanımlı maliyet (stok kartında kayıtlı)
                    </div>
                    <div className="flex gap-[8px] bg-[#fffbeb] border border-[#fde68a] rounded-[8px] p-[10px] mt-[3px]">
                      <Clock size={15} className="text-[#b45309] flex-none mt-[1px]" />
                      <div>
                        <strong className="text-[#b45309]">Zamana Göre Karar:</strong>
                        <br />• <strong className="text-[#14223b]">yakın zamanda</strong> (gün eşiği
                        içinde) alış yaptıysak → Son giriş fiyatı daha doğrudur
                        <br />• <strong className="text-[#14223b]">uzun zaman önce</strong> aldıysak →
                        Güncel maliyet daha günceldir
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-[14px]">
                  {/* Gun esigi */}
                  <div>
                    <label className={LABEL}>
                      <span className="inline-flex items-center gap-[5px]">
                        <Clock size={11} className="text-[#8b97ac]" />
                        Gün Eşiği (Kaç gün içindeki alışlar "yeni" sayılsın?)
                      </span>
                    </label>
                    <input
                      type="number"
                      className={FIELD}
                      placeholder="30"
                      value={settings.dynamicCostParams?.dayThreshold || 30}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          dynamicCostParams: {
                            ...settings.dynamicCostParams,
                            dayThreshold: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                    <p className="text-[11px] text-[#8b97ac] mt-[5px] m-0">
                      Örnek: 30 gün → Son 30 gün içindeki alışlar "yeni" kabul edilir
                    </p>
                  </div>

                  {/* Son giris fiyati agirligi slider */}
                  <div>
                    <label className="flex items-center gap-[6px] text-[12px] font-semibold text-[#14223b] mb-[10px]">
                      <Sliders size={13} className="text-[#8b97ac]" />
                      Son Giriş Fiyatı Ağırlığı (Yakın zamanda alındıysa)
                    </label>
                    <div className="flex items-center gap-[14px]">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        className="flex-1 accent-[#15356b]"
                        value={weightNewPct}
                        onChange={(e) => {
                          const newWeight = parseFloat(e.target.value) / 100;
                          setSettings({
                            ...settings,
                            dynamicCostParams: {
                              ...settings.dynamicCostParams,
                              priceWeightNew: newWeight,
                              priceWeightOld: 1 - newWeight,
                            },
                          });
                        }}
                      />
                      <div className="text-right min-w-[80px]">
                        <span className="text-[22px] font-semibold text-[#15356b]">
                          %{weightNewPct}
                        </span>
                      </div>
                    </div>
                    <div className="mt-[10px] grid grid-cols-2 gap-[10px] text-[12px]">
                      <div className="bg-[#eef2fa] border border-[#d6e0f1] rounded-[8px] p-[10px]">
                        <div className="font-semibold text-[#15356b]">Son Giriş Fiyatı</div>
                        <div className="text-[20px] font-semibold text-[#15356b]">%{weightNewPct}</div>
                      </div>
                      <div className="bg-white border border-[#e7ebf2] rounded-[8px] p-[10px]">
                        <div className="font-semibold text-[#51607a]">Güncel Maliyet</div>
                        <div className="text-[20px] font-semibold text-[#51607a]">%{weightOldPct}</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#8b97ac] mt-[10px] m-0 leading-[1.5]">
                      Slider'ı kaydırın, toplam her zaman %100 olur. Sol tarafa kaydırırsanız güncel
                      maliyete, sağa kaydırırsanız son giriş fiyatına daha fazla güvenirsiniz.
                    </p>
                  </div>

                  {/* Ornek hesaplama */}
                  <div className="bg-[#ecfdf5] border border-[#a7f3d0] rounded-[10px] p-[14px]">
                    <p className="flex items-center gap-[6px] text-[12px] font-semibold text-[#047857] mb-[8px]">
                      <CheckCircle2 size={14} className="text-[#047857]" />
                      Örnek Hesaplama
                    </p>
                    <div className="text-[12px] text-[#51607a] flex flex-col gap-2 leading-[1.55]">
                      <div>
                        <strong className="text-[#14223b]">Senaryo 1: Yeni Alış (30 gün içinde)</strong>
                        <br />• Son Giriş: 100 TL, Güncel Maliyet: 120 TL
                        <br />• Hesaplanan Maliyet ={' '}
                        <code className="bg-white border border-[#a7f3d0] px-[6px] py-[2px] rounded-[5px] font-mono text-[11px]">
                          100×0.7 + 120×0.3 = 106 TL
                        </code>
                        <br />
                        <span className="text-[11px] text-[#047857]">
                          → Yakın zamanda aldığımız fiyat daha ağır bastı
                        </span>
                      </div>
                      <div className="border-t border-[#a7f3d0] pt-2">
                        <strong className="text-[#14223b]">Senaryo 2: Eski Alış (30 günden eski)</strong>
                        <br />• Son Giriş: 100 TL, Güncel Maliyet: 120 TL
                        <br />• Hesaplanan Maliyet ={' '}
                        <code className="bg-white border border-[#a7f3d0] px-[6px] py-[2px] rounded-[5px] font-mono text-[11px]">
                          120×0.7 + 100×0.3 = 114 TL
                        </code>
                        <br />
                        <span className="text-[11px] text-[#047857]">
                          → Güncel maliyet daha ağır bastı (fiyatlar değişmiş olabilir)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Kart 2 — Fiyat Listesi Eslesmesi (SEGMENT DEVRE DISI) */}
          <div className={CARD}>
            <div className={CARD_TITLE}>
              <ListChecks size={16} className="text-[#15356b]" />
              Fiyat Listesi Eşleşmesi
            </div>

            <div className="flex gap-2 bg-[#eef2fa] border border-[#d6e0f1] rounded-[10px] p-[12px]">
              <Info size={15} className="text-[#15356b] flex-none mt-[1px]" />
              <p className="text-[12px] text-[#51607a] leading-[1.55] m-0">
                Segment bazlı fiyat listesi eşleşmesi <strong>devre dışıdır</strong>. Müşteriler kendi
                kartlarında tanımlı fiyat listesinden fiyatlanır; tanımlı liste yoksa varsayılan olarak{' '}
                <strong>Toptan Satış 1 (faturalı)</strong> ve <strong>Perakende Satış 1 (beyaz)</strong>{' '}
                kullanılır. Liste ataması ve kategori kuralları müşteri kartından yönetilir.
              </p>
            </div>
          </div>

          {/* Kart 3 — Rapor Mail Bildirimleri */}
          <div className={CARD}>
            <div className={CARD_TITLE}>
              <Mail size={16} className="text-[#15356b]" />
              Rapor Mail Bildirimleri
            </div>

            <label className="flex items-center gap-[9px] text-[12.5px] text-[#14223b] cursor-pointer mb-[11px]">
              <input
                type="checkbox"
                className="w-[16px] h-[16px] accent-[#15356b]"
                checked={settings.marginReportEmailEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, marginReportEmailEnabled: e.target.checked })
                }
              />
              Kâr Marjı Raporu için günlük mail gönder
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-[11px]">
              <div>
                <label className={LABEL}>Alıcı Email'ler</label>
                <textarea
                  className="w-full border border-[#e3e8f0] rounded-[8px] px-[11px] py-[9px] text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white resize-y"
                  rows={3}
                  placeholder="ornek@firma.com, finans@firma.com"
                  value={marginRecipientsInput}
                  onChange={(e) => setMarginRecipientsInput(e.target.value)}
                />
                <p className="text-[11px] text-[#8b97ac] mt-[5px] m-0">
                  Virgül veya yeni satır ile ayırabilirsiniz.
                </p>
              </div>

              <div>
                <label className={LABEL}>Mail Konusu</label>
                <input
                  className={FIELD}
                  value={settings.marginReportEmailSubject || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, marginReportEmailSubject: e.target.value })
                  }
                />
                <p className="text-[11px] text-[#8b97ac] mt-[5px] m-0">
                  Rapor her gün 03:00'te bir önceki gün için gönderilir.
                </p>
              </div>
            </div>
          </div>

          {/* Tek kaydet butonu */}
          <button
            type="submit"
            disabled={isSaving}
            className="self-start inline-flex items-center gap-[7px] bg-[#15356b] hover:bg-[#1c4585] disabled:opacity-60 disabled:cursor-not-allowed border-none rounded-[9px] px-[20px] py-[11px] text-[13.5px] font-semibold text-white cursor-pointer transition-colors"
          >
            {isSaving ? (
              <span className="w-[15px] h-[15px] border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
            ) : (
              <Save size={16} />
            )}
            Ayarları Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}
