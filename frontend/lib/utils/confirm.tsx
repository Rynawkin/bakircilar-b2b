'use client';

import toast from 'react-hot-toast';

export const confirmBackorder = (params: {
  requestedQty: number;
  availableQty: number;
  unit: string;
}): Promise<boolean> => {
  const requestedQty = params.requestedQty;
  const availableQty = params.availableQty;
  const unit = params.unit;

  return new Promise((resolve) => {
    toast((t) => (
      <div className="w-[320px] rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/5">
        <div className="text-sm font-semibold text-gray-900">Stok uyarisi</div>
        <p className="mt-1 text-xs text-gray-600">
          Sepete eklemek istediginiz miktar, toplam stogu karsilamamaktadir. Onaylarsaniz
          siparisiniz alinacak ve urunler termin sureci sonrasinda sevk edilecektir.
        </p>
        {typeof requestedQty === 'number' && typeof availableQty === 'number' && unit && (
          <div className="mt-2 text-[11px] text-gray-500">
            Talep: {requestedQty} {unit} | Mevcut: {availableQty} {unit}
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            onClick={() => {
              toast.dismiss(t.id);
              resolve(false);
            }}
          >
            Vazgec
          </button>
          <button
            className="rounded-md bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700"
            onClick={() => {
              toast.dismiss(t.id);
              resolve(true);
            }}
          >
            Devam Et
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  });
};
