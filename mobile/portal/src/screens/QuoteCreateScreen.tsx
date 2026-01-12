import { useEffect, useMemo, useState } from 'react';
import {
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

const buildDefaultValidityDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

type QuoteItemForm = {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  unit?: string | null;
  quantity: number;
  priceSource: 'PRICE_LIST' | 'MANUAL';
  priceListNo?: number;
  unitPrice: number;
  priceType: 'INVOICED' | 'WHITE';
  mikroPriceLists?: Record<string, number>;
};

export function QuoteCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [poolPriceListNo, setPoolPriceListNo] = useState(1);
  const [savingPool, setSavingPool] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>([]);
  const [validityDate, setValidityDate] = useState(buildDefaultValidityDate());
  const [note, setNote] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [responsibleCode, setResponsibleCode] = useState('');
  const [vatZeroed, setVatZeroed] = useState(false);
  const [saving, setSaving] = useState(false);

  const priceListOptions = [1, 2, 3, 4, 5];

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const response = await adminApi.getCustomers();
        setCustomers(response.customers || []);
      } catch (err) {
        console.error('Customers fetch failed', err);
      }
    };
    loadCustomers();
  }, []);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await adminApi.getQuotePreferences();
        if (response.preferences.poolPriceListNo) {
          setPoolPriceListNo(response.preferences.poolPriceListNo);
        }
        if (response.preferences.responsibleCode) {
          setResponsibleCode(response.preferences.responsibleCode);
        }
      } catch (err) {
        console.error('Preferences fetch failed', err);
      }
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const term = productSearch.trim();
      if (!term) {
        setProducts([]);
        return;
      }
      setSearchingProducts(true);
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 20 });
        if (active) {
          setProducts(response.products || []);
        }
      } catch (err) {
        if (active) {
          setProducts([]);
        }
      } finally {
        if (active) {
          setSearchingProducts(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [productSearch]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => {
      const haystack = `${customer.name} ${customer.mikroCariCode || ''} ${customer.email || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [customerSearch, customers]);

  const addProduct = (product: Product) => {
    const listNo = poolPriceListNo || 1;
    const listPrice = product.mikroPriceLists?.[String(listNo)] ?? 0;
    const entry: QuoteItemForm = {
      id: `${product.id}-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      productCode: product.mikroCode,
      unit: product.unit,
      quantity: 1,
      priceSource: 'PRICE_LIST',
      priceListNo: listNo,
      unitPrice: listPrice,
      priceType: 'INVOICED',
      mikroPriceLists: product.mikroPriceLists || {},
    };
    setQuoteItems((prev) => [...prev, entry]);
  };

  const savePoolView = async () => {
    setSavingPool(true);
    try {
      await adminApi.updateQuotePreferences({ poolPriceListNo });
      Alert.alert('Basarili', 'Gorunus kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Gorunus kaydedilemedi.');
    } finally {
      setSavingPool(false);
    }
  };

  const updateItem = (id: string, updates: Partial<QuoteItemForm>) => {
    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...updates };
        if (updates.priceListNo && next.priceSource === 'PRICE_LIST') {
          const price = next.mikroPriceLists?.[String(updates.priceListNo)] ?? next.unitPrice;
          next.unitPrice = price || 0;
        }
        return next;
      })
    );
  };

  const removeItem = (id: string) => {
    setQuoteItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCreate = async () => {
    if (!selectedCustomer) {
      Alert.alert('Eksik Bilgi', 'Cari secin.');
      return;
    }
    if (!validityDate) {
      Alert.alert('Eksik Bilgi', 'Gecerlilik tarihi girin.');
      return;
    }
    if (quoteItems.length === 0) {
      Alert.alert('Eksik Bilgi', 'En az bir urun ekleyin.');
      return;
    }

    const items = quoteItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      priceSource: item.priceSource,
      priceListNo: item.priceSource === 'PRICE_LIST' ? item.priceListNo : undefined,
      priceType: item.priceType,
    }));

    setSaving(true);
    try {
      await adminApi.createQuote({
        customerId: selectedCustomer.id,
        validityDate,
        note: note || undefined,
        documentNo: documentNo || undefined,
        responsibleCode: responsibleCode || undefined,
        vatZeroed,
        items,
      });
      Alert.alert('Basarili', 'Teklif olusturuldu.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Teklif olusturulamadi.');
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

        <Text style={styles.title}>Yeni Teklif</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cari Secimi</Text>
          <TextInput
            style={styles.input}
            placeholder="Cari ara"
            placeholderTextColor={colors.textMuted}
            value={customerSearch}
            onChangeText={setCustomerSearch}
          />
          <View style={styles.listBlock}>
            {filteredCustomers.map((customer) => (
              <TouchableOpacity
                key={customer.id}
                style={[
                  styles.listItem,
                  selectedCustomer?.id === customer.id && styles.listItemActive,
                ]}
                onPress={() => setSelectedCustomer(customer)}
              >
                <Text style={styles.listItemTitle}>{customer.name}</Text>
                <Text style={styles.listItemMeta}>{customer.mikroCariCode || '-'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Teklif Bilgileri</Text>
          <TextInput
            style={styles.input}
            placeholder="Gecerlilik tarihi (YYYY-MM-DD)"
            placeholderTextColor={colors.textMuted}
            value={validityDate}
            onChangeText={setValidityDate}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge no"
            placeholderTextColor={colors.textMuted}
            value={documentNo}
            onChangeText={setDocumentNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Sorumlu kodu"
            placeholderTextColor={colors.textMuted}
            value={responsibleCode}
            onChangeText={setResponsibleCode}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Not"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, vatZeroed && styles.toggleButtonActive]}
              onPress={() => setVatZeroed((prev) => !prev)}
            >
              <Text style={vatZeroed ? styles.toggleTextActive : styles.toggleText}>
                {vatZeroed ? 'KDV Sifirlandi' : 'KDV Normal'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Urun Havuzu</Text>
          <View style={styles.poolHeader}>
            <Text style={styles.poolLabel}>Fiyat Listesi</Text>
            <View style={styles.segmentRow}>
              {priceListOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.segmentButton,
                    poolPriceListNo === option && styles.segmentButtonActive,
                  ]}
                  onPress={() => setPoolPriceListNo(option)}
                >
                  <Text
                    style={
                      poolPriceListNo === option ? styles.segmentTextActive : styles.segmentText
                    }
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.secondaryButton} onPress={savePoolView} disabled={savingPool}>
              <Text style={styles.secondaryButtonText}>
                {savingPool ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Urun ara"
            placeholderTextColor={colors.textMuted}
            value={productSearch}
            onChangeText={setProductSearch}
          />
          {searchingProducts && <Text style={styles.helper}>Araniyor...</Text>}
          <View style={styles.listBlock}>
            {products.map((product) => {
              const listPrice = product.mikroPriceLists?.[String(poolPriceListNo)] ?? 0;
              return (
                <View key={product.id} style={styles.listItem}>
                  <Text style={styles.listItemTitle}>{product.name}</Text>
                  <Text style={styles.listItemMeta}>Kod: {product.mikroCode}</Text>
                  <Text style={styles.poolPrice}>
                    Liste {poolPriceListNo}: {Number(listPrice).toFixed(2)} TL
                  </Text>
                  <TouchableOpacity style={styles.addButton} onPress={() => addProduct(product)}>
                    <Text style={styles.addButtonText}>Teklife Ekle</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {productSearch.trim().length > 0 && products.length === 0 && !searchingProducts && (
              <Text style={styles.helper}>Urun bulunamadi.</Text>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Teklif Kalemleri ({quoteItems.length})</Text>
          {quoteItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{item.productName}</Text>
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Text style={styles.removeText}>Sil</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.itemMeta}>Kod: {item.productCode}</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Miktar"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.quantity)}
                  onChangeText={(value) =>
                    updateItem(item.id, { quantity: Number(value) || 1 })
                  }
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Fiyat"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.unitPrice)}
                  editable={item.priceSource === 'MANUAL'}
                  onChangeText={(value) =>
                    updateItem(item.id, { unitPrice: Number(value) || 0 })
                  }
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Liste"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.priceListNo || '')}
                  editable={item.priceSource === 'PRICE_LIST'}
                  onChangeText={(value) =>
                    updateItem(item.id, { priceListNo: Number(value) || 1 })
                  }
                />
              </View>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    item.priceSource === 'PRICE_LIST' && styles.segmentButtonActive,
                  ]}
                  onPress={() => updateItem(item.id, { priceSource: 'PRICE_LIST' })}
                >
                  <Text
                    style={
                      item.priceSource === 'PRICE_LIST'
                        ? styles.segmentTextActive
                        : styles.segmentText
                    }
                  >
                    Liste
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    item.priceSource === 'MANUAL' && styles.segmentButtonActive,
                  ]}
                  onPress={() => updateItem(item.id, { priceSource: 'MANUAL' })}
                >
                  <Text
                    style={
                      item.priceSource === 'MANUAL'
                        ? styles.segmentTextActive
                        : styles.segmentText
                    }
                  >
                    Manuel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    item.priceType === 'INVOICED' && styles.segmentButtonActive,
                  ]}
                  onPress={() => updateItem(item.id, { priceType: 'INVOICED' })}
                >
                  <Text
                    style={
                      item.priceType === 'INVOICED'
                        ? styles.segmentTextActive
                        : styles.segmentText
                    }
                  >
                    Faturali
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    item.priceType === 'WHITE' && styles.segmentButtonActive,
                  ]}
                  onPress={() => updateItem(item.id, { priceType: 'WHITE' })}
                >
                  <Text
                    style={
                      item.priceType === 'WHITE'
                        ? styles.segmentTextActive
                        : styles.segmentText
                    }
                  >
                    Beyaz
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {quoteItems.length === 0 && (
            <Text style={styles.helper}>Urun eklenmedi.</Text>
          )}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Teklif Olustur'}</Text>
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
  poolHeader: {
    gap: spacing.sm,
  },
  poolLabel: {
    fontFamily: fonts.semibold,
    color: colors.text,
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
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  listBlock: {
    gap: spacing.sm,
  },
  listItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  listItemActive: {
    borderColor: colors.primary,
  },
  listItemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  listItemMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
  },
  poolPrice: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  addButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  addButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  helper: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  toggleRow: {
    flexDirection: 'row',
  },
  toggleButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    fontFamily: fonts.medium,
    color: colors.text,
  },
  toggleTextActive: {
    fontFamily: fonts.medium,
    color: '#FFFFFF',
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  removeText: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  smallInput: {
    flex: 1,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  secondaryButton: {
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
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
