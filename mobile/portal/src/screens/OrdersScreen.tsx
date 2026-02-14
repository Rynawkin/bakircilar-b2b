import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { Order } from '../types';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticLight, hapticSuccess } from '../utils/haptics';

export function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getOrders();
      setOrders(response.orders || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Siparisler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const approve = async (orderId: string) => {
    try {
      await adminApi.approveOrder(orderId);
      hapticSuccess();
      await fetchOrders();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Onay basarisiz.');
    }
  };

  const reject = async (orderId: string) => {
    Alert.alert('Siparisi Reddet', 'Siparisi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminApi.rejectOrder(orderId, 'Mobil reddedildi');
            hapticSuccess();
            await fetchOrders();
          } catch (err: any) {
            Alert.alert('Hata', err?.response?.data?.error || 'Red basarisiz.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Siparisler</Text>
              <Text style={styles.subtitle}>Onay surecleri ve durumlar.</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    hapticLight();
                    navigation.navigate('OrderCreate');
                  }}
                >
                  <Text style={styles.primaryButtonText}>Manuel Siparis</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={fetchOrders}>
                  <Text style={styles.secondaryButtonText}>Yenile</Text>
                </TouchableOpacity>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.orderNumber}</Text>
              <Text style={styles.cardMeta}>Durum: {item.status}</Text>
              <Text style={styles.cardMeta}>Toplam: {item.totalAmount.toFixed(2)} TL</Text>
              {item.user?.name && (
                <Text style={styles.cardMeta}>Cari: {item.user.name}</Text>
              )}
              {item.items && (
                <Text style={styles.cardMeta}>
                  Bekleyen: {item.items.filter((line) => (line.status || 'PENDING') === 'PENDING').length}
                </Text>
              )}
              {item.status === 'PENDING' && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => approve(item.id)}>
                    <Text style={styles.primaryButtonText}>Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => reject(item.id)}>
                    <Text style={styles.secondaryButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
              >
                <Text style={styles.secondaryButtonText}>Detay</Text>
              </TouchableOpacity>
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
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
});
