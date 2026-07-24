'use client';

import type { StockSnapshot } from '@/lib/api/admin';

interface Props {
  created?: StockSnapshot | null;
  current?: StockSnapshot | null;
  currentAsOf?: string | null;
}

const formatQuantity = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export function OrderChangeStockComparison({ created, current, currentAsOf }: Props) {
  return (
    <div className="mt-2 rounded-lg border border-black/5 bg-white/75 p-2">
      <div className="grid grid-cols-[minmax(86px,1fr)_repeat(4,minmax(38px,auto))] gap-x-2 gap-y-1 text-[10px]">
        <span className="font-semibold text-[#8b97ac]">Stok</span>
        <span className="text-right font-medium text-[#8b97ac]">Merkez</span>
        <span className="text-right font-medium text-[#8b97ac]">Topça</span>
        <span className="text-right font-medium text-[#8b97ac]">HOT</span>
        <span className="text-right font-medium text-[#8b97ac]">Toplam</span>

        <span className="font-medium text-[#51607a]">Oluşturulduğunda</span>
        {created ? (
          <>
            <span className="text-right text-[#51607a]">{formatQuantity(created.merkez)}</span>
            <span className="text-right text-[#51607a]">{formatQuantity(created.topca)}</span>
            <span className="text-right text-[#51607a]">{formatQuantity(created.hot)}</span>
            <span className="text-right font-semibold text-[#14223b]">{formatQuantity(created.total)}</span>
          </>
        ) : (
          <span className="col-span-4 text-right text-[#9a6b16]">Eski kayıtta anlık görüntü yok</span>
        )}

        <span className="font-medium text-[#51607a]">Şimdi</span>
        {current ? (
          <>
            <span className="text-right text-[#51607a]">{formatQuantity(current.merkez)}</span>
            <span className="text-right text-[#51607a]">{formatQuantity(current.topca)}</span>
            <span className="text-right text-[#51607a]">{formatQuantity(current.hot)}</span>
            <span className="text-right font-semibold text-[#14223b]">{formatQuantity(current.total)}</span>
          </>
        ) : (
          <span className="col-span-4 text-right text-[#8b97ac]">Güncel stok alınamadı</span>
        )}
      </div>
      {currentAsOf && (
        <p className="mb-0 mt-1.5 text-right text-[9px] text-[#8b97ac]">
          Güncel stok zamanı: {new Date(currentAsOf).toLocaleString('tr-TR')}
        </p>
      )}
    </div>
  );
}
