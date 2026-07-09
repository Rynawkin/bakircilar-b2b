import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getApiErrorMessage } from '../utils/errors';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import { normalizeSearchText } from '../utils/search';

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
const CUSTOMER_PAGE_SIZE = 50;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState<{ total: number; page: number; pageSize: number; totalPages: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const customerRequestSeqRef = useRef(0);
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

  const fetchCustomers = async (append = false, searchOverride?: string) => {
    const requestSeq = ++customerRequestSeqRef.current;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const nextPage = append ? (pagination?.page || Math.max(1, Math.ceil(customers.length / CUSTOMER_PAGE_SIZE))) + 1 : 1;
      const requestSearch = (searchOverride ?? search).trim();
      const response = await adminApi.getCustomers({
        search: requestSearch || undefined,
        page: nextPage,
        pageSize: CUSTOMER_PAGE_SIZE,
      });
      if (requestSeq !== customerRequestSeqRef.current) return;
      const nextCustomers = response.customers || [];
      const nextPagination = response.pagination || {
        total: nextCustomers.length,
        page: nextPage,
        pageSize: CUSTOMER_PAGE_SIZE,
        totalPages: nextCustomers.length >= CUSTOMER_PAGE_SIZE ? nextPage + 1 : nextPage,
      };
      setPagination(nextPagination);
      setHasMore(response.pagination ? nextPagination.page < nextPagination.totalPages : nextCustomers.length >= CUSTOMER_PAGE_SIZE);
      setCustomers((current) => {
        if (!append) return nextCustomers;
        const byId = new Map<string, Customer>();
        current.forEach((customer) => byId.set(customer.id, customer));
        nextCustomers.forEach((customer) => byId.set(customer.id, customer));
        return Array.from(byId.values());
      });
    } catch (err: any) {
      if (requestSeq !== customerRequestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Musteriler yuklenemedi.'));
    } finally {
      if (requestSeq === customerRequestSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
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
    fetchCariList();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCustomers(false, search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

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
      email: prev.email.trim().length > 0 ? prev.email : cari.code,
      password: prev.password.trim().length > 0 ? prev.password : `${cari.code}123`,
      mikroCariCode: cari.code,
      name: prev.name.trim().length > 0 ? prev.name : cari.name,
    }));
    setShowCariModal(false);
    hapticLight();
  };

  const handleCreateCustomer = async () => {
    if (savingRef.current) return;
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

    savingRef.current = true;
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
      fetchCustomers(false, search);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Musteri olusturulamadi.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const filteredCariList = useMemo(() => {
    const term = normalizeSearchText(cariSearch);
    if (!term) return cariList;
    return cariList.filter((cari) => normalizeSearchText(`${cari.code} ${cari.name}`).includes(term));
  }, [cariList, cariSearch]);

  const customerSummary = useMemo(() => {
    const registered = customers.filter((customer) => customer.mikroCariCode).length;
    const withLogin = customers.filter((customer) => customer.email).length;
    return {
      total: pagination?.total ?? customers.length,
      loaded: customers.length,
      registered,
      withLogin,
    };
  }, [customers, pagination?.total]);

  const loadMoreCustomers = () => {
    if (loading || loadingMore || !hasMore) return;
    fetchCustomers(true, search);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroTitleBlock}>
                    <Text style={styles.heroKicker}>Cari Yonetimi</Text>
                    <Text style={styles.heroTitle}>Musteriler</Text>
                    <Text style={styles.heroSubtitle}>Cari listesi, detay ve yeni musteri olusturma akislarini mobilde yonetin.</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.heroButton}
                    onPress={() => {
                      setShowCreate((prev) => !prev);
                      hapticLight();
                    }}
                  >
                    <Text style={styles.heroButtonText}>{showCreate ? 'Vazgec' : '+ Yeni'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{customerSummary.total}</Text>
                    <Text style={styles.heroMetricLabel}>Toplam</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{customerSummary.loaded}</Text>
                    <Text style={styles.heroMetricLabel}>Yuklu</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{customerSummary.registered}</Text>
                    <Text style={styles.heroMetricLabel}>Mikro</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{customerSummary.withLogin}</Text>
                    <Text style={styles.heroMetricLabel}>Giris</Text>
                  </View>
                </View>
              </View>

              <TextInput
                style={styles.search}
                placeholder="Cari ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={() => fetchCustomers(false, search)}
                returnKeyType="search"
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
          renderItem={({ item }) => {
            const initials = String(item.name || '?')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join('');
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}
              >
                <View style={styles.customerRow}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials || '?'}</Text></View>
                  <View style={styles.customerCopy}>
                    <View style={styles.customerTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
                      {item.customerType ? <Text style={styles.typeBadge}>{item.customerType}</Text> : null}
                    </View>
                    <Text style={styles.customerCode} numberOfLines={1} ellipsizeMode="middle">
                      {item.mikroCariCode || '-'}{item.sectorCode ? ` | ${item.sectorCode}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.customerMetrics}>
                  <View style={styles.customerMetric}>
                    <Text style={styles.metricLabel}>BAKIYE</Text>
                    <Text style={[styles.metricValue, Number(item.balance || 0) < 0 && styles.metricDanger]}>
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(item.balance || 0))}
                    </Text>
                  </View>
                  <View style={styles.customerMetric}>
                    <Text style={styles.metricLabel}>ODEME PLANI</Text>
                    <Text style={styles.metricValue} numberOfLines={1}>{item.paymentPlanName || (item.paymentTerm ? `${item.paymentTerm} gun` : '-')}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {[item.city, item.district, item.phone].filter(Boolean).join(' | ') || 'Iletisim bilgisi yok'}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            customers.length ? (
              <View style={styles.footer}>
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : hasMore ? (
                  <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreCustomers} disabled={loadingMore}>
                    <Text style={styles.loadMoreText}>Daha Fazla Yukle</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.endText}>Listenin sonu</Text>
                )}
              </View>
            ) : null
          }
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
                  <Text style={styles.modalItemTitle} numberOfLines={1} ellipsizeMode="middle">{item.code}</Text>
                  <Text style={styles.modalItemMeta} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
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
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroKicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  heroButton: {
    flexShrink: 0,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.primarySoft,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroMetric: {
    flexGrow: 1,
    flexBasis: 78,
    minWidth: 74,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
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
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadMoreButton: {
    minWidth: 180,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadMoreText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  endText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  createCard: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: '#C7D7F8',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  createTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.primarySoft,
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
    gap: spacing.xs,
  },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.primarySoft },
  customerCopy: { flex: 1, minWidth: 0 },
  customerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  typeBadge: { flexShrink: 0, overflow: 'hidden', borderRadius: 5, backgroundColor: colors.primaryMuted, paddingHorizontal: spacing.xs, paddingVertical: 2, fontFamily: fonts.bold, fontSize: 8, color: colors.primarySoft },
  customerCode: { marginTop: 3, fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.textMuted },
  customerMetrics: { flexDirection: 'row', gap: spacing.xs },
  customerMetric: { flex: 1, minWidth: 0, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  metricLabel: { fontFamily: fonts.monoSemibold, fontSize: 8, color: colors.textMuted },
  metricValue: { marginTop: 3, fontFamily: fonts.monoSemibold, fontSize: fontSizes.xs, color: colors.text },
  metricDanger: { color: colors.danger },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg + 5,
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
    color: colors.primarySoft,
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
    lineHeight: fontSizes.xs + 5,
    color: colors.textMuted,
  },
});
