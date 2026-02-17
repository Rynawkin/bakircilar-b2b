import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
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
import { Customer, CustomerType, PriceVisibility } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type MikroCari = {
  code: string;
  name: string;
  city?: string;
  district?: string;
  phone?: string;
  isLocked?: boolean;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
  hasEInvoice?: boolean;
  balance?: number;
};

const CUSTOMER_TYPES: Array<{ value: CustomerType; label: string }> = [
  { value: 'PERAKENDE', label: 'Perakende' },
  { value: 'BAYI', label: 'Bayi' },
  { value: 'VIP', label: 'VIP' },
  { value: 'OZEL', label: 'Ozel' },
];

const PRICE_VISIBILITY: Array<{ value: PriceVisibility; label: string }> = [
  { value: 'INVOICED_ONLY', label: 'Sadece Faturali' },
  { value: 'WHITE_ONLY', label: 'Sadece Beyaz' },
  { value: 'BOTH', label: 'Faturali + Beyaz' },
];

const getPaymentPlanLabel = (cari?: MikroCari | null) => {
  if (!cari) return '-';
  if (cari.paymentPlanCode || cari.paymentPlanName) {
    return [cari.paymentPlanCode, cari.paymentPlanName].filter(Boolean).join(' - ');
  }
  if (cari.paymentTerm !== undefined && cari.paymentTerm !== null) return `${cari.paymentTerm} gun`;
  return '-';
};

