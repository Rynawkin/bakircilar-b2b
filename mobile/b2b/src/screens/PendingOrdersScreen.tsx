import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { customerApi } from '../api/customer';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type PendingOrder = {
  mikroOrderNumber: string;
  orderDate: string;
  deliveryDate?: string | null;
  itemCount: number;
  totalAmount: number;
  totalVAT: number;
  grandTotal: number;
  items: Array<{
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    deliveredQty: number;
    remainingQty: number;
    unitPrice: number;
    lineTotal: number;
    vat: number;
  }>;
};

export function PendingOrdersScreen() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await customerApi.getPendingOrders();
      setOrders(data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Bekleyen siparisler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const totalAmount = useMemo(() => {
    return orders.reduce((sum, order) => sum + (order.grandTotal || 0), 0);
  }, [orders]);

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('tr-TR');
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
          keyExtractor={(item) => item.mikroOrderNumber}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Bekleyen Siparisler</Text>
              <Text style={styles.subtitle}>Acik bakiye ve teslimat listesi.</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>Siparis: {orders.length}</Text>
                <Text style={styles.summaryText}>Toplam: {totalAmount.toFixed(2)} TL</Text>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => {
            const isOpen = expanded[item.mikroOrderNumber];
            return (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [item.mikroOrderNumber]: !prev[item.mikroOrderNumber],
                    }))
                  }
                >
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.cardTitle}>Siparis: {item.mikroOrderNumber}</Text>
                    <Text style={styles.cardMeta}>Tarih: {formatDate(item.orderDate)}</Text>
                    <Text style={styles.cardMeta}>Teslim: {formatDate(item.deliveryDate || null)}</Text>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <Text style={styles.cardTotal}>{item.grandTotal.toFixed(2)} TL</Text>
                    <Text style={styles.cardMeta}>{isOpen ? 'Gizle' : 'Detay'}</Text>
                  </View>
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.itemsBox}>
                    {item.items.map((line, index) => (
                      <View key={`${line.productCode}-${index}`} style={styles.itemRow}>
                        <View style={styles.itemLeft}>
                          <Text style={styles.itemTitle}>{line.productName}</Text>
                          <Text style={styles.itemMeta}>{line.productCode}</Text>
                        </View>
                        <View style={styles.itemRight}>
                          <Text style={styles.itemQty}>{line.remainingQty} {line.unit}</Text>
                          <Text style={styles.itemMeta}>{line.lineTotal.toFixed(2)} TL</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flex: 1,
    gap: spacing.xs,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  cardTotal: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  itemsBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemLeft: {
    flex: 1,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  itemQty: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
});
