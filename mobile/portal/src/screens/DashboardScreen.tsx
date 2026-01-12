import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { DashboardStats } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function DashboardScreen() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getDashboardStats();
      setStats(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Dashboard verisi yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.kicker}>Gunun Ozeti</Text>
        <Text style={styles.title}>{user?.name || 'Bakircilar Ekibi'}</Text>
        <Text style={styles.subtitle}>Onay bekleyenler ve guncel hareketler.</Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.statGrid}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Bekleyen Siparis</Text>
                <Text style={styles.cardValue}>{stats?.orders?.pendingCount ?? 0}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Bugun Onay</Text>
                <Text style={styles.cardValue}>{stats?.orders?.approvedToday ?? 0}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Musteri</Text>
                <Text style={styles.cardValue}>{stats?.customerCount ?? 0}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Fazla Stok</Text>
                <Text style={styles.cardValue}>{stats?.excessProductCount ?? 0}</Text>
              </View>
            </View>
            <View style={styles.signOutWrap}>
              <Text style={styles.signOutHint}>Guvenli cikis</Text>
              <Text style={styles.signOutLink} onPress={signOut}>
                Cikis Yap
              </Text>
            </View>
          </>
        )}
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
    gap: spacing.lg,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  loading: {
    paddingVertical: spacing.xl,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  statGrid: {
    gap: spacing.md,
  },
  signOutWrap: {
    marginTop: spacing.lg,
    alignItems: 'flex-start',
  },
  signOutHint: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  signOutLink: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  cardValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
    marginTop: spacing.xs,
  },
});
