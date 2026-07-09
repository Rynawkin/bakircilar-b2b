import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export type StockFamilyRecommendation = {
  productCode: string;
  productName: string;
  unit?: string;
  available?: number;
  excess?: number;
  canCoverFull?: boolean;
  fromAlt?: number;
  fromEntered?: number;
};

type StockFamilyWarning = {
  type: 'INSUFFICIENT' | 'OFFLOAD_EXCESS';
  message: string;
  recommended: StockFamilyRecommendation;
};

type Props = {
  productCode?: string;
  baseQuantity: number;
  excludeCodes?: string[];
  suppressed?: boolean;
  onSwap: (recommendation: StockFamilyRecommendation) => void;
  onSplit: (recommendation: StockFamilyRecommendation) => void;
};

const CACHE_TTL_MS = 60_000;
const MAX_CONCURRENT = 3;
const cache = new Map<string, { timestamp: number; warnings: StockFamilyWarning[] }>();
const inflight = new Map<string, Promise<StockFamilyWarning[]>>();
const queue: Array<() => void> = [];
let activeRequests = 0;

const runLimited = async <T,>(work: () => Promise<T>): Promise<T> => {
  if (activeRequests >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  activeRequests += 1;
  try {
    return await work();
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    queue.shift()?.();
  }
};

export function StockFamilySuggestion({
  productCode,
  baseQuantity,
  excludeCodes,
  suppressed,
  onSwap,
  onSplit,
}: Props) {
  const [warnings, setWarnings] = useState<StockFamilyWarning[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const excludeKey = (excludeCodes || []).slice(0, 200).join('|');

  useEffect(() => {
    setDismissed(false);
  }, [productCode, baseQuantity, suppressed]);

  useEffect(() => {
    if (suppressed || !productCode || !Number.isFinite(baseQuantity) || baseQuantity <= 0) {
      setWarnings([]);
      setLoading(false);
      return;
    }

    const requestId = ++requestRef.current;
    const codes = excludeKey ? excludeKey.split('|') : [];
    const cacheKey = `${productCode}|${baseQuantity}|${excludeKey}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setWarnings(cached.warnings);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      let request = inflight.get(cacheKey);
      if (!request) {
        request = runLimited(async () => {
          const result = await adminApi.getStockFamilySuggestions(productCode, baseQuantity, codes);
          const next = (result.warnings || []) as StockFamilyWarning[];
          cache.set(cacheKey, { timestamp: Date.now(), warnings: next });
          if (cache.size > 300) cache.delete(cache.keys().next().value || '');
          return next;
        }).finally(() => inflight.delete(cacheKey));
        inflight.set(cacheKey, request);
      }

      request
        .then((next) => {
          if (requestRef.current === requestId) setWarnings(next);
        })
        .catch(() => {
          if (requestRef.current === requestId) setWarnings([]);
        })
        .finally(() => {
          if (requestRef.current === requestId) setLoading(false);
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [baseQuantity, excludeKey, productCode, suppressed]);

  if (suppressed || dismissed) return null;
  if (loading && warnings.length === 0) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.loadingText}>Aile stogu kontrol ediliyor</Text>
      </View>
    );
  }
  if (warnings.length === 0) return null;

  return (
    <View style={styles.list}>
      {warnings.map((warning, index) => {
        const isInsufficient = warning.type === 'INSUFFICIENT';
        const recommendation = warning.recommended;
        const isPartial = !isInsufficient && Number(recommendation.fromEntered || 0) > 0;
        return (
          <View
            key={`${warning.type}-${recommendation.productCode}-${index}`}
            style={[styles.warningCard, isInsufficient ? styles.dangerCard : styles.warningToneCard]}
          >
            <View style={styles.warningHeader}>
              <Ionicons
                name={isInsufficient ? 'warning-outline' : 'git-compare-outline'}
                size={17}
                color={isInsufficient ? colors.danger : colors.warning}
              />
              <Text style={[styles.message, isInsufficient ? styles.dangerText : styles.warningText]}>
                {warning.message}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Aile onerisini kapat"
                style={styles.dismissButton}
                onPress={() => setDismissed(true)}
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              {isPartial ? (
                <TouchableOpacity style={[styles.actionButton, styles.warningButton]} onPress={() => onSplit(recommendation)}>
                  <Text style={styles.actionButtonText} numberOfLines={2}>
                    Bol: {recommendation.fromAlt || 0} {recommendation.unit || 'adet'} aktar
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.actionButton, isInsufficient ? styles.dangerButton : styles.secondaryButton]}
                onPress={() => onSwap(recommendation)}
              >
                <Text style={styles.actionButtonText} numberOfLines={2}>
                  {isInsufficient ? `${recommendation.productName} ile degistir` : 'Tamamini aktar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs, marginTop: spacing.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  loadingText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  warningCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, gap: spacing.sm },
  dangerCard: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(248,113,113,0.30)' },
  warningToneCard: { backgroundColor: colors.warningSoft, borderColor: 'rgba(251,191,36,0.30)' },
  warningHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  message: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: fontSizes.xs, lineHeight: 16 },
  dangerText: { color: colors.danger },
  warningText: { color: colors.warning },
  dismissButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actionButton: { minHeight: 34, flexGrow: 1, flexBasis: 120, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  dangerButton: { backgroundColor: '#B83A46' },
  warningButton: { backgroundColor: '#A56B05' },
  secondaryButton: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.borderStrong },
  actionButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, lineHeight: 15, textAlign: 'center', color: colors.textStrong },
});
