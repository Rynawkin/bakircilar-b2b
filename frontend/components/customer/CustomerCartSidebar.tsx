'use client';

import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { CartItem } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type CustomerCartSidebarProps = {
  items: CartItem[];
  onRemoveItem: (itemId: string) => Promise<void>;
  onGoToCart: () => void;
  className?: string;
};

const askConfirmation = (message: string, confirmLabel: string) =>
  new Promise<boolean>((resolve) => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium text-gray-900">{message}</p>
          <div className="flex justify-end gap-2">
            <button
              className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              Iptal
            </button>
            <button
              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );
  });

export function CustomerCartSidebar({ items, onRemoveItem, onGoToCart, className }: CustomerCartSidebarProps) {
  const { totalItems, invoicedTotal, whiteTotal, grandTotal } = useMemo(() => {
    const totalItemsValue = items.reduce((sum, item) => sum + item.quantity, 0);
    const invoicedTotalValue = items
      .filter((item) => item.priceType === 'INVOICED')
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const whiteTotalValue = items
      .filter((item) => item.priceType === 'WHITE')
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    return {
      totalItems: totalItemsValue,
      invoicedTotal: invoicedTotalValue,
      whiteTotal: whiteTotalValue,
      grandTotal: invoicedTotalValue + whiteTotalValue,
    };
  }, [items]);

  const handleClearCart = async () => {
    if (!items.length) return;

    const confirmed = await askConfirmation(
      'Tum urunleri sepetten cikarmak istediginizden emin misiniz?',
      'Sepeti Temizle'
    );
    if (!confirmed) return;

    for (const item of items) {
      await onRemoveItem(item.id);
    }
    toast.success('Sepet temizlendi');
  };

  const handleRemoveItem = async (item: CartItem) => {
    const confirmed = await askConfirmation(
      `"${item.product.name}" urununu sepetten cikarmak istediginizden emin misiniz?`,
      'Sil'
    );
    if (!confirmed) return;

    await onRemoveItem(item.id);
    toast.success('Urun sepetten cikarildi');
  };

  return (
    <Card
      className={cn(
        'sticky top-24 border border-primary-100 bg-white shadow-lg lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col',
        className
      )}
    >
      <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
        <h3 className="text-lg font-semibold text-gray-900">Sepet Ozeti</h3>
        {totalItems > 0 && (
          <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">
            {totalItems} urun
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">Sepetiniz bos</p>
          <p className="mt-1 text-xs text-gray-500">Sepete urun ekleyerek devam edin.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-3 lg:flex-1">
          <button
            onClick={handleClearCart}
            className="rounded-md border border-red-200 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            Sepeti Temizle
          </button>

          <div className="space-y-2 overflow-y-auto pr-1 lg:flex-1">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="line-clamp-2 text-sm font-medium text-gray-900">{item.product.name}</div>
                  <button
                    onClick={() => handleRemoveItem(item)}
                    className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Sil
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    {item.quantity} x {formatCurrency(item.unitPrice)}
                  </span>
                  <span
                    className={cn(
                      'rounded px-2 py-1 font-semibold',
                      item.priceType === 'INVOICED' ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {item.priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                  </span>
                </div>
                <div className="mt-1 text-right text-sm font-semibold text-gray-900">
                  {formatCurrency(item.quantity * item.unitPrice)}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-3">
            {invoicedTotal > 0 && (
              <div className="flex items-center justify-between rounded-md bg-primary-50 px-3 py-2 text-sm">
                <span className="font-medium text-primary-800">Faturali Toplam</span>
                <span className="font-semibold text-primary-800">{formatCurrency(invoicedTotal)}</span>
              </div>
            )}
            {whiteTotal > 0 && (
              <div className="flex items-center justify-between rounded-md bg-gray-100 px-3 py-2 text-sm">
                <span className="font-medium text-gray-700">Beyaz Toplam</span>
                <span className="font-semibold text-gray-800">{formatCurrency(whiteTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md bg-primary-700 px-3 py-2 text-sm text-white">
              <span className="font-semibold">Genel Toplam</span>
              <span className="font-semibold">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <Button className="w-full" onClick={onGoToCart}>
            Sepete Git ({totalItems} urun)
          </Button>
        </div>
      )}
    </Card>
  );
}

