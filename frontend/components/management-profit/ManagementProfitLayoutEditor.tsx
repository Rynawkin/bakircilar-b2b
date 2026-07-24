'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_MANAGEMENT_PROFIT_LAYOUT,
  ManagementProfitField,
  ManagementProfitLayout,
  ManagementProfitRowFieldId,
  ManagementProfitSort,
} from '@/lib/api/managementProfitReport';

interface ManagementProfitLayoutEditorProps {
  open: boolean;
  layout: ManagementProfitLayout;
  rowFields: ManagementProfitField[];
  columnFields: ManagementProfitField[];
  valueFields: ManagementProfitField[];
  canSave: boolean;
  saving: boolean;
  onClose: () => void;
  onApply: (layout: ManagementProfitLayout) => void;
  onSave: (layout: ManagementProfitLayout) => void;
}

const SORT_OPTIONS: Array<{ value: ManagementProfitSort; label: string }> = [
  { value: 'TOTAL_DESC', label: 'Toplam: yüksekten düşüğe' },
  { value: 'TOTAL_ASC', label: 'Toplam: düşükten yükseğe' },
  { value: 'LABEL_ASC', label: 'Ad: A’dan Z’ye' },
  { value: 'LABEL_DESC', label: 'Ad: Z’den A’ya' },
];

const isRowFieldId = (value: string): value is ManagementProfitRowFieldId =>
  [
    'CUSTOMER_SECTOR_CODE',
    'GROUP_NAME',
    'CUSTOMER_NAME',
    'STOCK',
  ].includes(value);

const cloneLayout = (
  layout: ManagementProfitLayout
): ManagementProfitLayout => ({
  ...layout,
  rowFields: [...layout.rowFields],
  defaultExpandedDepth: Math.min(1, layout.defaultExpandedDepth),
});

