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
  Timer,
  Play,
  RotateCcw,
  Loader2,
  AlertTriangle,
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
    scheduledJobs,
    jobsLoading,
    jobScheduleDrafts,
    savingJobKey,
    runningJobKey,
    setJobScheduleDraft,
    saveJobSchedule,
    resetJobSchedule,
    runJobNow,
    describeCron,
  } = useAyarlar();

  // Hazir zamanlama sablonlari (cron ifadesine yazan preset dropdown).
  const CRON_PRESETS: { value: string; label: string }[] = [
    { value: '', label: 'Hazir sablon...' },
    { value: '0 18 * * *', label: 'Her gun 18:00' },
    { value: '0 3 * * *', label: 'Her gun 03:00' },
    { value: '0 6 * * *', label: 'Her gun 06:00' },
    { value: '0 * * * *', label: 'Saatte bir' },
    { value: '*/10 * * * *', label: '10 dakikada bir' },
    { value: '*/20 * * * *', label: '20 dakikada bir' },
    { value: '0 4 * * 1', label: 'Haftalik - Pazartesi 04:00' },
  ];

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

              <div>
                <label className={LABEL}>
                  <span className="inline-flex items-center gap-[5px]">
                    <Calculator size={11} className="text-[#8b97ac]" />
                    Varsayılan Kâr Marjı (%)
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  className={FIELD}
                  placeholder="15"
                  value={Math.round((settings.defaultProfitMargin ?? 0.15) * 1000) / 10}
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value);
                    setSettings({
                      ...settings,
                      defaultProfitMargin: Number.isFinite(pct) ? pct / 100 : settings.defaultProfitMargin,
                    });
                  }}
                />
                <p className="text-[11px] text-[#8b97ac] mt-[5px] m-0">
                  Kategori/ürün marj kuralı olmayan ürünlere uygulanır. 15 = %15. İndirimli (excess) fiyatlar dahil tüm marj-motoru fiyatlarını etkiler.
                </p>
              </div>

              <div>
                <label className={LABEL}>
                  <span className="inline-flex items-center gap-[5px]">
                    <Calculator size={11} className="text-[#8b97ac]" />
                    Erken Ödeme Yıllık İndirim Oranı (%)
                  </span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={200}
                  className={FIELD}
                  placeholder="0"
                  value={settings.earlyPaymentAnnualRate ?? 0}
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value);
                    setSettings({
                      ...settings,
                      earlyPaymentAnnualRate: Number.isFinite(pct) && pct >= 0 ? pct : settings.earlyPaymentAnnualRate,
                    });
                  }}
                />
                <p className="text-[11px] text-[#8b97ac] mt-[5px] m-0">
                  Vadesi gelmemiş bakiyesini online erken ödeyene gün bazlı indirim: tutar × oran × kalan gün / 365. Örn. %36 → günlük ~%0,1. 0 = kapalı. Vadesi geçmiş borcu olan müşteriye sunulmaz; Mikro'ya yalnız ödenen tutarın makbuzu yazılır, indirim farkını muhasebe kapatır.
                </p>
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

            {/* Son satis fiyati liste endeksleme */}
            <div className="mt-[14px] border-t border-[#eef1f6] pt-[14px]">
              <label className="flex items-center gap-[9px] text-[12.5px] font-semibold text-[#14223b] cursor-pointer">
                <input
                  type="checkbox"
                  className="w-[16px] h-[16px] accent-[#15356b]"
                  checked={settings.lastPriceIndexationEnabled ?? false}
                  onChange={(e) =>
                    setSettings({ ...settings, lastPriceIndexationEnabled: e.target.checked })
                  }
                />
                Son satış fiyatını liste değişimine endeksle
              </label>
              <p className="text-[11px] text-[#8b97ac] mt-[6px] ml-[25px] m-0 leading-[1.55]">
                Açıkken: "son satış fiyatı kullan" carilerde eski satış fiyatı, satış anındaki liste
                konumuna göre güncel listeye endekslenir (zam sonrası kâr erimesini durdurur). Fiyat
                asla eski fiyatın altına inmez.
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[11px] mt-[14px] pt-[14px] border-t border-[#edf0f5]">
              <div>
                <label className={LABEL}>Dusuk Marj Esigi (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className={FIELD}
                  value={settings.marginAlertLowThreshold ?? 5}
                  onChange={(e) => setSettings({ ...settings, marginAlertLowThreshold: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={LABEL}>Yuksek Marj Esigi (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className={FIELD}
                  value={settings.marginAlertHighThreshold ?? 70}
                  onChange={(e) => setSettings({ ...settings, marginAlertHighThreshold: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={LABEL}>Mailde En Kotu Satir</label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  className={FIELD}
                  value={settings.marginEmailWorstLimit ?? 15}
                  onChange={(e) => setSettings({ ...settings, marginEmailWorstLimit: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={LABEL}>Eskalasyon (Is Gunu)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className={FIELD}
                  value={settings.marginViolationEscalationBusinessDays ?? 3}
                  onChange={(e) => setSettings({ ...settings, marginViolationEscalationBusinessDays: Number(e.target.value) })}
                />
              </div>
              <label className="flex items-center gap-[9px] text-[12px] text-[#14223b] cursor-pointer self-end min-h-[38px]">
                <input
                  type="checkbox"
                  className="w-[16px] h-[16px] accent-[#15356b]"
                  checked={settings.marginPersonalEmailEnabled ?? false}
                  onChange={(e) => setSettings({ ...settings, marginPersonalEmailEnabled: e.target.checked })}
                />
                Saticiya Kisisel Ozet
              </label>
            </div>
            <p className="text-[11px] text-[#8b97ac] mt-[8px] m-0 leading-[1.5]">
              Bu esikler panel, Excel ve e-posta raporunda ayni kullanilir. Kisisel ozetler sadece ilgili sektorlerin saticilarina gider.
            </p>
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

        {/* Kart 4 — Tetiklenecek Isler (scheduled jobs) — form DISINDA, kendi butonlari var */}
        <div className={`${CARD} mt-[14px] max-w-[820px]`}>
          <div className={CARD_TITLE}>
            <Timer size={16} className="text-[#15356b]" />
            Tetiklenecek İşlemler
          </div>

          <div className="flex gap-2 bg-[#fffbeb] border border-[#fde68a] rounded-[10px] p-[12px] mb-[14px]">
            <AlertTriangle size={15} className="text-[#b45309] flex-none mt-[1px]" />
            <p className="text-[12px] text-[#7c5410] leading-[1.55] m-0">
              Zamanlama değişiklikleri <strong>anında uygulanır</strong>; sunucuyu yeniden başlatmaya gerek yoktur.
              Cron ifadesi 5 alandır: <code className="bg-white border border-[#fde68a] px-[5px] py-[1px] rounded-[4px] font-mono text-[11px]">dakika saat gün ay haftanınGünü</code>.
              Örnek: <code className="bg-white border border-[#fde68a] px-[5px] py-[1px] rounded-[4px] font-mono text-[11px]">0 18 * * *</code> → Her gün 18:00.
            </p>
          </div>

          {jobsLoading ? (
            <div className="flex items-center gap-2 py-6 text-[12.5px] text-[#8b97ac]">
              <Loader2 size={15} className="animate-spin" /> İşler yükleniyor...
            </div>
          ) : scheduledJobs.length === 0 ? (
            <div className="py-6 text-[12.5px] text-[#8b97ac]">
              Tanımlı tetiklenecek iş bulunamadı.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-[18px] px-[18px]">
              <table className="w-full min-w-[760px] text-[12.5px] border-collapse">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#8b97ac] border-b border-[#eef1f6]">
                    <th className="py-[8px] pr-[12px] font-semibold">İş</th>
                    <th className="py-[8px] pr-[12px] font-semibold">Zamanlama</th>
                    <th className="py-[8px] pr-[12px] font-semibold">Son Çalışma</th>
                    <th className="py-[8px] font-semibold text-right">Aksiyonlar</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledJobs.map((job) => {
                    const draft = jobScheduleDrafts[job.key] ?? job.schedule;
                    const hint = describeCron(draft);
                    const isSavingThis = savingJobKey === job.key;
                    const isRunningThis = runningJobKey === job.key || job.running;
                    return (
                      <tr key={job.key} className="align-top border-b border-[#f2f4f8]">
                        {/* Is (ad + aciklama) */}
                        <td className="py-[11px] pr-[12px]">
                          <div className="font-semibold text-[#14223b]">{job.name}</div>
                          {job.description && (
                            <div className="text-[11px] text-[#8b97ac] mt-[2px] leading-[1.45] max-w-[240px]">
                              {job.description}
                            </div>
                          )}
                          {job.isOverride && (
                            <span className="inline-flex items-center mt-[5px] rounded-full bg-[#eef2fa] border border-[#d3deef] px-[7px] py-[1px] text-[10px] font-semibold text-[#15356b]">
                              özel
                            </span>
                          )}
                        </td>

                        {/* Zamanlama (cron input + preset + ipucu) */}
                        <td className="py-[11px] pr-[12px] min-w-[240px]">
                          <div className="flex flex-col gap-[6px]">
                            <input
                              value={draft}
                              onChange={(e) => setJobScheduleDraft(job.key, e.target.value)}
                              disabled={!job.editable || isSavingThis}
                              placeholder="0 18 * * *"
                              spellCheck={false}
                              className={`${FIELD} font-mono !h-[34px] disabled:opacity-60 disabled:cursor-not-allowed`}
                            />
                            <select
                              value=""
                              disabled={!job.editable || isSavingThis}
                              onChange={(e) => {
                                if (e.target.value) setJobScheduleDraft(job.key, e.target.value);
                              }}
                              className={`${SELECT} !h-[30px] text-[11.5px] disabled:opacity-60`}
                            >
                              {CRON_PRESETS.map((preset) => (
                                <option key={preset.label} value={preset.value}>
                                  {preset.label}
                                </option>
                              ))}
                            </select>
                            <div className="text-[10.5px] text-[#8b97ac] leading-[1.4]">
                              {hint ? (
                                <span>{hint}</span>
                              ) : (
                                <span className="text-[#b45309]">Tanımlı bir desene uymuyor — yine de geçerli olabilir.</span>
                              )}
                              {job.isOverride && (
                                <span className="ml-1 text-[#aab4c4]">
                                  (varsayılan: <span className="font-mono">{job.defaultSchedule}</span>)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Son calisma (zaman + OK/ERROR rozeti) */}
                        <td className="py-[11px] pr-[12px] min-w-[150px]">
                          {job.lastRunAt ? (
                            <div className="flex flex-col gap-[4px]">
                              <span className="text-[11.5px] text-[#51607a]">
                                {new Date(job.lastRunAt).toLocaleString('tr-TR')}
                              </span>
                              {job.lastResult === 'OK' && (
                                <span className="inline-flex w-fit items-center gap-[4px] rounded-full bg-[#ecfdf5] border border-[#a7f3d0] px-[7px] py-[1px] text-[10px] font-semibold text-[#047857]">
                                  <CheckCircle2 size={11} /> OK
                                </span>
                              )}
                              {job.lastResult === 'ERROR' && (
                                <span
                                  title={job.lastError || undefined}
                                  className="inline-flex w-fit items-center gap-[4px] rounded-full bg-[#fef2f2] border border-[#fecaca] px-[7px] py-[1px] text-[10px] font-semibold text-[#b91c1c] cursor-help"
                                >
                                  <AlertTriangle size={11} /> HATA
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#aab4c4]">Henüz çalışmadı</span>
                          )}
                        </td>

                        {/* Aksiyonlar */}
                        <td className="py-[11px]">
                          <div className="flex flex-wrap items-center justify-end gap-[6px]">
                            <button
                              type="button"
                              onClick={() => saveJobSchedule(job.key)}
                              disabled={!job.editable || isSavingThis}
                              className="inline-flex items-center gap-[5px] rounded-[7px] bg-[#15356b] hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed border-none px-[10px] py-[6px] text-[11.5px] font-semibold text-white cursor-pointer transition-colors"
                            >
                              {isSavingThis ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                              Kaydet
                            </button>
                            <button
                              type="button"
                              onClick={() => resetJobSchedule(job.key)}
                              disabled={!job.editable || isSavingThis || !job.isOverride}
                              title="Varsayılan zamanlamaya dön"
                              className="inline-flex items-center gap-[5px] rounded-[7px] bg-white hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed border border-[#d8e0ec] px-[10px] py-[6px] text-[11.5px] font-medium text-[#51607a] cursor-pointer transition-colors"
                            >
                              <RotateCcw size={12} />
                              Varsayılana Dön
                            </button>
                            <button
                              type="button"
                              onClick={() => runJobNow(job.key)}
                              disabled={isRunningThis}
                              title="İşi hemen bir kez çalıştır"
                              className="inline-flex items-center gap-[5px] rounded-[7px] bg-[#ecfdf5] hover:bg-[#d1fae5] disabled:opacity-50 disabled:cursor-not-allowed border border-[#a7f3d0] px-[10px] py-[6px] text-[11.5px] font-semibold text-[#047857] cursor-pointer transition-colors"
                            >
                              {isRunningThis ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              {isRunningThis ? 'Çalışıyor' : 'Şimdi Çalıştır'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
