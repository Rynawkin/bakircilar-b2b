'use client';

/**
 * StockFamilySuggestion — teklif/siparis kaleminde stok ailesi yonlendirme uyarisi.
 *
 * Izole bilesen: bir kalemin urun kodu + (base birim) miktari verilir; arka planda
 * /admin/stock-family/suggestions cagrilir. Iki uyari:
 *  - INSUFFICIENT  : girilen urun yetmiyor -> ailedeki yeterli urunle "Degistir".
 *  - OFFLOAD_EXCESS: ailede yatan stok var -> "Tamamini aktar" veya "Bol ve uygula".
 *
 * Apply mantigini PARENT yapar (kalem swap/split = urun ekleme boru hattini kullanir):
 *  - onSwap(recommended): bu kalemin urununu onerilenle degistir.
 *  - onSplit(recommended): bu kalemin miktarini fromEntered'a indir + onerileni fromAlt ile yeni kalem ekle.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Recycle, X } from 'lucide-react';
import adminApi from '@/lib/api/admin';

interface Recommended {
  productCode: string;
  productName: string;
  unit?: string;
  available?: number;
  excess?: number;
  canCoverFull?: boolean;
  fromAlt?: number;
  fromEntered?: number;
}
interface Warning {
  type: 'INSUFFICIENT' | 'OFFLOAD_EXCESS';
  message: string;
  recommended: Recommended;
}

interface Props {
  productCode?: string;
  /** Kalemin ANA/BASE birim cinsinden miktari (parent cevirir). */
  baseQuantity: number;
  /** Teklifin DIGER satirlarindaki urun kodlari; motor bunlari aday yapmaz (oneri dongusunu keser). */
  excludeCodes?: string[];
  /** true ise oneri kabul edilmis demektir: fetch yapilmaz, hicbir sey render edilmez. */
  suppressed?: boolean;
  onSwap: (rec: Recommended) => void;
  onSplit: (rec: Recommended) => void;
}

export function StockFamilySuggestion({
  productCode,
  baseQuantity,
  excludeCodes,
  suppressed,
  onSwap,
  onSplit,
}: Props) {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const reqRef = useRef(0);

  // Dizi kimligi her render'da degisebilir; useEffect bagimliligi icin stabil string turevi kullan.
  const excludeKey = (excludeCodes || []).join('|');

  // X ile yoksayma yalnizca BU satirin urunu/miktari degisince sifirlanir;
  // excludeKey (diger satirlarin degisimi) kullanicinin kapattigi uyariyi geri acmamali.
  useEffect(() => {
    setDismissed(false);
  }, [productCode, baseQuantity, suppressed]);

  useEffect(() => {
    if (suppressed || !productCode || !baseQuantity || baseQuantity <= 0) {
      setWarnings([]);
      return;
    }
    // Controller en fazla 200 kod kabul ediyor; buyuk tekliflerde 400 yememek icin kirp.
    const codes = (excludeKey ? excludeKey.split('|') : []).slice(0, 200);
    const myReq = ++reqRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await adminApi.getStockFamilySuggestions(productCode, baseQuantity, codes);
        if (reqRef.current === myReq) setWarnings(res.warnings || []);
      } catch {
        if (reqRef.current === myReq) setWarnings([]);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [productCode, baseQuantity, suppressed, excludeKey]);

  // Bastirilmis/yuklenirken/uyari yokken sessiz kal (satir basina gurultu olmasin).
  if (suppressed || dismissed || warnings.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1.5">
      {warnings.map((w, i) => {
        const isShort = w.type === 'INSUFFICIENT';
        const rec = w.recommended;
        const partial = !isShort && (rec.fromEntered || 0) > 0;
        return (
          <div
            key={i}
            className={`rounded-lg border px-2.5 py-2 text-[12px] ${
              isShort ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2">
              {isShort ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              ) : (
                <Recycle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="leading-snug">{w.message}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {isShort ? (
                    <button
                      type="button"
                      onClick={() => onSwap(rec)}
                      className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                    >
                      {rec.productName} ile değiştir
                    </button>
                  ) : partial ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onSplit(rec)}
                        className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                      >
                        Böl: {rec.fromAlt} {rec.unit || 'adet'} yatan stoktan, {rec.fromEntered} mevcuttan
                      </button>
                      <button
                        type="button"
                        onClick={() => onSwap(rec)}
                        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
                      >
                        Tamamını aktar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSwap(rec)}
                      className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                    >
                      Tamamını {rec.productName}'den gir
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="shrink-0 rounded p-0.5 text-current/60 hover:bg-black/5"
                aria-label="Yoksay"
                title="Bu uyariyi yoksay"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default StockFamilySuggestion;
