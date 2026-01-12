import { useState } from 'react';
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

export function SyncScreen() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [imageSyncStatus, setImageSyncStatus] = useState<SyncStatus | null>(null);
  const [cariSyncStatus, setCariSyncStatus] = useState<SyncStatus | null>(null);
  const [priceSyncStatus, setPriceSyncStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.triggerSync();
      const status = await adminApi.getSyncStatus(response.syncLogId);
      setSyncStatus(status);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Senkron baslatilamadi.');
    } finally {
      setLoading(false);
    }
  };

  const runImageSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.triggerImageSync();
      const status = await adminApi.getSyncStatus(response.syncLogId);
      setImageSyncStatus(status);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Gorsel senkron baslatilamadi.');
    } finally {
      setLoading(false);
    }
  };

  const runCariSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.triggerCariSync();
      const status = await adminApi.getCariSyncStatus(response.syncId);
      setCariSyncStatus(status);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Cari senkron baslatilamadi.');
    } finally {
      setLoading(false);
    }
  };

  const runPriceSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.triggerPriceSync();
      setPriceSyncStatus(response);
      const status = await adminApi.getPriceSyncStatus();
      setPriceSyncStatus(status);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Fiyat senkron baslatilamadi.');
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      if (syncStatus?.id) {
        setSyncStatus(await adminApi.getSyncStatus(syncStatus.id));
      }
      if (imageSyncStatus?.id) {
        setImageSyncStatus(await adminApi.getSyncStatus(imageSyncStatus.id));
      }
      if (cariSyncStatus?.id) {
        setCariSyncStatus(await adminApi.getCariSyncStatus(cariSyncStatus.id));
      } else {
        const latest = await adminApi.getLatestCariSync();
        setCariSyncStatus(latest as SyncStatus);
      }
      setPriceSyncStatus(await adminApi.getPriceSyncStatus());
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Durum yenilenemedi.');
    } finally {
      setLoading(false);
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
        <Text style={styles.title}>Senkronizasyon</Text>
        <Text style={styles.subtitle}>Mikro verilerini guncelleme islemleri.</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Urun Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {renderStatus(syncStatus)}</Text>
          <Text style={styles.cardMeta}>Urun: {syncStatus?.productsCount ?? '-'}</Text>
          <Text style={styles.cardMeta}>Kategori: {syncStatus?.categoriesCount ?? '-'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={runSync}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gorsel Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {renderStatus(imageSyncStatus)}</Text>
          <Text style={styles.cardMeta}>Indirilen: {imageSyncStatus?.imagesDownloaded ?? '-'}</Text>
          <Text style={styles.cardMeta}>Hata: {imageSyncStatus?.imagesFailed ?? '-'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={runImageSync}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cari Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {renderStatus(cariSyncStatus)}</Text>
          <Text style={styles.cardMeta}>Guncel ID: {cariSyncStatus?.id ?? '-'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={runCariSync}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fiyat Senkronu</Text>
          <Text style={styles.cardMeta}>Durum: {priceSyncStatus?.status?.status ?? priceSyncStatus?.status ?? '-'}
          </Text>
          <Text style={styles.cardMeta}>Kayit: {priceSyncStatus?.status?.recordsSynced ?? priceSyncStatus?.recordsSynced ?? '-'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={runPriceSync}>
            <Text style={styles.primaryButtonText}>Baslat</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={refreshStatus}>
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
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.textMuted,
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
});
