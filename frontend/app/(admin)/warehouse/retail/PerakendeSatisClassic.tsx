'use client';

import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils/format';
import {
  usePerakendeSatis,
  getUnitPrice,
  formatQty,
  KEYBOARD_ROWS,
  NUMPAD_KEYS,
  NUMPAD_NUMBER_KEYS,
  type PriceLevel,
} from './usePerakendeSatis';

/**
 * Klasik (mevcut) Perakende Satis gorunumu.
 * JSX, eski page.tsx ile BIRE BIR aynidir; tum mantik usePerakendeSatis hook'undan gelir.
 */
export default function PerakendeSatisClassic() {
  const {
    searchInputRef,
    searchText,
    setSearchText,
    products,
    loadingProducts,
    priceLevel,
    setPriceLevel,
    paymentType,
    setPaymentType,
    selectedWarehouse,
    setSelectedWarehouse,
    onlyInStock,
    setOnlyInStock,
    isBarcodeMode,
    setIsBarcodeMode,
    moduleFullscreen,
    setModuleFullscreen,
    cartItems,
    totalAmount,
    totalLineCount,
    totalQuantity,
    creatingSale,
    lastSale,
    quickQtyInput,
    setQuickQtyInput,
    getQuickQuantity,
    searchKeyboardOpen,
    setSearchKeyboardOpen,
    searchKeyboardValue,
    setSearchKeyboardValue,
    openSearchKeyboard,
    applySearchKeyboard,
    qtyEditTarget,
    setQtyEditTarget,
    priceEditTarget,
    setPriceEditTarget,
    applyQtyEdit,
    applyPriceEdit,
    addToCart,
    handleBarcodeScanSubmit,
    changeCartQty,
    applyCartPriceListLevel,
    getSelectedPriceLevel,
    clearCart,
    createSale,
    selectedWarehouseLabel,
  } = usePerakendeSatis();

  return (
    <div
      className={`space-y-3 p-3 md:p-4 bg-slate-50 min-h-screen ${
        moduleFullscreen ? 'fixed inset-0 z-[120] overflow-y-auto' : ''
      }`}
    >
      <Card className="p-3 md:p-4 border-2 border-slate-200">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Hizli Perakende Satis</h1>
              <p className="text-sm md:text-base text-slate-600">
                Vergisiz satis. Seri: <span className="font-black">FTR</span>
              </p>
            </div>
            {lastSale && (
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 min-w-[280px]">
                <p className="text-xs font-bold text-emerald-700">SON SATIS</p>
                <p className="text-lg font-black text-emerald-900">{lastSale.invoiceNo}</p>
                <p className="text-sm font-semibold text-emerald-800">
                  {lastSale.paymentLabel} / {lastSale.customerCode}
                </p>
                <p className="text-sm font-bold text-emerald-800">{formatCurrency(lastSale.totalAmount)}</p>
              </div>
            )}
            <Button
              onClick={() => setModuleFullscreen((prev) => !prev)}
              variant={moduleFullscreen ? 'secondary' : 'primary'}
              className="h-11 px-4 text-sm font-black"
            >
              {moduleFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
            </Button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3">
            <div className="space-y-3">
              <Card
                className={`p-3 border border-slate-200 lg:sticky z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 ${
                  moduleFullscreen ? 'lg:top-2' : 'lg:top-20'
                }`}
              >
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-2">
                    <div>
                      <Input
                        ref={searchInputRef}
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        onFocus={openSearchKeyboard}
                        onClick={openSearchKeyboard}
                        onBlur={() => {
                          if (!isBarcodeMode) return;
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && isBarcodeMode) {
                            event.preventDefault();
                            handleBarcodeScanSubmit(event.currentTarget.value);
                          }
                        }}
                        placeholder="Urun kodu, isim veya barkod ara..."
                        className="h-16 text-2xl font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => setSelectedWarehouse(1)}
                        className="h-11 text-sm font-black"
                        variant={selectedWarehouse === 1 ? 'primary' : 'secondary'}
                      >
                        Merkez
                      </Button>
                      <Button
                        onClick={() => setSelectedWarehouse(6)}
                        className="h-11 text-sm font-black"
                        variant={selectedWarehouse === 6 ? 'primary' : 'secondary'}
                      >
                        Topca
                      </Button>
                      <Button
                        onClick={() => setSelectedWarehouse(0)}
                        className="h-11 text-sm font-black"
                        variant={selectedWarehouse === 0 ? 'primary' : 'secondary'}
                      >
                        Tum
                      </Button>
                    </div>

                    <Button
                      onClick={() => setOnlyInStock((prev) => !prev)}
                      className="h-11 text-sm font-black"
                      variant={onlyInStock ? 'primary' : 'secondary'}
                    >
                      {onlyInStock ? 'Sadece Stoktakiler' : 'Tum Urunler'}
                    </Button>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => setPaymentType('CASH')}
                        className="h-11 text-sm font-black"
                        variant={paymentType === 'CASH' ? 'primary' : 'secondary'}
                      >
                        Nakit
                      </Button>
                      <Button
                        onClick={() => setPaymentType('CARD')}
                        className="h-11 text-sm font-black"
                        variant={paymentType === 'CARD' ? 'primary' : 'secondary'}
                      >
                        Kart
                      </Button>
                    </div>

                    <Button
                      onClick={() => setIsBarcodeMode((prev) => !prev)}
                      className="h-11 text-xs font-black"
                      variant={isBarcodeMode ? 'primary' : 'secondary'}
                    >
                      {isBarcodeMode ? 'Barkod Odak Acik' : 'Barkod Odak Kapali'}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-2">
                    <p className="text-xs font-bold text-slate-500 mb-1">Fiyat Listesi</p>
                    <div className="grid grid-cols-5 gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          onClick={() => setPriceLevel(level as PriceLevel)}
                          className={`h-11 rounded-lg border-2 text-sm font-black ${
                            priceLevel === level
                              ? 'border-cyan-600 bg-cyan-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          P{level}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      P seviye sadece yeni eklenen urunlerin ilk fiyatini belirler. Sepette duzenlenebilir.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-2 border border-slate-200">
                <div className="flex items-center justify-between px-2 pb-2">
                  <p className="text-sm font-bold text-slate-600">Urunler</p>
                  <p className="text-xs font-semibold text-slate-500">
                    Depo: {selectedWarehouseLabel} | Fiyat: Perakende-{priceLevel}
                  </p>
                </div>
                {loadingProducts ? (
                  <div className="p-6 text-center text-slate-500 text-sm font-semibold">Yukleniyor...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 max-h-[69vh] overflow-y-auto pr-1">
                    {products.map((product) => {
                      const price = getUnitPrice(product, priceLevel);
                      return (
                        <button
                          key={product.productCode}
                          onClick={() => addToCart(product)}
                          className="text-left rounded-xl border border-slate-200 bg-white p-2 hover:border-cyan-400 transition-colors"
                        >
                          <div className="flex gap-2">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.productName}
                                className="h-16 w-16 rounded-md object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="h-16 w-16 rounded-md border border-dashed border-slate-300 bg-slate-100 shrink-0 flex items-center justify-center text-[9px] font-bold text-slate-500 text-center px-1">
                                Gorsel Yok
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-black text-slate-900 line-clamp-2">{product.productName}</p>
                              <p className="text-[11px] font-semibold text-slate-500">{product.productCode}</p>
                              <div className="mt-1.5 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-slate-600">
                                  Stok: {formatQty(product.stockSelected)} {product.unit}
                                </span>
                                <span className="text-base font-black text-cyan-700">{formatCurrency(price)}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {!products.length && (
                      <div className="col-span-full text-center py-10 text-slate-500 text-sm font-semibold">Urun bulunamadi</div>
                    )}
                  </div>
                )}
              </Card>
            </div>

            <div className={`space-y-3 h-fit xl:sticky ${moduleFullscreen ? 'xl:top-2' : 'xl:top-20'}`}>
              <Card className="p-3 border-2 border-slate-300">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-900">Sepet</h2>
                    <button
                      onClick={clearCart}
                      className="h-8 px-2.5 rounded-lg border border-rose-300 text-rose-700 text-xs font-bold"
                    >
                      Temizle
                    </button>
                  </div>

                  <div className="max-h-[52vh] overflow-y-auto space-y-1.5 pr-1">
                    {cartItems.map((item) => {
                      const selectedPriceLevel = getSelectedPriceLevel(item);
                      return (
                      <div key={item.productCode} className="rounded-lg border border-slate-200 bg-white p-2">
                        <p className="text-[13px] font-black text-slate-900 line-clamp-2">{item.productName}</p>
                        <p className="text-[11px] text-slate-500">{item.productCode}</p>
                        <div className="mt-1 grid grid-cols-5 gap-1">
                          {[1, 2, 3, 4, 5].map((level) => {
                            const value = item.priceOptions[level as PriceLevel];
                            const disabled = !Number.isFinite(value) || value <= 0;
                            const active = selectedPriceLevel === (level as PriceLevel);
                            return (
                              <button
                                key={`${item.productCode}-p${level}`}
                                onClick={() => applyCartPriceListLevel(item.productCode, level as PriceLevel)}
                                disabled={disabled}
                                className={`h-7 rounded-md border text-[10px] font-black ${
                                  active
                                    ? 'border-cyan-600 bg-cyan-600 text-white'
                                    : 'border-slate-300 bg-white text-slate-700'
                                }`}
                              >
                                P{level}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => changeCartQty(item.productCode, -1)}
                              className="h-9 w-9 rounded-md border border-slate-300 text-lg font-black"
                            >
                              -
                            </button>
                            <button
                              onClick={() =>
                                setQtyEditTarget({
                                  productCode: item.productCode,
                                  value: formatQty(item.quantity),
                                })
                              }
                              className="h-9 min-w-[74px] px-2 rounded-md bg-slate-100 flex items-center justify-center text-sm font-black"
                            >
                              {formatQty(item.quantity)}
                            </button>
                            <button
                              onClick={() => changeCartQty(item.productCode, 1)}
                              className="h-9 w-9 rounded-md border border-slate-300 text-lg font-black"
                            >
                              +
                            </button>
                          </div>
                          <div className="text-right">
                            <button
                              onClick={() =>
                                setPriceEditTarget({
                                  productCode: item.productCode,
                                  value: String(Number(item.unitPrice.toFixed(4))),
                                })
                              }
                              className="text-[11px] text-slate-500 underline underline-offset-2"
                            >
                              {formatCurrency(item.unitPrice)} / {item.unit}
                            </button>
                            <p className="text-sm font-black text-slate-900">{formatCurrency(item.unitPrice * item.quantity)}</p>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                    {!cartItems.length && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500 text-sm font-semibold">
                        Sepet bos
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
                    <div className="flex justify-between text-sm font-semibold text-slate-700">
                      <span>Kalem</span>
                      <span>{totalLineCount}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-slate-700">
                      <span>Miktar</span>
                      <span>{formatQty(totalQuantity)}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-lg font-black text-slate-900">
                      <span>Toplam</span>
                      <span>{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>

                  <Button
                    onClick={createSale}
                    disabled={creatingSale || !cartItems.length}
                    className="h-12 text-base font-black w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300"
                  >
                    {creatingSale ? 'Isleniyor...' : 'Satisi Tamamla (FTR)'}
                  </Button>
                </div>
              </Card>

              <Card className="p-2.5 border border-slate-200">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-slate-500">Hizli Miktar</p>
                  <span className="text-[11px] font-bold text-cyan-700">Secili: {formatQty(getQuickQuantity())}</span>
                </div>
                <div className="mt-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-sm font-black text-slate-900 min-h-[32px]">
                  {quickQtyInput || '1'}
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {NUMPAD_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => setQuickQtyInput((prev) => `${prev}${key}`)}
                      className="h-8 rounded-md border border-slate-300 bg-white text-xs font-black"
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    onClick={() => setQuickQtyInput((prev) => prev.slice(0, -1))}
                    className="h-8 rounded-md border border-amber-300 bg-amber-50 text-[10px] font-black text-amber-700"
                  >
                    Sil
                  </button>
                  <button
                    onClick={() => setQuickQtyInput('')}
                    className="h-8 rounded-md border border-rose-300 bg-rose-50 text-[10px] font-black text-rose-700"
                  >
                    Temizle
                  </button>
                  <button
                    onClick={() => {
                      const qty = getQuickQuantity();
                      toast.success(`Secili miktar: ${formatQty(qty)}`);
                    }}
                    className="col-span-2 h-8 rounded-md border border-emerald-300 bg-emerald-50 text-[10px] font-black text-emerald-700"
                  >
                    Uygula
                  </button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={searchKeyboardOpen}
        onClose={() => setSearchKeyboardOpen(false)}
        title="Urun Arama Klavyesi"
        size="xl"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setSearchKeyboardValue('')}>Temizle</Button>
            <Button
              onClick={applySearchKeyboard}
            >
              OK
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={searchKeyboardValue}
            onChange={(event) => setSearchKeyboardValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applySearchKeyboard();
              }
            }}
            className="h-14 text-xl font-bold"
          />
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div
              key={`row-${rowIndex}`}
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
            >
              {row.map((key) => (
                <button
                  key={`${rowIndex}-${key}`}
                  onClick={() => setSearchKeyboardValue((prev) => `${prev}${key}`)}
                  className="h-12 rounded-lg border border-slate-300 bg-white text-base font-black"
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSearchKeyboardValue((prev) => prev.slice(0, -1))}
              className="h-12 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Geri Sil
            </button>
            <button
              onClick={() => setSearchKeyboardValue((prev) => `${prev} `)}
              className="col-span-2 h-12 rounded-lg border border-slate-300 bg-white text-sm font-black"
            >
              Bosluk
            </button>
            <button
              onClick={() => setSearchKeyboardValue('')}
              className="h-12 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(qtyEditTarget)}
        onClose={() => setQtyEditTarget(null)}
        title="Miktar Duzenle"
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setQtyEditTarget(null)}>Iptal</Button>
            <Button onClick={applyQtyEdit}>OK</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={qtyEditTarget?.value || ''} readOnly className="h-14 text-xl font-black" />
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`qty-${key}`}
                onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                className="h-12 rounded-lg border border-slate-300 bg-white text-lg font-black"
              >
                {key}
              </button>
            ))}
            <button
              onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              className="h-12 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Sil
            </button>
            <button
              onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              className="h-12 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(priceEditTarget)}
        onClose={() => setPriceEditTarget(null)}
        title="Birim Fiyat Duzenle"
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setPriceEditTarget(null)}>Iptal</Button>
            <Button onClick={applyPriceEdit}>OK</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={priceEditTarget?.value || ''} readOnly className="h-14 text-xl font-black" />
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`price-${key}`}
                onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                className="h-12 rounded-lg border border-slate-300 bg-white text-lg font-black"
              >
                {key}
              </button>
            ))}
            <button
              onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              className="h-12 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Sil
            </button>
            <button
              onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              className="h-12 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
