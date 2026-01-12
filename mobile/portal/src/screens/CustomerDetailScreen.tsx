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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Agreement, Customer, CustomerContact, CustomerSubUser, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const CUSTOMER_TYPES = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'] as const;
const PRICE_VISIBILITY = ['INVOICED_ONLY', 'WHITE_ONLY', 'BOTH'] as const;

export function CustomerDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params: { customerId: string } };
  const { customerId } = route.params;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [subUsers, setSubUsers] = useState<CustomerSubUser[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [customerType, setCustomerType] = useState<string>('BAYI');
  const [priceVisibility, setPriceVisibility] = useState<string>('INVOICED_ONLY');
  const [invoicedList, setInvoicedList] = useState('');
  const [whiteList, setWhiteList] = useState('');
  const [active, setActive] = useState(true);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [subUserName, setSubUserName] = useState('');
  const [subUserEmail, setSubUserEmail] = useState('');
  const [subUserPassword, setSubUserPassword] = useState('');
  const [subUserAuto, setSubUserAuto] = useState(true);

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [agreementPriceInvoiced, setAgreementPriceInvoiced] = useState('');
  const [agreementPriceWhite, setAgreementPriceWhite] = useState('');
  const [agreementMinQty, setAgreementMinQty] = useState('');
  const [agreementValidFrom, setAgreementValidFrom] = useState('');
  const [agreementValidTo, setAgreementValidTo] = useState('');

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getCustomers();
      const found = response.customers.find((item) => item.id === customerId) || null;
      setCustomer(found);
      if (found) {
        setEmail(found.email || '');
        setCustomerType(found.customerType || 'BAYI');
        setPriceVisibility(found.priceVisibility || 'INVOICED_ONLY');
        setInvoicedList(found.invoicedPriceListNo?.toString() || '');
        setWhiteList(found.whitePriceListNo?.toString() || '');
        setActive(found.active !== false);
      }
    } catch (err) {
      Alert.alert('Hata', 'Musteri yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async () => {
    try {
      const [contactsRes, subUsersRes, agreementsRes] = await Promise.all([
        adminApi.getCustomerContacts(customerId),
        adminApi.getCustomerSubUsers(customerId),
        adminApi.getAgreements(customerId),
      ]);
      setContacts(contactsRes.contacts || []);
      setSubUsers(subUsersRes.subUsers || []);
      setAgreements(agreementsRes.agreements || []);
    } catch (err) {
      console.error('Customer detail load failed', err);
    }
  };

  useEffect(() => {
    loadCustomer();
    loadDetails();
  }, [customerId]);

  useEffect(() => {
    let activeSearch = true;
    const run = async () => {
      const term = productSearch.trim();
      if (!term) {
        setProductResults([]);
        return;
      }
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 10 });
        if (activeSearch) {
          setProductResults(response.products || []);
        }
      } catch (err) {
        if (activeSearch) {
          setProductResults([]);
        }
      }
    };
    run();
    return () => {
      activeSearch = false;
    };
  }, [productSearch]);

  const updateCustomer = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      await adminApi.updateCustomer(customer.id, {
        email: email || undefined,
        customerType,
        active,
        invoicedPriceListNo: invoicedList ? Number(invoicedList) : null,
        whitePriceListNo: whiteList ? Number(whiteList) : null,
        priceVisibility: priceVisibility as any,
      });
      Alert.alert('Basarili', 'Musteri guncellendi.');
      await loadCustomer();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  const addContact = async () => {
    if (!contactName.trim()) {
      Alert.alert('Eksik Bilgi', 'Kontak adi gerekli.');
      return;
    }
    try {
      await adminApi.createCustomerContact(customerId, {
        name: contactName.trim(),
        email: contactEmail.trim() || undefined,
        phone: contactPhone.trim() || undefined,
      });
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      await loadDetails();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kontak eklenemedi.');
    }
  };

  const addSubUser = async () => {
    if (!subUserName.trim()) {
      Alert.alert('Eksik Bilgi', 'Alt kullanici adi gerekli.');
      return;
    }
    try {
      const response = await adminApi.createCustomerSubUser(customerId, {
        name: subUserName.trim(),
        email: subUserEmail.trim() || undefined,
        password: subUserAuto ? undefined : subUserPassword.trim() || undefined,
        active: true,
        autoCredentials: subUserAuto,
      });
      setSubUserName('');
      setSubUserEmail('');
      setSubUserPassword('');
      await loadDetails();
      if (response.credentials) {
        Alert.alert('Otomatik Bilgiler', `Kullanici: ${response.credentials.username}\nSifre: ${response.credentials.password}`);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Alt kullanici eklenemedi.');
    }
  };

  const addAgreement = async () => {
    if (!selectedProduct) {
      Alert.alert('Eksik Bilgi', 'Urun secin.');
      return;
    }
    if (!agreementPriceInvoiced || !agreementPriceWhite) {
      Alert.alert('Eksik Bilgi', 'Fiyatlari girin.');
      return;
    }
    try {
      await adminApi.upsertAgreement({
        customerId,
        productId: selectedProduct.id,
        priceInvoiced: Number(agreementPriceInvoiced),
        priceWhite: Number(agreementPriceWhite),
        minQuantity: agreementMinQty ? Number(agreementMinQty) : undefined,
        validFrom: agreementValidFrom || undefined,
        validTo: agreementValidTo || undefined,
      });
      setAgreementPriceInvoiced('');
      setAgreementPriceWhite('');
      setAgreementMinQty('');
      setAgreementValidFrom('');
      setAgreementValidTo('');
      setSelectedProduct(null);
      setProductSearch('');
      await loadDetails();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Anlasma eklenemedi.');
    }
  };

  const deleteAgreement = async (agreementId: string) => {
    try {
      await adminApi.deleteAgreement(agreementId);
      await loadDetails();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Silme basarisiz.');
    }
  };

  const filteredProducts = useMemo(() => productResults.slice(0, 10), [productResults]);

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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Musteri Detayi</Text>

        {customer ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{customer.name}</Text>
              <Text style={styles.cardMeta}>Kod: {customer.mikroCariCode || '-'}</Text>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
              />
              <View style={styles.row}>
                {CUSTOMER_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.segmentButton, customerType === type && styles.segmentButtonActive]}
                    onPress={() => setCustomerType(type)}
                  >
                    <Text style={customerType === type ? styles.segmentTextActive : styles.segmentText}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.row}>
                {PRICE_VISIBILITY.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.segmentButton, priceVisibility === option && styles.segmentButtonActive]}
                    onPress={() => setPriceVisibility(option)}
                  >
                    <Text style={priceVisibility === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Faturali liste"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={invoicedList}
                  onChangeText={setInvoicedList}
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Beyaz liste"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={whiteList}
                  onChangeText={setWhiteList}
                />
              </View>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.segmentButton, active && styles.segmentButtonActive]}
                  onPress={() => setActive((prev) => !prev)}
                >
                  <Text style={active ? styles.segmentTextActive : styles.segmentText}>{active ? 'Aktif' : 'Pasif'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={updateCustomer} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Kontaklar</Text>
              {contacts.map((contact) => (
                <View key={contact.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{contact.name}</Text>
                  <Text style={styles.itemMeta}>{contact.email || '-'}</Text>
                  <Text style={styles.itemMeta}>{contact.phone || '-'}</Text>
                </View>
              ))}
              {contacts.length === 0 && <Text style={styles.helper}>Kontak yok.</Text>}
              <TextInput
                style={styles.input}
                placeholder="Ad Soyad"
                placeholderTextColor={colors.textMuted}
                value={contactName}
                onChangeText={setContactName}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                value={contactEmail}
                onChangeText={setContactEmail}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Telefon"
                placeholderTextColor={colors.textMuted}
                value={contactPhone}
                onChangeText={setContactPhone}
              />
              <TouchableOpacity style={styles.secondaryButton} onPress={addContact}>
                <Text style={styles.secondaryButtonText}>Kontak Ekle</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Alt Kullanici</Text>
              {subUsers.map((subUser) => (
                <View key={subUser.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{subUser.name}</Text>
                  <Text style={styles.itemMeta}>{subUser.email || '-'}</Text>
                </View>
              ))}
              {subUsers.length === 0 && <Text style={styles.helper}>Alt kullanici yok.</Text>}
              <TextInput
                style={styles.input}
                placeholder="Ad Soyad"
                placeholderTextColor={colors.textMuted}
                value={subUserName}
                onChangeText={setSubUserName}
              />
              <TextInput
                style={styles.input}
                placeholder="Email (opsiyonel)"
                placeholderTextColor={colors.textMuted}
                value={subUserEmail}
                onChangeText={setSubUserEmail}
                autoCapitalize="none"
              />
              {!subUserAuto && (
                <TextInput
                  style={styles.input}
                  placeholder="Sifre"
                  placeholderTextColor={colors.textMuted}
                  value={subUserPassword}
                  onChangeText={setSubUserPassword}
                  secureTextEntry
                />
              )}
              <TouchableOpacity
                style={[styles.segmentButton, subUserAuto && styles.segmentButtonActive]}
                onPress={() => setSubUserAuto((prev) => !prev)}
              >
                <Text style={subUserAuto ? styles.segmentTextActive : styles.segmentText}>
                  {subUserAuto ? 'Otomatik Bilgi' : 'Elle Sifre'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={addSubUser}>
                <Text style={styles.secondaryButtonText}>Alt Kullanici Ekle</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Anlasmalar</Text>
              {agreements.map((agreement) => (
                <View key={agreement.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>
                    {agreement.product?.name || agreement.productName || agreement.mikroCode || '-'}
                  </Text>
                  <Text style={styles.itemMeta}>
                    Kod: {agreement.product?.mikroCode || agreement.mikroCode || '-'}
                  </Text>
                  <Text style={styles.itemMeta}>Faturali: {agreement.priceInvoiced}</Text>
                  <Text style={styles.itemMeta}>Beyaz: {agreement.priceWhite}</Text>
                  <Text style={styles.itemMeta}>Min: {agreement.minQuantity || 1}</Text>
                  {agreement.validFrom && (
                    <Text style={styles.itemMeta}>
                      Baslangic: {agreement.validFrom.slice(0, 10)}
                    </Text>
                  )}
                  {agreement.validTo && (
                    <Text style={styles.itemMeta}>
                      Bitis: {agreement.validTo.slice(0, 10)}
                    </Text>
                  )}
                  <TouchableOpacity onPress={() => deleteAgreement(agreement.id)}>
                    <Text style={styles.removeText}>Sil</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {agreements.length === 0 && <Text style={styles.helper}>Anlasma yok.</Text>}
              <TextInput
                style={styles.input}
                placeholder="Urun ara"
                placeholderTextColor={colors.textMuted}
                value={productSearch}
                onChangeText={setProductSearch}
              />
              {filteredProducts.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={[styles.listItem, selectedProduct?.id === product.id && styles.listItemActive]}
                  onPress={() => setSelectedProduct(product)}
                >
                  <Text style={styles.listItemTitle}>{product.name}</Text>
                  <Text style={styles.listItemMeta}>{product.mikroCode}</Text>
                </TouchableOpacity>
              ))}
              {productSearch.trim().length > 0 && filteredProducts.length === 0 && (
                <Text style={styles.helper}>Urun bulunamadi.</Text>
              )}
              <TextInput
                style={styles.input}
                placeholder="Faturali fiyat"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={agreementPriceInvoiced}
                onChangeText={setAgreementPriceInvoiced}
              />
              <TextInput
                style={styles.input}
                placeholder="Beyaz fiyat"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={agreementPriceWhite}
                onChangeText={setAgreementPriceWhite}
              />
              <TextInput
                style={styles.input}
                placeholder="Min miktar"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={agreementMinQty}
                onChangeText={setAgreementMinQty}
              />
              <TextInput
                style={styles.input}
                placeholder="Baslangic (YYYY-MM-DD)"
                placeholderTextColor={colors.textMuted}
                value={agreementValidFrom}
                onChangeText={setAgreementValidFrom}
              />
              <TextInput
                style={styles.input}
                placeholder="Bitis (YYYY-MM-DD)"
                placeholderTextColor={colors.textMuted}
                value={agreementValidTo}
                onChangeText={setAgreementValidTo}
              />
              <TouchableOpacity style={styles.secondaryButton} onPress={addAgreement}>
                <Text style={styles.secondaryButtonText}>Anlasma Ekle</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.helper}>Musteri bulunamadi.</Text>
        )}
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
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  smallInput: {
    flex: 1,
  },
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
  primaryButton: {
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
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  removeText: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  helper: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  listItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
