'use client';

import toast from 'react-hot-toast';
import {
  Search,
  Maximize2,
  Minimize2,
  ScanLine,
  Package,
  Trash2,
  Minus,
  Plus,
  Delete,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils/format';
import {
  usePerakendeSatis,
  getUnitPrice,
  formatQty,
  KEYBOARD_ROWS,
  NUMPAD_KEYS,
  NUMPAD_NUMBER_KEYS,
  RETAIL_PRICE_LEVELS,
  type PriceLevel,
} from './usePerakendeSatis';

/**
 * Yeni gorunum: Perakende Satis.
 * Tum mantik usePerakendeSatis hook'undan gelir (Classic ile ayni). Sadece gorsel farkli.
 * Klasikteki HER veri/handler/buton/sekme/modal/durum/inline-form burada da var.
 */
export default function PerakendeSatisNew() {
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

  const ink = '#14223b';
  const inkMid = '#51607a';
  const inkSoft = '#8b97ac';
  const primary = '#15356b';
  const border = '#e7ebf2';
  const borderSoft = '#eef1f6';
  const emerald = '#0e7c66';

  // Ortak buton stilleri (yeni tasarim dilinde toggle/pill)
  const toggleStyle = (active: boolean): React.CSSProperties => ({
    height: 40,
    padding: '0 14px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: active ? `1px solid ${primary}` : '1px solid #d8e0ec',
    background: active ? primary : '#fff',
    color: active ? '#fff' : inkMid,
    whiteSpace: 'nowrap',
  });

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${border}`,
    borderRadius: 12,
  };

  return (
    <div
      style={{
        background: '#f4f6fa',
        minHeight: '100vh',
        padding: '0 16px 24px',
        ...(moduleFullscreen
          ? { position: 'fixed', inset: 0, zIndex: 120, overflowY: 'auto', padding: 16 }
          : {}),
      }}
    >
      {/* Baslik + Son Satis + Tam Ekran */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          margin: '22px 0 14px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: ink }}>
            Hizli Perakende Satis
          </h1>
          <div style={{ fontSize: 13, color: inkSoft, marginTop: 5 }}>
            Vergisiz satis · Seri: <b style={{ color: inkMid, fontWeight: 600 }}>FTR</b>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {lastSale && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 10,
                padding: '9px 14px',
                minWidth: 240,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: '#047857' }}>SON SATIS</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>{lastSale.invoiceNo}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#047857' }}>
                {lastSale.paymentLabel} · {lastSale.customerCode}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>{formatCurrency(lastSale.totalAmount)}</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setModuleFullscreen((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: moduleFullscreen ? '#fff' : primary,
              border: moduleFullscreen ? '1px solid #d8e0ec' : 'none',
              borderRadius: 8,
              padding: '9px 15px',
              fontSize: 12.5,
              fontWeight: 600,
              color: moduleFullscreen ? inkMid : '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {moduleFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {moduleFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 16, alignItems: 'start' }}>
        {/* SOL: Arama + kontroller + urun listesi */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Kontrol karti (sticky) */}
          <div
            style={{
              ...cardStyle,
              padding: 14,
              position: 'sticky',
              top: moduleFullscreen ? 8 : 76,
              zIndex: 20,
            }}
          >
            {/* Arama satiri + Depo + Stok + Odeme + Barkod */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 13 }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 240,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  height: 48,
                  border: `2px solid ${primary}`,
                  borderRadius: 10,
                  padding: '0 14px',
                }}
              >
                {isBarcodeMode ? (
                  <ScanLine size={20} stroke={primary} />
                ) : (
                  <Search size={20} stroke={primary} />
                )}
                <input
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
                  placeholder="Urun kodu, isim veya barkod ara…"
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'none',
                    outline: 'none',
                    fontSize: 15,
                    color: ink,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Depo pill grup */}
              <div style={{ display: 'inline-flex', background: '#f1f4f9', borderRadius: 8, padding: 3, gap: 3 }}>
                <button type="button" onClick={() => setSelectedWarehouse(1)} style={pillSegStyle(selectedWarehouse === 1)}>
                  Merkez
                </button>
                <button type="button" onClick={() => setSelectedWarehouse(6)} style={pillSegStyle(selectedWarehouse === 6)}>
                  Topca
                </button>
                <button type="button" onClick={() => setSelectedWarehouse(0)} style={pillSegStyle(selectedWarehouse === 0)}>
                  Tum
                </button>
              </div>

              {/* Stok toggle */}
              <button type="button" onClick={() => setOnlyInStock((prev) => !prev)} style={toggleStyle(onlyInStock)}>
                {onlyInStock ? 'Sadece Stoktakiler' : 'Tum Urunler'}
              </button>

              {/* Odeme pill grup */}
              <div style={{ display: 'inline-flex', background: '#f1f4f9', borderRadius: 8, padding: 3, gap: 3 }}>
                <button type="button" onClick={() => setPaymentType('CASH')} style={pillSegStyle(paymentType === 'CASH')}>
                  Nakit
                </button>
                <button type="button" onClick={() => setPaymentType('CARD')} style={pillSegStyle(paymentType === 'CARD')}>
                  Kart
                </button>
              </div>

              {/* Barkod odak toggle */}
              <button
                type="button"
                onClick={() => setIsBarcodeMode((prev) => !prev)}
                style={{ ...toggleStyle(isBarcodeMode), display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <ScanLine size={14} />
                {isBarcodeMode ? 'Barkod Odak Acik' : 'Barkod Odak Kapali'}
              </button>
            </div>

            {/* Fiyat Listesi P1-P5 */}
            <div style={{ border: `1px solid ${borderSoft}`, borderRadius: 10, padding: 11 }}>
              <div style={{ fontSize: 11, color: inkSoft, marginBottom: 8 }}>Fiyat Listesi</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {RETAIL_PRICE_LEVELS.map((level) => {
                  const active = priceLevel === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setPriceLevel(level as PriceLevel)}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        border: active ? `1px solid ${primary}` : '1px solid #e7ebf2',
                        background: active ? primary : '#f4f6fa',
                        color: active ? '#fff' : ink,
                      }}
                    >
                      P{level}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: inkSoft, marginTop: 8 }}>
                P seviyesi sadece yeni eklenen urunlerin ilk fiyatini belirler. Sepette duzenlenebilir.
              </div>
            </div>
          </div>

          {/* Urun listesi karti */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '11px 16px',
                borderBottom: `1px solid ${borderSoft}`,
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>Urunler</span>
              <span style={{ fontSize: 11.5, color: inkSoft }}>
                Depo: <b style={{ color: inkMid, fontWeight: 600 }}>{selectedWarehouseLabel}</b> · Fiyat:{' '}
                <b style={{ color: inkMid, fontWeight: 600 }}>Perakende-{priceLevel}</b>
              </span>
            </div>

            {loadingProducts ? (
              <div style={{ padding: 28, textAlign: 'center', color: inkSoft, fontSize: 13, fontWeight: 600 }}>
                Yukleniyor…
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 0,
                  maxHeight: '69vh',
                  overflowY: 'auto',
                }}
              >
                {products.map((product) => {
                  const price = getUnitPrice(product, priceLevel);
                  return (
                    <button
                      key={product.productCode}
                      type="button"
                      onClick={() => addToCart(product)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        background: '#fff',
                        border: 'none',
                        borderRight: `1px solid #f1f4f9`,
                        borderBottom: `1px solid #f1f4f9`,
                        padding: '12px 13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f6f8fc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.productName}
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 7,
                            objectFit: 'cover',
                            border: `1px solid ${borderSoft}`,
                            flex: 'none',
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 7,
                            background: '#fafbfd',
                            border: '1px dashed #d3deef',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 'none',
                            fontSize: 8,
                            color: '#9aa6b8',
                            textAlign: 'center',
                            lineHeight: 1.1,
                          }}
                        >
                          Gorsel Yok
                        </span>
                      )}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: 12,
                            fontWeight: 600,
                            color: ink,
                            lineHeight: 1.3,
                          }}
                        >
                          {product.productName}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 10,
                            color: inkSoft,
                            fontFamily: "'Roboto Mono', monospace",
                            marginTop: 2,
                          }}
                        >
                          {product.productCode}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 6,
                            marginTop: 5,
                          }}
                        >
                          <span style={{ fontSize: 10, color: inkSoft }}>
                            Stok: {formatQty(product.stockSelected)} {product.unit}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: emerald }}>{formatCurrency(price)}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!products.length && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      textAlign: 'center',
                      padding: '40px 0',
                      color: inkSoft,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Urun bulunamadi
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SAG: Sepet + Hizli Miktar (sticky) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            position: 'sticky',
            top: moduleFullscreen ? 8 : 76,
            height: 'fit-content',
          }}
        >
          {/* Sepet karti */}
          <div style={{ ...cardStyle, padding: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: ink }}>Sepet</span>
              <button
                type="button"
                onClick={clearCart}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'none',
                  border: '1px solid #fecaca',
                  borderRadius: 7,
                  padding: '4px 11px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#b91c1c',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Trash2 size={13} />
                Temizle
              </button>
            </div>

            {/* Sepet satirlari */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto', marginBottom: 13 }}>
              {cartItems.map((item) => {
                const selectedPriceLevel = getSelectedPriceLevel(item);
                return (
                  <div key={item.productCode} style={{ border: `1px solid ${borderSoft}`, borderRadius: 9, padding: 10 }}>
                    <div
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: ink,
                        lineHeight: 1.3,
                      }}
                    >
                      {item.productName}
                    </div>
                    <div style={{ fontSize: 10, color: inkSoft, fontFamily: "'Roboto Mono', monospace", marginTop: 2 }}>
                      {item.productCode}
                    </div>

                    {/* P1-P6 sepet ici */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginTop: 8 }}>
                      {RETAIL_PRICE_LEVELS.map((level) => {
                        const value = item.priceOptions[level as PriceLevel];
                        const disabled = !Number.isFinite(value) || value <= 0;
                        const active = selectedPriceLevel === (level as PriceLevel);
                        return (
                          <button
                            key={`${item.productCode}-p${level}`}
                            type="button"
                            onClick={() => applyCartPriceListLevel(item.productCode, level as PriceLevel)}
                            disabled={disabled}
                            style={{
                              height: 26,
                              borderRadius: 6,
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: 'inherit',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              opacity: disabled ? 0.45 : 1,
                              border: active ? `1px solid ${primary}` : '1px solid #d8e0ec',
                              background: active ? primary : '#fff',
                              color: active ? '#fff' : inkMid,
                            }}
                          >
                            P{level}
                          </button>
                        );
                      })}
                    </div>

                    {/* Miktar stepper + birim fiyat / tutar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type="button" onClick={() => changeCartQty(item.productCode, -1)} style={stepBtnStyle}>
                          <Minus size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setQtyEditTarget({
                              productCode: item.productCode,
                              value: formatQty(item.quantity),
                            })
                          }
                          style={{
                            height: 34,
                            minWidth: 70,
                            padding: '0 8px',
                            borderRadius: 7,
                            background: '#f4f6fa',
                            border: `1px solid ${borderSoft}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            fontWeight: 700,
                            color: ink,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {formatQty(item.quantity)}
                        </button>
                        <button type="button" onClick={() => changeCartQty(item.productCode, 1)} style={stepBtnStyle}>
                          <Plus size={15} />
                        </button>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setPriceEditTarget({
                              productCode: item.productCode,
                              value: String(Number(item.unitPrice.toFixed(4))),
                            })
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontSize: 11,
                            color: inkSoft,
                            textDecoration: 'underline',
                            textUnderlineOffset: 2,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {formatCurrency(item.unitPrice)} / {item.unit}
                        </button>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: ink }}>
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!cartItems.length && (
                <div
                  style={{
                    border: '1px dashed #d3deef',
                    borderRadius: 10,
                    padding: 26,
                    textAlign: 'center',
                    fontSize: 12.5,
                    color: '#9aa6b8',
                  }}
                >
                  Sepet bos
                </div>
              )}
            </div>

            {/* Ozet */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: inkSoft }}>Kalem</span>
                <b style={{ color: ink, fontWeight: 600 }}>{totalLineCount}</b>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: inkSoft }}>Miktar</span>
                <b style={{ color: ink, fontWeight: 600 }}>{formatQty(totalQuantity)}</b>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  borderTop: `1px solid ${borderSoft}`,
                  paddingTop: 9,
                  marginTop: 2,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: ink }}>Toplam</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: ink }}>{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            {/* Satisi Tamamla */}
            <button
              type="button"
              onClick={createSale}
              disabled={creatingSale || !cartItems.length}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 9,
                padding: 13,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: creatingSale || !cartItems.length ? 'not-allowed' : 'pointer',
                background: creatingSale || !cartItems.length ? '#eef1f6' : emerald,
                color: creatingSale || !cartItems.length ? '#9aa6b8' : '#fff',
              }}
            >
              {creatingSale ? 'Isleniyor…' : 'Satisi Tamamla (FTR)'}
            </button>
          </div>

          {/* Hizli Miktar numpad */}
          <div style={{ ...cardStyle, padding: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: ink }}>Hizli Miktar</span>
              <span style={{ fontSize: 10.5, color: inkSoft }}>Secili: {formatQty(getQuickQuantity())}</span>
            </div>
            <div
              style={{
                width: '100%',
                minHeight: 40,
                border: '1px solid #d8e0ec',
                borderRadius: 8,
                padding: '0 11px',
                display: 'flex',
                alignItems: 'center',
                fontSize: 15,
                fontWeight: 600,
                color: ink,
                fontFamily: 'inherit',
                marginBottom: 9,
              }}
            >
              {quickQtyInput || '1'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 9 }}>
              {NUMPAD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQuickQtyInput((prev) => `${prev}${key}`)}
                  style={numpadKeyStyle}
                >
                  {key}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuickQtyInput((prev) => prev.slice(0, -1))}
                style={{
                  height: 42,
                  background: '#fff',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#b45309',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Delete size={14} />
                Sil
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <button
                type="button"
                onClick={() => setQuickQtyInput('')}
                style={{
                  height: 40,
                  background: '#fff',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#b91c1c',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Temizle
              </button>
              <button
                type="button"
                onClick={() => {
                  const qty = getQuickQuantity();
                  toast.success(`Secili miktar: ${formatQty(qty)}`);
                }}
                style={{
                  height: 40,
                  background: emerald,
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Urun Arama Klavyesi Modal */}
      <Modal
        isOpen={searchKeyboardOpen}
        onClose={() => setSearchKeyboardOpen(false)}
        title="Urun Arama Klavyesi"
        size="xl"
        footer={
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button type="button" onClick={() => setSearchKeyboardValue('')} style={modalSecondaryBtn}>
              Temizle
            </button>
            <button type="button" onClick={applySearchKeyboard} style={modalPrimaryBtn}>
              OK
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            autoFocus
            value={searchKeyboardValue}
            onChange={(event) => setSearchKeyboardValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applySearchKeyboard();
              }
            }}
            style={{
              height: 52,
              border: '1px solid #d8e0ec',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 20,
              fontWeight: 600,
              color: ink,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div
              key={`row-${rowIndex}`}
              style={{ display: 'grid', gap: 8, gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
            >
              {row.map((key) => (
                <button
                  key={`${rowIndex}-${key}`}
                  type="button"
                  onClick={() => setSearchKeyboardValue((prev) => `${prev}${key}`)}
                  style={kbdKeyStyle}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSearchKeyboardValue((prev) => prev.slice(0, -1))}
              style={{ ...kbdKeyStyle, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}
            >
              Geri Sil
            </button>
            <button
              type="button"
              onClick={() => setSearchKeyboardValue((prev) => `${prev} `)}
              style={{ ...kbdKeyStyle, gridColumn: 'span 2' }}
            >
              Bosluk
            </button>
            <button
              type="button"
              onClick={() => setSearchKeyboardValue('')}
              style={{ ...kbdKeyStyle, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      {/* Miktar Duzenle Modal */}
      <Modal
        isOpen={Boolean(qtyEditTarget)}
        onClose={() => setQtyEditTarget(null)}
        title="Miktar Duzenle"
        size="sm"
        footer={
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button type="button" onClick={() => setQtyEditTarget(null)} style={modalSecondaryBtn}>
              Iptal
            </button>
            <button type="button" onClick={applyQtyEdit} style={modalPrimaryBtn}>
              OK
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            value={qtyEditTarget?.value || ''}
            readOnly
            style={{
              height: 52,
              border: '1px solid #d8e0ec',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 20,
              fontWeight: 700,
              color: ink,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`qty-${key}`}
                type="button"
                onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                style={kbdKeyStyle}
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              style={{ ...kbdKeyStyle, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}
            >
              Sil
            </button>
            <button
              type="button"
              onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              style={{ ...kbdKeyStyle, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      {/* Birim Fiyat Duzenle Modal */}
      <Modal
        isOpen={Boolean(priceEditTarget)}
        onClose={() => setPriceEditTarget(null)}
        title="Birim Fiyat Duzenle"
        size="sm"
        footer={
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button type="button" onClick={() => setPriceEditTarget(null)} style={modalSecondaryBtn}>
              Iptal
            </button>
            <button type="button" onClick={applyPriceEdit} style={modalPrimaryBtn}>
              OK
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            value={priceEditTarget?.value || ''}
            readOnly
            style={{
              height: 52,
              border: '1px solid #d8e0ec',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 20,
              fontWeight: 700,
              color: ink,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`price-${key}`}
                type="button"
                onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                style={kbdKeyStyle}
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              style={{ ...kbdKeyStyle, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}
            >
              Sil
            </button>
            <button
              type="button"
              onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              style={{ ...kbdKeyStyle, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---- Paylasilan inline stiller (yeni tasarim dili) ---- */
const pillSegStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px',
  fontSize: 12.5,
  fontWeight: active ? 600 : 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: active ? '1px solid #d3deef' : 'none',
  borderRadius: 6,
  background: active ? '#fff' : 'transparent',
  color: active ? '#15356b' : '#8b97ac',
});

const stepBtnStyle: React.CSSProperties = {
  height: 34,
  width: 34,
  borderRadius: 7,
  border: '1px solid #d8e0ec',
  background: '#fff',
  color: '#14223b',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

const numpadKeyStyle: React.CSSProperties = {
  height: 42,
  background: '#f4f6fa',
  border: '1px solid #e7ebf2',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  color: '#14223b',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const kbdKeyStyle: React.CSSProperties = {
  height: 48,
  borderRadius: 8,
  border: '1px solid #e7ebf2',
  background: '#f4f6fa',
  fontSize: 15,
  fontWeight: 600,
  color: '#14223b',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const modalPrimaryBtn: React.CSSProperties = {
  background: '#15356b',
  border: 'none',
  borderRadius: 8,
  padding: '9px 18px',
  fontSize: 12.5,
  fontWeight: 600,
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const modalSecondaryBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d8e0ec',
  borderRadius: 8,
  padding: '9px 18px',
  fontSize: 12.5,
  fontWeight: 600,
  color: '#51607a',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
