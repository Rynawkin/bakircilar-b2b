import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { SyncStatus } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

export function SyncScreen() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [imageSyncStatus, setImageSyncStatus] = useState<SyncStatus | null>(null);
  const [cariSyncStatus, setCariSyncStatus] = useState<SyncStatus | null>(null);
  const [priceSyncStatus, setPriceSyncStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const requestSeqRef = useRef(0);

  const beginLoading = () => {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    return true;
  };

  const endLoading = () => {
    loadingRef.current = false;
    setLoading(false);
  };

  const runSync = async () => {
    if (!beginLoading()) return;
    const requestSeq = ++requestSeqRef.current;
    try {
      const response = await adminApi.triggerSync();
      const status = await adminApi.getSyncStatus(response.syncLogId);
      if (requestSeq !== requestSeqRef.current) return;
      setSyncStatus(status);
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Senkron baslatilamadi.'));
    } finally {
      endLoading();
    }
  };

  const runImageSync = async () => {
    if (!beginLoading()) return;
    const requestSeq = ++requestSeqRef.current;
    try {
      const response = await adminApi.triggerImageSync();
      const status = await adminApi.getSyncStatus(response.syncLogId);
      if (requestSeq !== requestSeqRef.current) return;
      setImageSyncStatus(status);
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Gorsel senkron baslatilamadi.'));
    } finally {
      endLoading();
    }
  };

  const runCariSync = async () => {
    if (!beginLoading()) return;
    const requestSeq = ++requestSeqRef.current;
    try {
      const response = await adminApi.triggerCariSync();
      const status = await adminApi.getCariSyncStatus(response.syncId);
      if (requestSeq !== requestSeqRef.current) return;
      setCariSyncStatus(status);
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Cari senkron baslatilamadi.'));
    } finally {
      endLoading();
    }
  };

  const runPriceSync = async () => {
    if (!beginLoading()) return;
    const requestSeq = ++requestSeqRef.current;
    try {
      const response = await adminApi.triggerPriceSync();
      if (requestSeq !== requestSeqRef.current) return;
      setPriceSyncStatus(response);
      const status = await adminApi.getPriceSyncStatus();
      if (requestSeq !== requestSeqRef.current) return;
      setPriceSyncStatus(status);
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Fiyat senkron baslatilamadi.'));
    } finally {
      endLoading();
    }
  };

  const refreshStatus = async () => {
    if (!beginLoading()) return;
    const requestSeq = ++requestSeqRef.current;
    try {
      if (syncStatus?.id) {
        const next = await adminApi.getSyncStatus(syncStatus.id);
        if (requestSeq !== requestSeqRef.current) return;
        setSyncStatus(next);
      }
      if (imageSyncStatus?.id) {
        const next = await adminApi.getSyncStatus(imageSyncStatus.id);
        if (requestSeq !== requestSeqRef.current) return;
        setImageSyncStatus(next);
      }
      if (cariSyncStatus?.id) {
        const next = await adminApi.getCariSyncStatus(cariSyncStatus.id);
        if (requestSeq !== requestSeqRef.current) return;
        setCariSyncStatus(next);
      } else {
        const latest = await adminApi.getLatestCariSync();
        if (requestSeq !== requestSeqRef.current) return;
        setCariSyncStatus(latest as SyncStatus);
      }
      const priceStatus = await adminApi.getPriceSyncStatus();
      if (requestSeq !== requestSeqRef.current) return;
      setPriceSyncStatus(priceStatus);
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Durum yenilenemedi.'));
    } finally {
      endLoading();
    }
  };

  const renderStatus = (status: SyncStatus | null) => {
    if (!status) return 'Durum yok';
    if (status.status) return status.status;
    if (status.errorMessage) return 'Hata';
    return 'Tamamlandi';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Mikro Operasyonlari</Text>
          <Text style={styles.title}>Senkronizasyon</Text>
          <Text style={styles.subtitle}>Urun, gorsel, cari ve fiyat veri guncellemelerini tek merkezden yonetin.</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Urun</Text>
              <Text style={styles.heroMetricValue} numberOfLines={1}>{renderStatus(syncStatus)}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Cari</Text>
              <Text style={styles.heroMetricValue} numberOfLines={1}>{renderStatus(cariSyncStatus)}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Fiyat</Text>
              <Text style={styles.heroMetricValue} numberOfLines={1}>
                {priceSyncStatus?.status?.status ?? priceSyncStatus?.status ?? 'Durum yok'}
              </Text>
            </View>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Urun Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {renderStatus(syncStatus)}</Text>
          <Text style={styles.cardMeta}>Urun: {syncStatus?.productsCount ?? '-'}</Text>
          <Text style={styles.cardMeta}>Kategori: {syncStatus?.categoriesCount ?? '-'}</Text>
          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={runSync} disabled={loading}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gorsel Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {renderStatus(imageSyncStatus)}</Text>
          <Text style={styles.cardMeta}>Indirilen: {imageSyncStatus?.imagesDownloaded ?? '-'}</Text>
          <Text style={styles.cardMeta}>Hata: {imageSyncStatus?.imagesFailed ?? '-'}</Text>
          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={runImageSync} disabled={loading}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cari Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {renderStatus(cariSyncStatus)}</Text>
          <Text style={styles.cardMeta}>Guncel ID: {cariSyncStatus?.id ?? '-'}</Text>
          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={runCariSync} disabled={loading}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fiyat Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {priceSyncStatus?.status?.status ?? priceSyncStatus?.status ?? '-'}
          </Text>
          <Text style={styles.cardMeta}>Kayit: {priceSyncStatus?.status?.recordsSynced ?? priceSyncStatus?.recordsSynced ?? '-'}
          </Text>
          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={runPriceSync} disabled={loading}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={refreshStatus} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.secondaryButtonText}>Durum Yenile</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DCEAFE',
    lineHeight: 22,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
