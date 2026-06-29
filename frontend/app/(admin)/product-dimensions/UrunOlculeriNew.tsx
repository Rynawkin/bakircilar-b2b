'use client';

import { useMemo } from 'react';
import {
  Ruler,
  Search,
  Save,
  Download,
  History,
  Copy,
  PackageCheck,
  Plus,
  Info,
  Boxes,
  TriangleAlert,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import {
  useUrunOlculeri,
  KEYBOARD_ROWS,
  NUMPAD_KEYS,
  isUnitEnabled,
  formatNumber,
  toNumber,
} from './useUrunOlculeri';

/**
 * Yeni gorunum Urun Olculeri ekrani. Mevcut TUM mantik useUrunOlculeri'den gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/durum/inline-form/badge dusurulmemistir; brief 4.5.4'teki her oge mevcut.
 * Klasik birebir korunur; bu dosya yalnizca gorsel temadir.
 */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const INPUT_BASE =
  'w-full rounded-lg border border-[#d8e0ec] bg-white px-3 py-2.5 text-sm font-medium text-[#14223b] outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15';
const NUMERIC_BASE =
  'mt-1 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 py-2.5 text-sm font-semibold text-[#14223b] outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15';

export default function UrunOlculeriNew() {
  const {
    user,
    permissionsLoading,
    search,
    setSearch,
    searchResults,
    searching,
    selectedProduct,
    setSelectedProduct,
    history,
    saving,
    shelfSearch,
    setShelfSearch,
    shelves,
    shelfOptionsOpen,
    setShelfOptionsOpen,
    shelfSearching,
    missingSearch,
    setMissingSearch,
    missingProducts,
    loadingMissing,
    keyboardTarget,
    setKeyboardTarget,
    keyboardValue,
    setKeyboardValue,
    unitNames,
    changedFields,
    loadProduct,
    searchShelves,
    selectShelf,
    openKeyboard,
    applyKeyboard,
    appendKeyboardKey,
    loadMissingProducts,
    updateUnit,
    addUnit,
    copyUnit,
    saveProduct,
    exportMissing,
  } = useUrunOlculeri();

  // Ozet kutulari icin tek kaynak: mevcut hook verileri (yeni istek/uydurma yok).
  const stats = useMemo(() => {
    const missingDimension = missingProducts.filter((p) =>
      (p.missing || []).some((m) => /ölç|olc|en|boy|y[uü]k|desi|kg|m3/i.test(m))
    ).length;
    const missingShelf = missingProducts.filter((p) => !p.shelfCode || (p.missing || []).some((m) => /raf|reyon/i.test(m))).length;
    return {
      missingTotal: missingProducts.length,
      missingDimension,
      missingShelf,
      historyCount: history.length,
    };
  }, [missingProducts, history]);

  const canSave = Boolean(selectedProduct) && changedFields.length > 0 && !saving;

  if (!user || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fa]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#15356b]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-[#14223b]">
      <datalist id="product-dimension-unit-names">
        {unitNames.map((unitName) => (
          <option key={unitName} value={unitName} />
        ))}
      </datalist>

      <div className="mx-auto max-w-[1920px] px-4 py-7 sm:px-6 2xl:px-10">
        {/* Baslik + ust aksiyonlar */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#eef2fa] px-2.5 py-1 text-[11px] font-semibold text-[#1c4585]">
              <Ruler className="h-3.5 w-3.5" />
              Yolpilot Veri Hazirligi
            </div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b]">Urun Olculeri</h1>
            <div className="mt-1.5 max-w-3xl text-[13px] text-[#8b97ac]">
              Yolpilot icin olcu/desi/kg/raf · cm girilir, Mikro'ya mm yazilir · birim katsayisi UI &harr; Mikro yon cevrimi
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={exportMissing}
              disabled={missingProducts.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#51607a] transition hover:bg-[#f4f6fa] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              CSV Export
            </button>
            <button
              type="button"
              onClick={saveProduct}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#1c4585] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-b-transparent" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Mikro'ya Kaydet
            </button>
          </div>
        </div>

        {/* Ozet kutulari */}
        <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
              <Boxes className="h-3.5 w-3.5" />
              Arama Sonucu
            </div>
            <div className="mt-1.5 text-[20px] font-semibold text-[#14223b]">{searchResults.length}</div>
          </div>
          <div className="rounded-xl border border-[#fde68a] bg-white p-4">
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#b45309]">
              <TriangleAlert className="h-3.5 w-3.5" />
              Eksik Olcu
            </div>
            <div className="mt-1.5 text-[20px] font-semibold text-[#b45309]">{stats.missingDimension}</div>
          </div>
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
              <MapPin className="h-3.5 w-3.5" />
              Eksik Raf
            </div>
            <div className="mt-1.5 text-[20px] font-semibold text-[#14223b]">{stats.missingShelf}</div>
          </div>
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Degisiklik Kaydi
            </div>
            <div className="mt-1.5 text-[20px] font-semibold text-[#047857]">{stats.historyCount}</div>
          </div>
        </div>

        {/* cm -> mm bilgi banneri */}
        <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-[#d6e0f1] bg-[#eef2fa] px-3.5 py-2.5">
          <Info className="h-[15px] w-[15px] flex-none text-[#15356b]" />
          <span className="text-[12px] text-[#1c4585]">
            Olculer <b className="font-semibold">santimetre (cm)</b> girilir; Mikro'ya <b className="font-semibold">milimetre (mm)</b> olarak yazilir. Birim
            katsayisi yon cevrimi UI &harr; Mikro arasinda uygulanir. Buyuk birim icin 1 KOLI = X ana birim, Mikroya -X yazilir.
          </span>
        </div>

        <div className="grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)] 2xl:grid-cols-[500px_minmax(0,1fr)]">
          {/* SOL: arama + eksik veri raporu */}
          <div className="space-y-4">
            {/* Urun Ara */}
            <div className={`${CARD} p-4`}>
              <h2 className="mb-3 text-[13px] font-semibold text-[#14223b]">Urun Ara</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b97ac]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onClick={() => openKeyboard({
                    title: 'Urun Arama Klavyesi',
                    value: search,
                    mode: 'text',
                    onApply: (value) => setSearch(value),
                  })}
                  placeholder="Kod veya urun adi..."
                  className={`${INPUT_BASE} pl-9`}
                />
              </div>
              <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-0.5">
                {searching && <div className="text-[12.5px] text-[#8b97ac]">Araniyor...</div>}
                {!searching && searchResults.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[#e3e8f0] px-3 py-5 text-center text-[12px] text-[#8b97ac]">
                    En az 2 karakter yazarak Mikro stok karti arayin.
                  </div>
                )}
                {!searching && searchResults.map((product) => {
                  const active = selectedProduct?.productCode === product.productCode;
                  return (
                    <button
                      key={product.productCode}
                      type="button"
                      onClick={() => loadProduct(product.productCode)}
                      className={`flex w-full gap-3 rounded-lg border p-2.5 text-left transition ${
                        active
                          ? 'border-[#15356b] bg-[#eef2fa]'
                          : 'border-[#e7ebf2] bg-white hover:border-[#c7d3e8] hover:bg-[#f9fbfe]'
                      }`}
                    >
                      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-[#f4f6fa]">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.productName} className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase text-[#c7d3e8]">Resim yok</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[12px] font-semibold text-[#14223b]">{product.productCode}</div>
                        <div className="line-clamp-2 text-[11.5px] text-[#51607a]">{product.productName || 'Urun adi yok'}</div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[10.5px]">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${product.hasStock ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            Stok: {formatNumber(product.stockQuantity || 0, 2)}
                          </span>
                          <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[#51607a]">
                            Raf: {product.shelfCode || '-'} {product.shelfName ? `- ${product.shelfName}` : ''}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Eksik Veri Raporu */}
            <div className={`${CARD} p-4`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-[#14223b]">Eksik Veri Raporu</h2>
                <button
                  type="button"
                  onClick={exportMissing}
                  disabled={missingProducts.length === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#d8e0ec] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#51607a] transition hover:bg-[#f4f6fa] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3 w-3" />
                  Excel
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={missingSearch}
                  onChange={(event) => setMissingSearch(event.target.value)}
                  onClick={() => openKeyboard({
                    title: 'Eksik Veri Filtre Klavyesi',
                    value: missingSearch,
                    mode: 'text',
                    onApply: (value) => setMissingSearch(value),
                  })}
                  placeholder="Opsiyonel filtre"
                  className={`${INPUT_BASE} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={loadMissingProducts}
                  disabled={loadingMissing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#1c4585] disabled:opacity-60"
                >
                  {loadingMissing && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-b-transparent" />}
                  Getir
                </button>
              </div>
              <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-0.5">
                {missingProducts.length === 0 && !loadingMissing && (
                  <div className="rounded-lg border border-dashed border-[#e3e8f0] px-3 py-5 text-center text-[12px] text-[#8b97ac]">
                    Getir'e basarak eksik olcu/raf bilgisi olan urunleri listeleyin.
                  </div>
                )}
                {missingProducts.map((product) => (
                  <button
                    key={product.productCode}
                    type="button"
                    onClick={() => loadProduct(product.productCode)}
                    className="flex w-full gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-2 text-left transition hover:bg-[#fff5d6]"
                  >
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-white/70">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.productName} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase text-[#c7d3e8]">Resim yok</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[12px] font-semibold text-[#92400e]">{product.productCode}</div>
                      <div className="line-clamp-1 text-[11.5px] text-[#b45309]">{product.productName || 'Urun adi yok'}</div>
                      <div className="mt-0.5 text-[11px] text-[#a16207]">{(product.missing || []).slice(0, 3).join(', ')}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-[#51607a]">Stok: {formatNumber(product.stockQuantity || 0, 2)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SAG: secili urun duzenleme */}
          <div className="space-y-4">
            {!selectedProduct ? (
              <div className={`${CARD} flex min-h-[420px] items-center justify-center p-6`}>
                <div className="text-center">
                  <PackageCheck className="mx-auto h-12 w-12 text-[#c7d3e8]" />
                  <h2 className="mt-3 text-[16px] font-semibold text-[#14223b]">Urun secin</h2>
                  <p className="mt-1.5 text-[12.5px] text-[#8b97ac]">Olcu, kg, birim katsayisi ve raf bilgilerini duzenlemek icin soldan urun arayin.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Urun basligi + raf secimi */}
                <div className={`${CARD} p-4`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-[#e7ebf2] bg-white">
                        {selectedProduct.imageUrl ? (
                          <img src={selectedProduct.imageUrl} alt={selectedProduct.productName} className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-[#c7d3e8]">Resim yok</div>
                        )}
                      </div>
                      <div>
                        <h2 className="font-mono text-[20px] font-semibold text-[#14223b]">{selectedProduct.productCode}</h2>
                        <p className="mt-1 text-[12.5px] text-[#51607a]">{selectedProduct.productName}</p>
                        <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${selectedProduct.hasStock ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {selectedProduct.hasStock ? 'Stokta var' : 'Stokta yok'}: {formatNumber(selectedProduct.stockQuantity || 0, 2)}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#f4f6fa] px-4 py-3 text-[12.5px]">
                      <div className="font-semibold text-[#51607a]">Mevcut Raf</div>
                      <div className="text-[#14223b]">{selectedProduct.shelfCode || '-'} {selectedProduct.shelfName ? `- ${selectedProduct.shelfName}` : ''}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-[#51607a]">Raf / Reyon Kodu</label>
                      <input
                        value={selectedProduct.shelfCode || ''}
                        onChange={(event) => {
                          const shelfCode = event.target.value.toUpperCase();
                          setSelectedProduct((prev) => prev ? { ...prev, shelfCode } : prev);
                          setShelfSearch(shelfCode);
                        }}
                        onClick={() => openKeyboard({
                          title: 'Raf / Reyon Kodu Klavyesi',
                          value: selectedProduct.shelfCode || '',
                          mode: 'text',
                          onApply: (value) => {
                            const shelfCode = value.toUpperCase();
                            setSelectedProduct((prev) => prev ? { ...prev, shelfCode } : prev);
                            setShelfSearch(shelfCode);
                          },
                        })}
                        placeholder="O-3"
                        className={INPUT_BASE}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] font-semibold text-[#51607a]">Raf ara ve sec</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b97ac]" />
                        <input
                          value={shelfSearch}
                          onChange={(event) => {
                            setShelfSearch(event.target.value);
                            setShelfOptionsOpen(true);
                          }}
                          onClick={() => {
                            setShelfOptionsOpen(true);
                            openKeyboard({
                              title: 'Raf Arama Klavyesi',
                              value: shelfSearch,
                              mode: 'text',
                              onApply: (value) => {
                                setShelfSearch(value);
                                setShelfOptionsOpen(true);
                              },
                            });
                          }}
                          onFocus={() => {
                            setShelfOptionsOpen(true);
                            void searchShelves('');
                          }}
                          placeholder="Raf kodu veya raf adi yazin..."
                          className={`${INPUT_BASE} pl-9`}
                        />
                        {shelfOptionsOpen && (
                          <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-[#e7ebf2] bg-white shadow-xl">
                            <div className="sticky top-0 border-b border-[#eef1f6] bg-[#fafbfd] px-3 py-2 text-[11px] font-semibold text-[#8b97ac]">
                              {shelfSearching ? 'Raflar araniyor...' : `${shelves.length.toLocaleString('tr-TR')} raf listeleniyor`}
                            </div>
                            {!shelfSearching && shelves.length === 0 && (
                              <div className="px-3 py-4 text-[12.5px] text-[#8b97ac]">Raf bulunamadi.</div>
                            )}
                            {shelves.map((shelf) => (
                              <button
                                key={shelf.code}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectShelf(shelf)}
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px] transition hover:bg-[#eef2fa] ${
                                  selectedProduct.shelfCode === shelf.code ? 'bg-[#eef2fa] text-[#1c4585]' : 'text-[#14223b]'
                                }`}
                              >
                                <span className="font-semibold">{shelf.code}</span>
                                <span className="min-w-0 flex-1 truncate text-[11px] text-[#8b97ac]">{shelf.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-[#8b97ac]">
                        Kutu bosken tum aktif Mikro reyonlari listelenir; yazarak kod veya ad icinden arayabilirsiniz.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Birim kartlari */}
                <div className="grid gap-4 2xl:grid-cols-2">
                  {selectedProduct.units.map((unit) => {
                    const unitEnabled = isUnitEnabled(unit);
                    if (!unitEnabled) {
                      return (
                        <div key={unit.index} className="rounded-xl border border-dashed border-[#d8e0ec] bg-[#f9fbfe] p-4">
                          <div className="flex min-h-[210px] flex-col items-center justify-center text-center">
                            <div className="rounded-full bg-white p-3 text-[#8b97ac] shadow-sm">
                              <Plus className="h-6 w-6" />
                            </div>
                            <h3 className="mt-3 text-[15px] font-semibold text-[#14223b]">{unit.index}. Birim tanimli degil</h3>
                            <p className="mt-1 max-w-xs text-[11.5px] text-[#8b97ac]">
                              Mikroda bu birim bos. Kayda dahil etmek icin once yeni birim ekleyin.
                            </p>
                            <button
                              type="button"
                              onClick={() => addUnit(unit.index)}
                              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#1c4585]"
                            >
                              <Plus className="h-4 w-4" />
                              Yeni birim ekle
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={unit.index} className={`${CARD} p-4`}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-[15px] font-semibold text-[#14223b]">{unit.index}. Birim</h3>
                            <p className="text-[11.5px] text-[#8b97ac]">
                              {unit.index === 1 ? 'Ana birim' : 'Ek birim ve katsayi Mikro stok kartina yazilir'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-[#f4f6fa] px-3 py-2 text-right text-[11px] text-[#51607a]">
                            <div>M3: <span className="font-semibold text-[#14223b]">{formatNumber(unit.m3, 6)}</span></div>
                            <div>Desi: <span className="font-semibold text-[#14223b]">{formatNumber(unit.desi, 2)}</span></div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-[11.5px] font-semibold text-[#51607a]">
                            Birim Adi
                            <input
                              value={unit.name}
                              onChange={(event) => updateUnit(unit.index, { name: event.target.value })}
                              onClick={() => openKeyboard({
                                title: `${unit.index}. Birim Adi Klavyesi`,
                                value: unit.name,
                                mode: 'text',
                                onApply: (value) => updateUnit(unit.index, { name: value }),
                              })}
                              placeholder={unit.index === 2 ? 'KOLI' : 'PAKET'}
                              list="product-dimension-unit-names"
                              className={`${NUMERIC_BASE} uppercase`}
                            />
                          </label>
                          <label className="text-[11.5px] font-semibold text-[#51607a]">
                            Katsayi
                            <input
                              type="number"
                              step="0.000001"
                              value={unit.factor}
                              onChange={(event) => updateUnit(unit.index, { factor: toNumber(event.target.value) })}
                              onClick={() => openKeyboard({
                                title: `${unit.index}. Birim Katsayi Klavyesi`,
                                value: String(unit.factor || ''),
                                mode: 'number',
                                onApply: (value) => updateUnit(unit.index, { factor: toNumber(value) }),
                              })}
                              className={NUMERIC_BASE}
                            />
                          </label>
                          {unit.index > 1 && (
                            <label className="sm:col-span-2 text-[11.5px] font-semibold text-[#51607a]">
                              Katsayi Mantigi
                              <select
                                value={unit.factorDirection || 'larger'}
                                onChange={(event) => updateUnit(unit.index, { factorDirection: event.target.value as 'larger' | 'smaller' })}
                                className="mt-1 w-full rounded-lg border border-[#e3e8f0] bg-white px-3 py-2.5 text-[12.5px] font-semibold text-[#14223b] outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15"
                              >
                                <option value="larger">Buyuk birim: 1 {unit.name || `${unit.index}. birim`} = {formatNumber(Math.abs(unit.factor || 0), 4)} {selectedProduct.units[0]?.name || 'ana birim'} (Mikro: -{formatNumber(Math.abs(unit.factor || 0), 4)})</option>
                                <option value="smaller">Mikro pozitif/ters katsayi: Mikroya +{formatNumber(Math.abs(unit.factor || 0), 4)} yaz</option>
                              </select>
                              <div className="mt-1 text-[11px] font-normal text-[#8b97ac]">
                                Koli/paket/adet gibi buyuk birim ekliyorsaniz ilk secenek dogru: ornek 1 KOLI = 6 ADET icin katsayi 6 girilir, Mikroya -6 yazilir.
                              </div>
                            </label>
                          )}
                          <label className="text-[11.5px] font-semibold text-[#51607a]">
                            Kg
                            <input
                              type="number"
                              step="0.001"
                              value={unit.weightKg}
                              onChange={(event) => updateUnit(unit.index, { weightKg: toNumber(event.target.value) })}
                              onClick={() => openKeyboard({
                                title: `${unit.index}. Birim Kg Klavyesi`,
                                value: String(unit.weightKg || ''),
                                mode: 'number',
                                onApply: (value) => updateUnit(unit.index, { weightKg: toNumber(value) }),
                              })}
                              className={NUMERIC_BASE}
                            />
                          </label>
                          <label className="text-[11.5px] font-semibold text-[#51607a]">
                            En (cm)
                            <input
                              type="number"
                              step="0.1"
                              value={unit.widthCm}
                              onChange={(event) => updateUnit(unit.index, { widthCm: toNumber(event.target.value) })}
                              onClick={() => openKeyboard({
                                title: `${unit.index}. Birim En (cm) Klavyesi`,
                                value: String(unit.widthCm || ''),
                                mode: 'number',
                                onApply: (value) => updateUnit(unit.index, { widthCm: toNumber(value) }),
                              })}
                              className={NUMERIC_BASE}
                            />
                          </label>
                          <label className="text-[11.5px] font-semibold text-[#51607a]">
                            Boy (cm)
                            <input
                              type="number"
                              step="0.1"
                              value={unit.lengthCm}
                              onChange={(event) => updateUnit(unit.index, { lengthCm: toNumber(event.target.value) })}
                              onClick={() => openKeyboard({
                                title: `${unit.index}. Birim Boy (cm) Klavyesi`,
                                value: String(unit.lengthCm || ''),
                                mode: 'number',
                                onApply: (value) => updateUnit(unit.index, { lengthCm: toNumber(value) }),
                              })}
                              className={NUMERIC_BASE}
                            />
                          </label>
                          <label className="text-[11.5px] font-semibold text-[#51607a]">
                            Yukseklik (cm)
                            <input
                              type="number"
                              step="0.1"
                              value={unit.heightCm}
                              onChange={(event) => updateUnit(unit.index, { heightCm: toNumber(event.target.value) })}
                              onClick={() => openKeyboard({
                                title: `${unit.index}. Birim Yukseklik (cm) Klavyesi`,
                                value: String(unit.heightCm || ''),
                                mode: 'number',
                                onApply: (value) => updateUnit(unit.index, { heightCm: toNumber(value) }),
                              })}
                              className={NUMERIC_BASE}
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {unit.index !== 1 && (
                            <button
                              type="button"
                              onClick={() => copyUnit(1, unit.index)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#d8e0ec] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#51607a] transition hover:bg-[#f4f6fa]"
                            >
                              <Copy className="h-3 w-3" />
                              1. birimden kopyala
                            </button>
                          )}
                          {unit.factor < 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                              Negatif katsayi Mikroda ters yonlu cevrim olarak korunur.
                            </span>
                          )}
                          {unit.index > 1 && unit.name && unit.factor !== 0 && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                              Yaklasik: 1 {unit.name} = {formatNumber(Math.abs(unit.factor), 4)} {selectedProduct.units[0]?.name || 'ana birim'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Alt kaydet seridi (referans: kaydetmeden once onay) */}
                <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
                  <span className="text-[11.5px] text-[#8b97ac]">
                    Kaydetmeden once onay istenir · degisiklikler Mikro'ya mm olarak yazilir
                    {changedFields.length > 0 ? ` · ${changedFields.length} degisen alan` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={saveProduct}
                    disabled={!canSave}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#1c4585] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-b-transparent" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Kaydet (Onayla)
                  </button>
                </div>

                {/* Degisiklik gecmisi */}
                <div className={`${CARD} p-4`}>
                  <div className="flex items-center gap-2">
                    <History className="h-[18px] w-[18px] text-[#8b97ac]" />
                    <h2 className="text-[13px] font-semibold text-[#14223b]">Degisiklik Gecmisi</h2>
                  </div>
                  <div className="mt-3 space-y-2">
                    {history.length === 0 && <div className="text-[12.5px] text-[#8b97ac]">Henuz kayit yok.</div>}
                    {history.map((item) => (
                      <div key={item.id} className="flex items-start gap-2.5 rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-2.5 text-[12px]">
                        <span className="mt-1.5 h-[7px] w-[7px] flex-none rounded-full bg-[#15356b]" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[#14223b]">
                            {new Date(item.createdAt).toLocaleString('tr-TR')} · {item.changedByName || 'Bilinmeyen kullanici'}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#8b97ac]">
                            Onceki raf: {item.oldValues?.shelfCode || '-'} | Yeni raf: {item.newValues?.shelfCode || '-'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ekran klavyesi modali (numpad + tam klavye) — birebir korunmustur */}
      {keyboardTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1530]/45 p-4"
          onClick={() => setKeyboardTarget(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[#e7ebf2] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#eef1f6] px-5 py-3.5">
              <h3 className="text-[14px] font-semibold text-[#14223b]">{keyboardTarget.title || 'Ekran Klavyesi'}</h3>
              <button
                type="button"
                onClick={() => setKeyboardTarget(null)}
                className="rounded-md p-1 text-[#8b97ac] transition hover:bg-[#f4f6fa] hover:text-[#14223b]"
                aria-label="Kapat"
              >
                <Plus className="h-5 w-5 rotate-45" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <input
                autoFocus
                value={keyboardValue}
                onChange={(event) => setKeyboardValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyKeyboard();
                  }
                }}
                className="h-16 w-full rounded-xl border border-[#d8e0ec] px-4 text-2xl font-black text-[#14223b] outline-none focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15"
              />
              {keyboardTarget.mode === 'number' ? (
                <div className="grid grid-cols-3 gap-3">
                  {NUMPAD_KEYS.map((key) => (
                    <button
                      key={`num-${key}`}
                      type="button"
                      onClick={() => appendKeyboardKey(key)}
                      className="h-16 rounded-xl border border-[#d8e0ec] bg-white text-2xl font-black text-[#14223b] active:bg-[#eef2fa]"
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setKeyboardValue((prev) => prev.slice(0, -1))}
                    className="h-16 rounded-xl border border-amber-300 bg-amber-50 text-base font-black text-amber-700"
                  >
                    Sil
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeyboardValue('')}
                    className="h-16 rounded-xl border border-rose-300 bg-rose-50 text-base font-black text-rose-700"
                  >
                    Temizle
                  </button>
                  <button
                    type="button"
                    onClick={applyKeyboard}
                    className="h-16 rounded-xl border border-emerald-300 bg-emerald-50 text-base font-black text-emerald-700"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <>
                  {KEYBOARD_ROWS.map((row, rowIndex) => (
                    <div
                      key={`keyboard-row-${rowIndex}`}
                      className="grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                    >
                      {row.map((key) => (
                        <button
                          key={`${rowIndex}-${key}`}
                          type="button"
                          onClick={() => appendKeyboardKey(key)}
                          className="h-14 rounded-xl border border-[#d8e0ec] bg-white text-lg font-black text-[#14223b] active:bg-[#eef2fa] 2xl:h-16 2xl:text-xl"
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="grid grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => setKeyboardValue((prev) => prev.slice(0, -1))}
                      className="h-14 rounded-xl border border-amber-300 bg-amber-50 text-base font-black text-amber-700 2xl:h-16"
                    >
                      Geri Sil
                    </button>
                    <button
                      type="button"
                      onClick={() => appendKeyboardKey(' ')}
                      className="col-span-2 h-14 rounded-xl border border-[#d8e0ec] bg-white text-base font-black text-[#14223b] 2xl:h-16"
                    >
                      Bosluk
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeyboardValue('')}
                      className="h-14 rounded-xl border border-rose-300 bg-rose-50 text-base font-black text-rose-700 2xl:h-16"
                    >
                      Temizle
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="flex w-full items-center justify-between gap-3 border-t border-[#eef1f6] px-5 py-3.5">
              <button
                type="button"
                onClick={() => setKeyboardValue('')}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[#d8e0ec] bg-white px-6 text-[13px] font-medium text-[#51607a] transition hover:bg-[#f4f6fa]"
              >
                Temizle
              </button>
              <button
                type="button"
                onClick={applyKeyboard}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-[#15356b] px-10 text-[13px] font-semibold text-white transition hover:bg-[#1c4585]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
