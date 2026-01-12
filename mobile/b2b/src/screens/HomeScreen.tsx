import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ orders: 0, requests: 0, cartItems: 0 });

  const loadSummary = async () => {
    setLoading(true);
    try {
      const [orders, requests, cart] = await Promise.all([
        customerApi.getOrders(),
        customerApi.getOrderRequests(),
        customerApi.getCart(),
      ]);
      setSummary({
        orders: orders.orders?.length || 0,
        requests: requests.requests?.length || 0,
        cartItems: cart.items?.length || 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.kicker}>Hos geldin</Text>
        <Text style={styles.title}>{user?.name || 'B2B Musterisi'}</Text>
        <Text style={styles.subtitle}>Siparis ve fiyatlariniz tek panelde.</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.statGrid}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Siparisler</Text>
              <Text style={styles.cardValue}>{summary.orders}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Talepler</Text>
              <Text style={styles.cardValue}>{summary.requests}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Sepette</Text>
              <Text style={styles.cardValue}>{summary.cartItems}</Text>
            </View>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Agreements')}>
            <Text style={styles.actionTitle}>Anlasmali Fiyatlar</Text>
            <Text style={styles.actionBody}>Sabit fiyatlari gor.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Requests')}>
            <Text style={styles.actionTitle}>Talepler</Text>
            <Text style={styles.actionBody}>Alt kullanici talepleri.</Text>
          </TouchableOpacity>
        </View>
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
  statGrid: {
    gap: spacing.md,
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
  actionRow: {
    gap: spacing.md,
  },
  actionCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  actionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  actionBody: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