export function CustomersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCariModal, setShowCariModal] = useState(false);
  const [cariSearch, setCariSearch] = useState('');
  const [cariList, setCariList] = useState<MikroCari[]>([]);
  const [selectedCari, setSelectedCari] = useState<MikroCari | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    customerType: 'PERAKENDE' as CustomerType,
    mikroCariCode: '',
    priceVisibility: 'INVOICED_ONLY' as PriceVisibility,
  });

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getCustomers();
      setCustomers(response.customers || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Musteriler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCariList = async () => {
    try {
      const response = await adminApi.getCariList();
      setCariList(response.cariList || []);
    } catch {
      setCariList([]);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchCariList();
  }, []);

  const resetCreateForm = () => {
    setShowCreate(false);
    setSelectedCari(null);
    setCariSearch('');
    setFormData({
      email: '',
      password: '',
      name: '',
      customerType: 'PERAKENDE',
      mikroCariCode: '',
      priceVisibility: 'INVOICED_ONLY',
    });
  };

  const handleSelectCari = (cari: MikroCari) => {
    setSelectedCari(cari);
    setFormData((prev) => ({
      ...prev,
      mikroCariCode: cari.code,
      name: prev.name.trim().length > 0 ? prev.name : cari.name,
    }));
    setShowCariModal(false);
    hapticLight();
  };

  const handleCreateCustomer = async () => {
    const email = formData.email.trim();
    const name = formData.name.trim();
    const password = formData.password.trim();

    if (!selectedCari) {
      Alert.alert('Eksik Bilgi', 'Once Mikro cari secmelisiniz.');
      return;
    }
    if (!email || !name || !password) {
      Alert.alert('Eksik Bilgi', 'Kullanici, ad ve sifre alanlari zorunlu.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Eksik Bilgi', 'Sifre en az 6 karakter olmali.');
      return;
    }

    setSaving(true);
    try {
      await adminApi.createCustomer({
        email,
        password,
        name,
        customerType: formData.customerType,
        mikroCariCode: formData.mikroCariCode,
        priceVisibility: formData.priceVisibility,
      });
      hapticSuccess();
      Alert.alert('Basarili', 'Musteri olusturuldu.');
      resetCreateForm();
      fetchCustomers();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Musteri olusturulamadi.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => {
      const haystack = `${customer.name} ${customer.mikroCariCode || ''} ${customer.email || ''} ${
        customer.city || ''
      } ${customer.district || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [customers, search]);

  const filteredCariList = useMemo(() => {
    const term = cariSearch.trim().toLowerCase();
    if (!term) return cariList;
    return cariList.filter((cari) => `${cari.code} ${cari.name}`.toLowerCase().includes(term));
  }, [cariList, cariSearch]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.title}>Musteriler</Text>
                  <Text style={styles.subtitle}>Cari listesi, detay ve yeni musteri olusturma.</Text>
                </View>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    setShowCreate((prev) => !prev);
                    hapticLight();
                  }}
                >
                  <Text style={styles.primaryButtonText}>{showCreate ? 'Vazgec' : '+ Yeni Musteri'}</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.search}
                placeholder="Cari ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              {error && <Text style={styles.error}>{error}</Text>}

              {showCreate && (
                <View style={styles.createCard}>
                  <Text style={styles.createTitle}>Yeni Musteri</Text>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowCariModal(true)}>
                    <Text style={styles.secondaryButtonText}>
                      {formData.mikroCariCode ? `${formData.mikroCariCode} - ${formData.name}` : 'Mikro cari sec'}
                    </Text>
                  </TouchableOpacity>

                  <TextInput
                    style={styles.input}
                    placeholder="Ad Soyad"
                    placeholderTextColor={colors.textMuted}
                    value={formData.name}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Kullanici adi / e-posta"
                    placeholderTextColor={colors.textMuted}
                    value={formData.email}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, email: value }))}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Sifre (min 6)"
                    placeholderTextColor={colors.textMuted}
                    value={formData.password}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, password: value }))}
                    secureTextEntry
                  />

                  <Text style={styles.sectionLabel}>Musteri Segmenti</Text>
                  <View style={styles.segmentRow}>
                    {CUSTOMER_TYPES.map((item) => (
                      <TouchableOpacity
                        key={item.value}
                        style={[
                          styles.segmentButton,
                          formData.customerType === item.value && styles.segmentButtonActive,
                        ]}
                        onPress={() => setFormData((prev) => ({ ...prev, customerType: item.value }))}
                      >
                        <Text
                          style={
                            formData.customerType === item.value
                              ? styles.segmentTextActive
                              : styles.segmentText
                          }
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.sectionLabel}>Fiyat Gorunurlugu</Text>
                  <View style={styles.segmentColumn}>
                    {PRICE_VISIBILITY.map((item) => (
                      <TouchableOpacity
                        key={item.value}
                        style={[
                          styles.segmentButton,
                          formData.priceVisibility === item.value && styles.segmentButtonActive,
                        ]}
                        onPress={() => setFormData((prev) => ({ ...prev, priceVisibility: item.value }))}
                      >
                        <Text
                          style={
                            formData.priceVisibility === item.value
                              ? styles.segmentTextActive
                              : styles.segmentText
                          }
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>Mikro Bilgileri</Text>
                    <Text style={styles.infoText}>Sehir: {selectedCari?.city || '-'}</Text>
                    <Text style={styles.infoText}>Ilce: {selectedCari?.district || '-'}</Text>
                    <Text style={styles.infoText}>Telefon: {selectedCari?.phone || '-'}</Text>
                    <Text style={styles.infoText}>Grup: {selectedCari?.groupCode || '-'}</Text>
                    <Text style={styles.infoText}>Sektor: {selectedCari?.sectorCode || '-'}</Text>
                    <Text style={styles.infoText}>Vade Plani: {getPaymentPlanLabel(selectedCari)}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, (!selectedCari || saving) && styles.disabledButton]}
                    onPress={handleCreateCustomer}
                    disabled={!selectedCari || saving}
                  >
                    <Text style={styles.primaryButtonText}>{saving ? 'Olusturuluyor...' : 'Musteri Olustur'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.mikroCariCode && <Text style={styles.cardMeta}>Kod: {item.mikroCariCode}</Text>}
              {item.city && <Text style={styles.cardMeta}>Sehir: {item.city}</Text>}
              {item.district && <Text style={styles.cardMeta}>Ilce: {item.district}</Text>}
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showCariModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mikro Cari Sec</Text>
              <TouchableOpacity onPress={() => setShowCariModal(false)}>
                <Text style={styles.link}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Cari kodu veya unvan ara"
              placeholderTextColor={colors.textMuted}
              value={cariSearch}
              onChangeText={setCariSearch}
            />
            <FlatList
              data={filteredCariList}
              keyExtractor={(item) => item.code}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectCari(item)}>
                  <Text style={styles.modalItemTitle}>{item.code}</Text>
                  <Text style={styles.modalItemMeta}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  createCard: {
    backgroundColor: '#EEF3FF',
    borderWidth: 1,
    borderColor: '#C7D7F8',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  createTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },
  sectionLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  segmentColumn: {
    gap: spacing.xs,
  },
  segmentButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  infoTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  infoText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.medium,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  disabledButton: {
    opacity: 0.5,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  link: {
    fontFamily: fonts.medium,
    color: colors.primary,
    fontSize: fontSizes.sm,
  },
  modalList: {
    marginTop: spacing.xs,
  },
  modalItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  modalItemTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  modalItemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
});