export function ManagementProfitLayoutEditor({
  open,
  layout,
  rowFields,
  columnFields,
  valueFields,
  canSave,
  saving,
  onClose,
  onApply,
  onSave,
}: ManagementProfitLayoutEditorProps) {
  const [draft, setDraft] = useState<ManagementProfitLayout>(() =>
    cloneLayout(layout)
  );
  const [fieldToAdd, setFieldToAdd] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(cloneLayout(layout));
    setFieldToAdd('');
  }, [layout, open]);

  const rowFieldMap = useMemo(
    () => new Map(rowFields.map((field) => [field.id, field.label])),
    [rowFields]
  );

  const unusedRowFields = rowFields.filter(
    (field) => !draft.rowFields.includes(field.id as ManagementProfitRowFieldId)
  );
  const maxExpandedDepth = Math.min(
    1,
    Math.max(0, draft.rowFields.length - 1)
  );

  const updateRows = (nextRows: ManagementProfitRowFieldId[]) => {
    setDraft((current) => ({
      ...current,
      rowFields: nextRows,
      defaultExpandedDepth: Math.min(
        current.defaultExpandedDepth,
        Math.min(1, Math.max(0, nextRows.length - 1))
      ),
    }));
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.rowFields.length) return;
    const nextRows = [...draft.rowFields];
    [nextRows[index], nextRows[nextIndex]] = [
      nextRows[nextIndex],
      nextRows[index],
    ];
    updateRows(nextRows);
  };

  const removeRow = (index: number) => {
    if (draft.rowFields.length <= 1) return;
    updateRows(draft.rowFields.filter((_, rowIndex) => rowIndex !== index));
  };

  const addRow = () => {
    if (!isRowFieldId(fieldToAdd)) return;
    if (draft.rowFields.includes(fieldToAdd)) return;
    updateRows([...draft.rowFields, fieldToAdd]);
    setFieldToAdd('');
  };

  const reset = () => {
    const allowedRows = new Set(
      rowFields.map((field) => field.id).filter(isRowFieldId)
    );
    const defaultRows = DEFAULT_MANAGEMENT_PROFIT_LAYOUT.rowFields.filter(
      (field) => allowedRows.has(field)
    );
    setDraft({
      ...cloneLayout(DEFAULT_MANAGEMENT_PROFIT_LAYOUT),
      rowFields:
        defaultRows.length > 0
          ? defaultRows
          : (rowFields.map((field) => field.id).filter(isRowFieldId).slice(
              0,
              1
            ) as ManagementProfitRowFieldId[]),
    });
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={saving ? () => undefined : onClose} className="relative z-[70]">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="translate-y-3 opacity-0 scale-[0.98]"
              enterTo="translate-y-0 opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="translate-y-0 opacity-100 scale-100"
              leaveTo="translate-y-3 opacity-0 scale-[0.98]"
            >
              <DialogPanel className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
                  <div>
                    <DialogTitle className="text-base font-semibold text-slate-900">
                      Rapor görünümü
                    </DialogTitle>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Satır kırılımlarını ve açılış düzenini belirleyin. Tarih
                      aralığı her girişte sunucu tarafından güncel hesaplanır.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    aria-label="Pencereyi kapat"
                    className="ml-4 inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="max-h-[68vh] space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Satır alanları
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Üstten alta doğru açılma sırası.
                        </p>
                      </div>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                        {draft.rowFields.length} alan
                      </span>
                    </div>

                    <div className="space-y-2">
                      {draft.rowFields.map((fieldId, index) => (
                        <div
                          key={fieldId}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        >
                          <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                            {rowFieldMap.get(fieldId) || fieldId}
                          </span>
                          <button
                            type="button"
                            onClick={() => moveRow(index, -1)}
                            disabled={index === 0}
                            title="Yukarı taşı"
                            aria-label={`${rowFieldMap.get(fieldId) || fieldId} alanını yukarı taşı`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-25"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(index, 1)}
                            disabled={index === draft.rowFields.length - 1}
                            title="Aşağı taşı"
                            aria-label={`${rowFieldMap.get(fieldId) || fieldId} alanını aşağı taşı`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-25"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            disabled={draft.rowFields.length <= 1}
                            title="Alanı kaldır"
                            aria-label={`${rowFieldMap.get(fieldId) || fieldId} alanını kaldır`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-25"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {unusedRowFields.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        <select
                          value={fieldToAdd}
                          onChange={(event) => setFieldToAdd(event.target.value)}
                          className="input h-10 flex-1"
                          aria-label="Eklenecek satır alanı"
                        >
                          <option value="">Alan seçin</option>
                          {unusedRowFields.map((field) => (
                            <option key={field.id} value={field.id}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={addRow}
                          disabled={!fieldToAdd}
                          className="btn-secondary h-10 px-3"
                        >
                          <Plus className="h-4 w-4" />
                          Ekle
                        </button>
                      </div>
                    )}
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="field-label">Kolon alanı</span>
                      <select
                        value={draft.columnField}
                        onChange={() => undefined}
                        className="input h-10"
                        disabled
                      >
                        {columnFields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">Değer alanı</span>
                      <select
                        value={draft.valueField}
                        onChange={() => undefined}
                        className="input h-10"
                        disabled
                      >
                        {valueFields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">Sıralama</span>
                      <select
                        value={draft.sort}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            sort: event.target.value as ManagementProfitSort,
                          }))
                        }
                        className="input h-10"
                      >
                        {SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">
                        Açılışta genişletilecek seviye
                      </span>
                      <select
                        value={draft.defaultExpandedDepth}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            defaultExpandedDepth: Number(event.target.value),
                          }))
                        }
                        className="input h-10"
                      >
                        {Array.from(
                          { length: maxExpandedDepth + 1 },
                          (_, depth) => (
                            <option key={depth} value={depth}>
                              {depth === 0
                                ? 'Kapalı (yalnız ilk seviye)'
                                : 'İlk 12 satır otomatik açık'}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  </section>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={draft.showGrandTotal}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          showGrandTotal: event.target.checked,
                        }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-800">
                        Genel toplamı göster
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Aylık kolonların sonunda toplam kolonu ve alt toplam
                        satırı görünür.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={saving}
                    className="btn-ghost sm:mr-auto"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Sistem varsayılanına dön
                  </button>
                  <button
                    type="button"
                    onClick={() => onApply(cloneLayout(draft))}
                    disabled={saving || draft.rowFields.length === 0}
                    className="btn-secondary"
                  >
                    <Check className="h-4 w-4" />
                    Bu oturumda uygula
                  </button>
                  {canSave && (
                    <button
                      type="button"
                      onClick={() => onSave(cloneLayout(draft))}
                      disabled={saving || draft.rowFields.length === 0}
                      className="btn-primary"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Kaydediliyor…' : 'Görünümü kaydet'}
                    </button>
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
