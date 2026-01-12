import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { customerApi } from '../api/customer';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Order } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';


type OrderDetailRoute = RouteProp<RootStackParamList, 'OrderDetail'>;

export function OrderDetailScreen() {
  const route = useRoute<OrderDetailRoute>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getOrderById(route.params.orderId);
      setOrder(response);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Siparis yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [route.params.orderId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={order?.items || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Siparis Detayi</Text>
              <Text style={styles.subtitle}>No: {order?.orderNumber || '-'}</Text>
              <Text style={styles.subtitle}>Durum: {order?.status || '-'}</Text>
              {order && (
                <Text style={styles.subtitle}>Toplam: {order.totalAmount.toFixed(2)} TL</Text>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.productName}</Text>
              <Text style={styles.cardMeta}>Kod: {item.mikroCode}</Text>
              <Text style={styles.cardMeta}>Miktar: {item.quantity}</Text>
              <Text style={styles.cardMeta}>Birim: {item.unitPrice.toFixed(2)} TL</Text>
              <Text style={styles.cardMeta}>Toplam: {item.totalPrice.toFixed(2)} TL</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
    marginTop: spacing.xs,
  },
});
