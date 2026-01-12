import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function OrderTrackingScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [testEmail, setTestEmail] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, supplierRes, pendingRes, logsRes] = await Promise.all([
        adminApi.getOrderTrackingSummary(),
        adminApi.getOrderTrackingSupplierSummary(),
        adminApi.getOrderTrackingPendingOrders(),
        adminApi.getOrderTrackingEmailLogs(),
      ]);
      setSummary(summaryRes || []);
      setSupplierSummary(supplierRes || []);
      setPendingOrders(pendingRes || []);
      setEmailLogs(logsRes || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Siparis takip verileri yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const runSync = async () => {
    try {
      await adminApi.syncOrderTracking();
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Sync basarisiz.');
    }
  };

  const runSend = async () => {
    try {
      await adminApi.sendOrderTrackingEmails();
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Mail gonderilemedi.');
    }
  };

  const runSyncSend = async () => {
    try {
      await adminApi.syncAndSendOrderTracking();
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Islem basarisiz.');
    }
  };

  const runTestEmail = async () => {
    if (!testEmail.trim()) {
      Alert.alert('Eksik Bilgi', 'Test mail girin.');
      return;
    }
    try {
      await adminApi.sendOrderTrackingTestEmail(testEmail.trim());
      Alert.alert('Basarili', 'Test mail gonderildi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Mail gonderilemedi.');
    }
  };

  const sendCustomerEmail = async (customerCode: string) => {
    try {
      await adminApi.sendOrderTrackingEmailToCustomer(customerCode);
      Alert.alert('Basarili', 'Mail gonderildi.');
      await fetchAll();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Mail gonderilemedi.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Siparis Takip</Text>
        <Text style={styles.subtitle}>Bekleyen siparis ozeti ve e-posta akisi.</Text>
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={runSync}>
            <Text style={styles.primaryButtonText}>Sync</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={runSend}>
            <Text style={styles.secondaryButtonText}>Mail Gonder</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={runSyncSend}>
            <Text style={styles.secondaryButtonText}>Sync + Mail</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Test Mail</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="ornek@firma.com"
              placeholderTextColor={colors.textMuted}
              value={testEmail}
              onChangeText={setTestEmail}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.primaryButtonSmall} onPress={runTestEmail}>
              <Text style={styles.primaryButtonText}>Gonder</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Musteri Ozeti</Text>
          {summary.map((item) => (
            <View key={item.customerCode} style={styles.listItem}>
              <View style={styles.flex}>
                <Text style={styles.listTitle}>{item.customerName}</Text>
                <Text style={styles.listMeta}>Kod: {item.customerCode}</Text>
                <Text style={styles.listMeta}>Siparis: {item.ordersCount}</Text>
                <Text style={styles.listMeta}>Toplam: {Number(item.totalAmount).toFixed(2)} TL</Text>
              </View>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => sendCustomerEmail(item.customerCode)}>
                <Text style={styles.secondaryButtonText}>Mail</Text>
              </TouchableOpacity>
            </View>
          ))}
          {summary.length === 0 && <Text style={styles.helper}>Kayit yok.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tedarikci Ozeti</Text>
          {supplierSummary.map((item) => (
            <View key={item.customerCode} style={styles.listItem}>
              <View style={styles.flex}>
                <Text style={styles.listTitle}>{item.customerName}</Text>
                <Text style={styles.listMeta}>Kod: {item.customerCode}</Text>
                <Text style={styles.listMeta}>Siparis: {item.ordersCount}</Text>
                <Text style={styles.listMeta}>Toplam: {Number(item.totalAmount).toFixed(2)} TL</Text>
              </View>
            </View>
          ))}
          {supplierSummary.length === 0 && <Text style={styles.helper}>Kayit yok.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bekleyen Siparisler</Text>
          {pendingOrders.map((order) => (
            <View key={order.mikroOrderNumber} style={styles.itemCard}>
              <Text style={styles.listTitle}>{order.mikroOrderNumber}</Text>
              <Text style={styles.listMeta}>Cari: {order.customerName}</Text>
              <Text style={styles.listMeta}>Tarih: {order.orderDate?.slice?.(0, 10) || '-'}</Text>
              <Text style={styles.listMeta}>Tutar: {Number(order.grandTotal).toFixed(2)} TL</Text>
              <Text style={styles.listMeta}>Kalem: {order.itemCount}</Text>
            </View>
          ))}
          {pendingOrders.length === 0 && <Text style={styles.helper}>Kayit yok.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mail Gecmisi</Text>
          {emailLogs.map((log: any) => (
            <View key={log.id} style={styles.itemCard}>
              <Text style={styles.listTitle}>{log.subject || 'Mail'}</Text>
              <Text style={styles.listMeta}>Cari: {log.customerCode || '-'}</Text>
              <Text style={styles.listMeta}>Tarih: {log.sentAt?.slice?.(0, 10) || '-'}</Text>
            </View>
          ))}
          {emailLogs.length === 0 && <Text style={styles.helper}>Kayit yok.</Text>}
        </View>
      </ScrollView>
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
  container: {
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
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryButtonSmall: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  flex: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  listTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  listMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  helper: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
});
