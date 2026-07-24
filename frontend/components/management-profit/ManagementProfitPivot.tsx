'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  ManagementProfitField,
  ManagementProfitLayout,
  ManagementProfitNode,
  ManagementProfitPath,
  ManagementProfitQueryResponse,
  managementProfitPublicApi,
} from '@/lib/api/managementProfitReport';

interface ManagementProfitPivotProps {
  layout: ManagementProfitLayout;
  rowFields: ManagementProfitField[];
  reloadKey: number;
}

interface VisibleNode {
  node: ManagementProfitNode;
  depth: number;
  key: string;
}

const pathKey = (path: ManagementProfitPath) => JSON.stringify(path);
const AUTO_EXPAND_NODE_LIMIT = 12;
const AUTO_EXPAND_CONCURRENCY = 3;
const MOBILE_GRAND_TOTAL_KEY = '__grand_total__';

const amountValue = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const numberFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatAmount = (value: unknown, dashForZero = true) => {
  const amount = amountValue(value);
  if (dashForZero && amount === 0) return '—';
  return numberFormatter.format(amount);
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Rapor verisi alınamadı.';

export function ManagementProfitPivot({
  layout,
  rowFields,
  reloadKey,
}: ManagementProfitPivotProps) {
  const [root, setRoot] = useState<ManagementProfitQueryResponse | null>(null);
  const [childrenByPath, setChildrenByPath] = useState<
    Map<string, ManagementProfitQueryResponse>
  >(() => new Map());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set()
  );
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(
    () => new Set()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedMobileMetricKey, setSelectedMobileMetricKey] = useState<
    string | null
  >(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setLoadingPaths(new Set());
      setSelectedMobileMetricKey(null);

      try {
        const rootResponse = await managementProfitPublicApi.query(layout, []);
        if (cancelled || generation !== generationRef.current) return;

        const nextChildren = new Map<
          string,
          ManagementProfitQueryResponse
        >();
        const nextExpanded = new Set<string>();
        let frontier = rootResponse.nodes;

        const autoExpandDepth =
          rootResponse.months.length === 1
            ? Math.min(1, layout.defaultExpandedDepth)
            : 0;

        for (
          let depth = 0;
          depth < autoExpandDepth;
          depth += 1
        ) {
          const expandable = frontier
            .filter((node) => node.hasChildren)
            .slice(0, AUTO_EXPAND_NODE_LIMIT);
          if (expandable.length === 0) break;

          const responses: Array<{
            node: ManagementProfitNode;
            response: ManagementProfitQueryResponse;
          }> = [];
          for (
            let index = 0;
            index < expandable.length;
            index += AUTO_EXPAND_CONCURRENCY
          ) {
            const batch = expandable.slice(
              index,
              index + AUTO_EXPAND_CONCURRENCY
            );
            responses.push(
              ...(await Promise.all(
                batch.map(async (node) => ({
                  node,
                  response: await managementProfitPublicApi.query(
                    layout,
                    node.path
                  ),
                }))
              ))
            );
          }
          if (cancelled || generation !== generationRef.current) return;

          frontier = [];
          responses.forEach(({ node, response }) => {
            const key = pathKey(node.path);
            nextChildren.set(key, response);
            nextExpanded.add(key);
            frontier.push(...response.nodes);
          });
        }

        if (cancelled || generation !== generationRef.current) return;
        setRoot(rootResponse);
        setChildrenByPath(nextChildren);
        setExpandedPaths(nextExpanded);
      } catch (requestError) {
        if (cancelled || generation !== generationRef.current) return;
        setError(errorMessage(requestError));
      } finally {
        if (!cancelled && generation === generationRef.current) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [layout, reloadKey, retryKey]);

  const visibleNodes = useMemo(() => {
    const rows: VisibleNode[] = [];

    const append = (nodes: ManagementProfitNode[], fallbackDepth: number) => {
      nodes.forEach((node) => {
        const key = pathKey(node.path);
        const depth = Number.isFinite(node.level)
          ? Math.max(0, node.level)
          : fallbackDepth;
        rows.push({ node, depth, key });

        if (!expandedPaths.has(key)) return;
        const children = childrenByPath.get(key);
        if (children) append(children.nodes, depth + 1);
      });
    };

    if (root) append(root.nodes, 0);
    return rows;
  }, [childrenByPath, expandedPaths, root]);

  const fieldLabels = useMemo(
    () => new Map(rowFields.map((field) => [field.id, field.label])),
    [rowFields]
  );

  const toggleNode = async (node: ManagementProfitNode) => {
    if (!node.hasChildren) return;
    const key = pathKey(node.path);

    if (expandedPaths.has(key)) {
      setExpandedPaths((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return;
    }

    if (childrenByPath.has(key)) {
      setExpandedPaths((current) => new Set(current).add(key));
      return;
    }

    const generation = generationRef.current;
    setLoadingPaths((current) => new Set(current).add(key));
    setError(null);
    try {
      const response = await managementProfitPublicApi.query(layout, node.path);
      if (generation !== generationRef.current) return;
      setChildrenByPath((current) => {
        const next = new Map(current);
        next.set(key, response);
        return next;
      });
      setExpandedPaths((current) => new Set(current).add(key));
    } catch (requestError) {
      if (generation === generationRef.current) {
        setError(errorMessage(requestError));
      }
    } finally {
      if (generation === generationRef.current) {
        setLoadingPaths((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    }
  };

  const monthTotals = useMemo(() => {
    if (!root) return {};
    return Object.fromEntries(
      root.months.map((month) => [
        month.key,
        root.nodes.reduce(
          (total, node) => total + amountValue(node.amounts?.[month.key]),
          0
        ),
      ])
    );
  }, [root]);

  if (!root && loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary-600" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            Karlılık raporu hazırlanıyor
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Mikro verileri güvenli biçimde özetleniyor.
          </p>
        </div>
      </div>
    );
  }

  if (!root) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-amber-200 bg-white px-5">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-amber-600" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Rapor verisi alınamadı
          </h2>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="btn-primary mt-5"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  const hierarchyLabel = layout.rowFields
    .map((field) => fieldLabels.get(field) || field)
    .join(' › ');
  const defaultMobileMetricKey =
    root.months.length === 1
      ? root.months[0]?.key || MOBILE_GRAND_TOTAL_KEY
      : layout.showGrandTotal
        ? MOBILE_GRAND_TOTAL_KEY
        : root.months[root.months.length - 1]?.key || MOBILE_GRAND_TOTAL_KEY;
  const activeMobileMetricKey =
    selectedMobileMetricKey &&
    ((layout.showGrandTotal &&
      selectedMobileMetricKey === MOBILE_GRAND_TOTAL_KEY) ||
      root.months.some((month) => month.key === selectedMobileMetricKey))
      ? selectedMobileMetricKey
      : defaultMobileMetricKey;
  const activeMobileMetricLabel =
    activeMobileMetricKey === MOBILE_GRAND_TOTAL_KEY
      ? 'Genel toplam'
      : root.months.find((month) => month.key === activeMobileMetricKey)?.label ||
        'Dönem';
  const activeMobileTotal =
    activeMobileMetricKey === MOBILE_GRAND_TOTAL_KEY
      ? root.grandTotal
      : monthTotals[activeMobileMetricKey];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      {error && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 flex-none" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="font-semibold hover:underline"
          >
            Kapat
          </button>
        </div>
      )}

      <div className="relative min-w-0 lg:hidden">
        {loading && (
          <div className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Yenileniyor
          </div>
        )}

        <div className="min-w-0 border-b border-slate-200 bg-slate-900 px-3 py-3 text-white [@media(max-height:600px)]:py-2">
          <div className="flex min-w-0 items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/55 [@media(max-height:600px)]:hidden">
                Gösterilen değer
              </div>
              <div className="mt-0.5 truncate text-xs font-semibold text-white/90 [@media(max-height:600px)]:mt-0">
                {activeMobileMetricLabel}
              </div>
            </div>
            <div className="min-w-0 flex-none text-right font-mono text-sm font-bold tabular-nums text-white">
              {formatAmount(activeMobileTotal, false)}
            </div>
          </div>

          <div
            className="mt-3 flex max-w-full snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [@media(max-height:600px)]:mt-1.5"
            aria-label="Gösterilecek dönem"
            role="group"
          >
            {layout.showGrandTotal && (
              <button
                type="button"
                onClick={() =>
                  setSelectedMobileMetricKey(MOBILE_GRAND_TOTAL_KEY)
                }
                aria-pressed={
                  activeMobileMetricKey === MOBILE_GRAND_TOTAL_KEY
                }
                className={`min-h-11 flex-none snap-start rounded-full border px-3.5 text-xs font-semibold transition ${
                  activeMobileMetricKey === MOBILE_GRAND_TOTAL_KEY
                    ? 'border-white bg-white text-slate-900'
                    : 'border-white/20 bg-white/5 text-white/75 hover:bg-white/10'
                }`}
              >
                Genel toplam
              </button>
            )}
            {root.months.map((month) => {
              const selected = activeMobileMetricKey === month.key;
              return (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => setSelectedMobileMetricKey(month.key)}
                  aria-pressed={selected}
                  className={`min-h-11 flex-none snap-start rounded-full border px-3.5 text-xs font-semibold transition ${
                    selected
                      ? 'border-white bg-white text-slate-900'
                      : 'border-white/20 bg-white/5 text-white/75 hover:bg-white/10'
                  }`}
                >
                  {month.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 divide-y divide-slate-200">
          {visibleNodes.map(({ node, depth, key }) => {
            const expanded = expandedPaths.has(key);
            const branchLoading = loadingPaths.has(key);
            const nodeAmount =
              activeMobileMetricKey === MOBILE_GRAND_TOTAL_KEY
                ? node.grandTotal
                : node.amounts?.[activeMobileMetricKey];
            return (
              <div key={key} className="flex min-w-0 items-stretch bg-white">
                <div
                  className="flex min-w-0 flex-1 items-center py-2 pr-2"
                  style={{ paddingLeft: `${4 + Math.min(depth, 8) * 12}px` }}
                >
                  {node.hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleNode(node)}
                      aria-expanded={expanded}
                      aria-label={`${node.label || node.value || 'Tanımsız'} kırılımını ${expanded ? 'daralt' : 'genişlet'}`}
                      className="mr-1 inline-flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-500 active:bg-slate-200 active:text-slate-900"
                    >
                      {branchLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : expanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                  ) : (
                    <span className="mr-1 h-11 w-11 flex-none" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-800"
                      title={node.label || node.value || 'Tanımsız'}
                    >
                      {node.label || node.value || 'Tanımsız'}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.04em] text-slate-400">
                      {fieldLabels.get(layout.rowFields[depth]) ||
                        layout.rowFields[depth] ||
                        'Kırılım'}
                    </div>
                  </div>
                </div>
                <div
                  className="flex w-[118px] flex-none items-center justify-end overflow-hidden whitespace-nowrap border-l border-slate-200 bg-slate-50 px-2 text-right font-mono text-[11px] font-semibold tabular-nums text-slate-900 max-[359px]:text-[10px] sm:w-[132px] sm:px-3 sm:text-[13px]"
                  title={formatAmount(
                    nodeAmount,
                    activeMobileMetricKey !== MOBILE_GRAND_TOTAL_KEY
                  )}
                >
                  {formatAmount(
                    nodeAmount,
                    activeMobileMetricKey !== MOBILE_GRAND_TOTAL_KEY
                  )}
                </div>
              </div>
            );
          })}
          {visibleNodes.length === 0 && (
            <div className="px-5 py-14 text-center text-sm text-slate-500">
              Seçili görünüm için kayıt bulunamadı.
            </div>
          )}
        </div>
      </div>

      <div className="relative hidden overflow-auto lg:block">
        {loading && (
          <div className="absolute right-3 top-3 z-40 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Yenileniyor
          </div>
        )}

        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[310px] max-w-[430px] border-b border-r border-slate-200 bg-slate-900 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
                {hierarchyLabel || 'Kırılım'}
              </th>
              {root.months.map((month) => (
                <th
                  key={month.key}
                  className="sticky top-0 z-20 min-w-[126px] border-b border-r border-slate-700 bg-slate-900 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-white"
                >
                  {month.label}
                </th>
              ))}
              {layout.showGrandTotal && (
                <th className="sticky right-0 top-0 z-30 min-w-[138px] border-b border-slate-700 bg-[#122b55] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
                  Genel toplam
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleNodes.map(({ node, depth, key }) => {
              const expanded = expandedPaths.has(key);
              const branchLoading = loadingPaths.has(key);
              return (
                <tr key={key} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2.5 text-left font-normal group-hover:bg-slate-50"
                  >
                    <div
                      className="flex min-w-0 items-center"
                      style={{ paddingLeft: `${Math.min(depth, 8) * 20}px` }}
                    >
                      {node.hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggleNode(node)}
                          aria-expanded={expanded}
                          aria-label={`${node.label || node.value || 'Tanımsız'} kırılımını ${expanded ? 'daralt' : 'genişlet'}`}
                          className="mr-1.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                        >
                          {branchLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <span className="mr-1.5 h-7 w-7 flex-none" />
                      )}
                      <div className="min-w-0">
                        <div
                          className="truncate font-semibold text-slate-800"
                          title={node.label || node.value || 'Tanımsız'}
                        >
                          {node.label || node.value || 'Tanımsız'}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.04em] text-slate-400">
                          {fieldLabels.get(layout.rowFields[depth]) ||
                            layout.rowFields[depth] ||
                            'Kırılım'}
                        </div>
                      </div>
                    </div>
                  </th>
                  {root.months.map((month) => (
                    <td
                      key={`${key}:${month.key}`}
                      className="border-b border-r border-slate-200 px-4 py-2.5 text-right font-mono text-[12.5px] tabular-nums text-slate-700 group-hover:bg-slate-50"
                    >
                      {formatAmount(node.amounts?.[month.key])}
                    </td>
                  ))}
                  {layout.showGrandTotal && (
                    <td className="sticky right-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-right font-mono text-[12.5px] font-semibold tabular-nums text-slate-900 group-hover:bg-slate-100">
                      {formatAmount(node.grandTotal, false)}
                    </td>
                  )}
                </tr>
              );
            })}
            {visibleNodes.length === 0 && (
              <tr>
                <td
                  colSpan={
                    1 + root.months.length + (layout.showGrandTotal ? 1 : 0)
                  }
                  className="px-5 py-16 text-center text-sm text-slate-500"
                >
                  Seçili görünüm için kayıt bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
          {layout.showGrandTotal && visibleNodes.length > 0 && (
            <tfoot>
              <tr>
                <th className="sticky bottom-0 left-0 z-30 border-r border-t border-slate-300 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.05em] text-slate-800">
                  Genel toplam
                </th>
                {root.months.map((month) => (
                  <td
                    key={`total:${month.key}`}
                    className="sticky bottom-0 z-20 border-r border-t border-slate-300 bg-slate-100 px-4 py-3 text-right font-mono text-[12.5px] font-bold tabular-nums text-slate-900"
                  >
                    {formatAmount(monthTotals[month.key], false)}
                  </td>
                ))}
                <td className="sticky bottom-0 right-0 z-30 border-t border-slate-300 bg-[#e7edf7] px-4 py-3 text-right font-mono text-[13px] font-extrabold tabular-nums text-[#122b55]">
                  {formatAmount(root.grandTotal, false)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
