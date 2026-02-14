import { useEffect, useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Customer, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type ManualOrderItem = {
  key: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  priceType: 'INVOICED' | 'WHITE';
  reserveQty: number;
  lineDescription: string;
  responsibilityCenter: string;
};

const formatNumberInput = (value: string) => value.replace(',', '.');

const readPrice = (product: Product) => {
  const lists = product.mikroPriceLists || {};
  const candidate = Number((lists as Record<string, number>)['6'] || (lists as Record<string, number>)['1'] || 0);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 0;
};

export function OrderCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  const [items, setItems] = useState<ManualOrderItem[]>([]);

  const [warehouseNo, setWarehouseNo] = useState('1');
  const [documentNo, setDocumentNo] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [description, setDescription] = useState('B2B Manuel Siparis');
  const [invoicedSeries, setInvoicedSeries] = useState('');
  const [whiteSeries, setWhiteSeries] = useState('');

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadCustomers = async () => {
      setLoadingCustomers(true);
      try {
        const response = await adminApi.getCustomers();
        setCustomers(response.customers || []);
      } catch (err) {
        Alert.alert('Hata', 'Cariler yuklenemedi.');
      } finally {
        setLoadingCustomers(false);
      }
    };
    loadCustomers();
  }, []);

  useEffect(() => {
    const term = productSearch.trim();
    if (term.length < 2) {
      setProductResults([]);
      setSearchingProducts(false);
      return;
    }

    let cancelled = false;
    setSearchingProducts(true);
    const timer = setTimeout(async () => {
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 25 });
        if (!cancelled) {
          setProductResults(response.products || []);
        }
      } catch {
        if (!cancelled) {
          setProductResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchingProducts(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [productSearch]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers.slice(0, 40);
    return customers
      .filter((customer) => {
        const haystack = `${customer.name} ${customer.mikroCariCode || ''}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 40);
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const hasInvoiced = useMemo(() => items.some((item) => item.priceType === 'INVOICED'), [items]);
  const hasWhite = useMemo(() => items.some((item) => item.priceType === 'WHITE'), [items]);
  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  );

  const addProduct = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }

      return [
        ...prev,
        {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          productCode: product.mikroCode,
          productName: product.name,
          quantity: 1,
          unitPrice: readPrice(product),
          priceType: 'INVOICED',
          reserveQty: 0,
          lineDescription: '',
          responsibilityCenter: '',
        },
      ];
    });
  };

  const updateItem = (key: string, data: Partial<ManualOrderItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...data } : item)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const createOrder = async () => {
    if (!selectedCustomerId) {
      Alert.alert('Uyari', 'Cari seciniz.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Uyari', 'En az bir urun ekleyin.');
      return;
    }

    const warehouse = Number(warehouseNo);
    if (!Number.isFinite(warehouse) || warehouse <= 0) {
      Alert.alert('Uyari', 'Depo numarasi gecersiz.');
      return;
    }

    if (hasInvoiced && !invoicedSeries.trim()) {
      Alert.alert('Uyari', 'Faturali satirlar icin seri girin.');
      return;
    }
    if (hasWhite && !whiteSeries.trim()) {
      Alert.alert('Uyari', 'Beyaz satirlar icin seri girin.');
      return;
    }

    const invalidLine = items.find((line) => line.quantity <= 0 || line.unitPrice < 0);
    if (invalidLine) {
      Alert.alert('Uyari', 'Miktar/fiyat degerlerini kontrol edin.');
      return;
    }

    setSaving(true);
    try {
      const result = await adminApi.createManualOrder({
        customerId: selectedCustomerId,
        warehouseNo: warehouse,
        documentNo: documentNo.trim() || undefined,
        documentDescription: documentDescription.trim() || undefined,
        description: description.trim() || undefined,
        invoicedSeries: invoicedSeries.trim() || undefined,
        whiteSeries: whiteSeries.trim() || undefined,
        items: items.map((line) => ({
          productId: line.productId,
          productCode: line.productCode,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceType: line.priceType,
          reserveQty: line.reserveQty,
          lineDescription: line.lineDescription.trim() || undefined,
          responsibilityCenter: line.responsibilityCenter.trim() || undefined,
        })),
      });

      Alert.alert('Basarili', `Siparis olusturuldu: ${result.orderNumber}`, [
        {
          text: 'Siparisi Ac',
          onPress: () => navigation.replace('OrderDetail', { orderId: result.orderId }),
        },
        { text: 'Tamam' },
      ]);
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Siparis olusturulamadi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Manuel Siparis Gir</Text>
        <Text style={styles.subtitle}>Webdeki manuel siparis akisinin mobil karsiligi.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cari Secimi</Text>
          <TextInput
            style={styles.input}
            placeholder="Cari ara..."
            placeholderTextColor={colors.textMuted}
            value={customerSearch}
            onChangeText={setCustomerSearch}
          />
          {loadingCustomers ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.choiceList}>
              {filteredCustomers.map((customer) => {
                const active = customer.id === selectedCustomerId;
                return (
                  <TouchableOpacity
                    key={customer.id}
                    style={[styles.choiceItem, active && styles.choiceItemActive]}
                    onPress={() => setSelectedCustomerId(customer.id)}
                  >
                    <Text style={styles.choiceTitle}>{customer.name}</Text>
                    <Text style={styles.choiceMeta}>{customer.mikroCariCode || '-'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {selectedCustomer && (
            <Text style={styles.helper}>Secili: {selectedCustomer.name}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Urun Ekle</Text>
          <TextInput
            style={styles.input}
            placeholder="Urun kodu veya adi ara..."
            placeholderTextColor={colors.textMuted}
            value={productSearch}
            onChangeText={setProductSearch}
          />
          {searchingProducts && <ActivityIndicator color={colors.primary} />}
          <View style={styles.choiceList}>
            {productResults.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.choiceItem}
                onPress={() => {
                  hapticLight();
                  addProduct(product);
                }}
              >
                <Text style={styles.choiceTitle}>{product.name}</Text>
                <Text style={styles.choiceMeta}>{product.mikroCode}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Siparis Kalemleri ({items.length})</Text>
          {items.map((item) => (
            <View key={item.key} style={styles.lineCard}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineTitle}>{item.productName}</Text>
                <TouchableOpacity onPress={() => removeItem(item.key)}>
                  <Text style={styles.removeText}>Sil</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.lineMeta}>{item.productCode}</Text>

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.half]}
                  placeholder="Miktar"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.quantity)}
                  onChangeText={(value) => updateItem(item.key, { quantity: Math.max(1, Math.trunc(Number(value) || 0)) })}
                />
                <TextInput
                  style={[styles.input, styles.half]}
                  placeholder="Birim Fiyat"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.unitPrice)}
                  onChangeText={(value) => updateItem(item.key, { unitPrice: Math.max(0, Number(formatNumberInput(value)) || 0) })}
                />
              </View>

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.half]}
                  placeholder="Rezerve"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.reserveQty)}
                  onChangeText={(value) => updateItem(item.key, { reserveQty: Math.max(0, Math.trunc(Number(value) || 0)) })}
                />
                <TouchableOpacity
                  style={[styles.segmentButton, styles.halfButton, item.priceType === 'WHITE' && styles.segmentButtonActive]}
                  onPress={() => updateItem(item.key, { priceType: item.priceType === 'INVOICED' ? 'WHITE' : 'INVOICED' })}
                >
                  <Text style={item.priceType === 'WHITE' ? styles.segmentTextActive : styles.segmentText}>
                    {item.priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Satir aciklamasi"
                placeholderTextColor={colors.textMuted}
                value={item.lineDescription}
                onChangeText={(value) => updateItem(item.key, { lineDescription: value })}
              />
              <TextInput
                style={styles.input}
                placeholder="Sorumluluk merkezi"
                placeholderTextColor={colors.textMuted}
                value={item.responsibilityCenter}
                onChangeText={(value) => updateItem(item.key, { responsibilityCenter: value })}
              />
            </View>
          ))}
          {items.length === 0 && <Text style={styles.helper}>Henuz urun eklenmedi.</Text>}
          <Text style={styles.totalText}>Toplam: {totalAmount.toFixed(2)} TL</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evrak Bilgileri</Text>
          <TextInput
            style={styles.input}
            placeholder="Depo No (or: 1)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={warehouseNo}
            onChangeText={setWarehouseNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge No"
            placeholderTextColor={colors.textMuted}
            value={documentNo}
            onChangeText={setDocumentNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge Aciklamasi"
            placeholderTextColor={colors.textMuted}
            value={documentDescription}
            onChangeText={setDocumentDescription}
          />
          <TextInput
            style={styles.input}
            placeholder="Not"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
          />
          {hasInvoiced && (
            <TextInput
              style={styles.input}
              placeholder="Faturali Seri"
              placeholderTextColor={colors.textMuted}
              value={invoicedSeries}
              onChangeText={setInvoicedSeries}
            />
          )}
          {hasWhite && (
            <TextInput
              style={styles.input}
              placeholder="Beyaz Seri"
              placeholderTextColor={colors.textMuted}
              value={whiteSeries}
              onChangeText={setWhiteSeries}
            />
          )}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={createOrder} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Siparis Olustur'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  choiceList: {
    gap: spacing.xs,
    maxHeight: 240,
  },
  choiceItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceItemActive: {
    borderColor: colors.primary,
  },
  choiceTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  choiceMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  helper: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  lineCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lineTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  lineMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  removeText: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: fontSizes.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  half: {
    flex: 1,
  },
  halfButton: {
    flex: 1,
    justifyContent: 'center',
  },
  segmentButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  totalText: {
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
});
