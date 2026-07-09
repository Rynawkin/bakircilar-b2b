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
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  MobilePaginationMeta,
  ProductAliasItem,
  SearchMissItem,
  SearchMissStatus,
  adminApi,
} from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type TabKey = 'misses' | 'aliases';

const PAGE_SIZE = 20;
const EMPTY_PAGINATION: MobilePaginationMeta = { total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 };

const statusOptions: Array<{ value: SearchMissStatus; label: string }> = [
  { value: 'open', label: 'Acik' },
  { value: 'resolved', label: 'Cozuldu' },
  { value: 'all', label: 'Tumu' },
];

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function Pager({
  pagination,
  onChange,
}: {
  pagination: MobilePaginationMeta;
  onChange: (page: number) => void;
}) {
  if (!pagination.total || pagination.totalPages <= 1) return null;
  return (
    <View style={styles.pager}>
      <TouchableOpacity
        style={[styles.pagerButton, pagination.page <= 1 && styles.disabledButton]}
        disabled={pagination.page <= 1}
        onPress={() => onChange(Math.max(1, pagination.page - 1))}
      >
        <Text style={styles.pagerButtonText}>Onceki</Text>
      </TouchableOpacity>
      <Text style={styles.pagerText}>
        {pagination.page}/{Math.max(1, pagination.totalPages)} · {pagination.total} kayit
      </Text>
      <TouchableOpacity
        style={[styles.pagerButton, pagination.page >= pagination.totalPages && styles.disabledButton]}
        disabled={pagination.page >= pagination.totalPages}
        onPress={() => onChange(Math.min(pagination.totalPages, pagination.page + 1))}
      >
        <Text style={styles.pagerButtonText}>Sonraki</Text>
      </TouchableOpacity>
    </View>
  );
}

function AliasCard({
  item,
  onSaved,
}: {
  item: ProductAliasItem;
  onSaved: (id: string, aliases: string) => void;
}) {
  const [value, setValue] = useState(item.searchAliases || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(item.searchAliases || '');
  }, [item.id, item.searchAliases]);

  const dirty = value.trim() !== String(item.searchAliases || '').trim();

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await adminApi.updateProductAliases(item.id, value);
      onSaved(item.id, value.trim());
    } catch (err: any) {
      Alert.alert('Kaydedilemedi', getApiErrorMessage(err, 'Es-anlam kaydedilemedi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">
            {item.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">
            {item.mikroCode} · {item.categoryName || 'Kategori yok'}
          </Text>
        </View>
        <View style={[styles.statusBadge, dirty ? styles.statusWarning : styles.statusOk]}>
          <Text style={[styles.statusBadgeText, dirty ? styles.statusWarningText : styles.statusOkText]}>
            {dirty ? 'Degisti' : 'Kayitli'}
          </Text>
        </View>
      </View>

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="cop torbasi, poset, naylon"
        placeholderTextColor={colors.textMuted}
        style={styles.aliasInput}
        multiline
      />
      <TouchableOpacity
        style={[styles.primaryButton, (!dirty || saving) && styles.disabledButton]}
        disabled={!dirty || saving}
        onPress={save}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function SearchManagementScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { width } = useWindowDimensions();
  const isTablet = width >= 820;

  const [activeTab, setActiveTab] = useState<TabKey>('misses');
  const [status, setStatus] = useState<SearchMissStatus>('open');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [misses, setMisses] = useState<SearchMissItem[]>([]);
  const [aliases, setAliases] = useState<ProductAliasItem[]>([]);
  const [pagination, setPagination] = useState<MobilePaginationMeta>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingMissId, setSavingMissId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setPagination(EMPTY_PAGINATION);
  }, [activeTab, status]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'misses') {
        const response = await adminApi.getSearchMisses({ status, search, page, pageSize: PAGE_SIZE });
        setMisses(response.items || []);
        setPagination(response.pagination || EMPTY_PAGINATION);
      } else {
        const response = await adminApi.getProductAliases({ search, page, pageSize: PAGE_SIZE });
        setAliases(response.items || []);
        setPagination(response.pagination || EMPTY_PAGINATION);
      }
    } catch (err: any) {
      const message = getApiErrorMessage(err, 'Arama yonetimi verisi alinamadi.');
      setError(message);
      if (activeTab === 'misses') setMisses([]);
      else setAliases([]);
      setPagination(EMPTY_PAGINATION);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeTab, status, search, page]);

  const heroCounts = useMemo(() => {
    const open = activeTab === 'misses' ? misses.filter((item) => !item.resolved).length : 0;
    const aliasFilled = activeTab === 'aliases' ? aliases.filter((item) => !!item.searchAliases?.trim()).length : 0;
    return {
      listed: activeTab === 'misses' ? misses.length : aliases.length,
      helper: activeTab === 'misses' ? `${open} acik satir` : `${aliasFilled} alias dolu`,
    };
  }, [activeTab, aliases, misses]);

  const toggleMiss = async (item: SearchMissItem) => {
    if (savingMissId) return;
    setSavingMissId(item.id);
    try {
      await adminApi.updateSearchMiss(item.id, !item.resolved);
      if (status === 'all') {
        setMisses((prev) => prev.map((row) => (row.id === item.id ? { ...row, resolved: !row.resolved } : row)));
      } else {
        await load();
      }
    } catch (err: any) {
      Alert.alert('Guncellenemedi', getApiErrorMessage(err, 'Arama durumu guncellenemedi.'));
    } finally {
      setSavingMissId(null);
    }
  };

  const handleAliasSaved = (id: string, value: string) => {
    setAliases((prev) => prev.map((row) => (row.id === id ? { ...row, searchAliases: value || null } : row)));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Arama Kalitesi</Text>
          <Text style={styles.title}>Arama Yonetimi</Text>
          <Text style={styles.subtitle}>
            Sonucsuz aramalari kapat, urun es-anlamlarini gir ve katalog aramasini sahadan iyilestir.
          </Text>
          <View style={styles.heroPillRow}>
            <Text style={styles.heroPill}>{heroCounts.listed} satir</Text>
            <Text style={styles.heroPill}>{heroCounts.helper}</Text>
          </View>
        </View>

        <View style={styles.controlCard}>
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentButton, activeTab === 'misses' && styles.segmentActive]}
              onPress={() => setActiveTab('misses')}
            >
              <Text style={[styles.segmentText, activeTab === 'misses' && styles.segmentTextActive]}>
                Sonucsuz
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, activeTab === 'aliases' && styles.segmentActive]}
              onPress={() => setActiveTab('aliases')}
            >
              <Text style={[styles.segmentText, activeTab === 'aliases' && styles.segmentTextActive]}>
                Es-anlam
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder={activeTab === 'misses' ? 'Arama terimi ara' : 'Urun adi veya kodu ara'}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />

          {activeTab === 'misses' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {statusOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.chip, status === option.value && styles.chipActive]}
                  onPress={() => setStatus(option.value)}
                >
                  <Text style={[styles.chipText, status === option.value && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.helperText}>Virgulle ayrilan kelimeler urunun aramada bulunmasini saglar.</Text>
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.helperText}>Yukleniyor...</Text>
          </View>
        ) : activeTab === 'misses' ? (
          <View style={styles.list}>
            {misses.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleBlock}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.sampleTerm || item.normalizedTerm}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">
                      Normalize: {item.normalizedTerm}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, item.resolved ? styles.statusOk : styles.statusWarning]}>
                    <Text style={[styles.statusBadgeText, item.resolved ? styles.statusOkText : styles.statusWarningText]}>
                      {item.resolved ? 'Cozuldu' : 'Acik'}
                    </Text>
                  </View>
                </View>
                <View style={styles.metricRow}>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Tekrar</Text>
                    <Text style={styles.metricValue}>{item.count}</Text>
                  </View>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Son arama</Text>
                    <Text style={styles.metricValueSmall}>{formatDate(item.lastSearchedAt)}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.secondaryButton, savingMissId === item.id && styles.disabledButton]}
                  disabled={savingMissId === item.id}
                  onPress={() => toggleMiss(item)}
                >
                  <Text style={styles.secondaryButtonText}>
                    {savingMissId === item.id
                      ? 'Guncelleniyor...'
                      : item.resolved
                        ? 'Acik olarak isaretle'
                        : 'Cozuldu olarak isaretle'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
            {misses.length === 0 ? <Text style={styles.emptyText}>Kayit bulunamadi.</Text> : null}
          </View>
        ) : (
          <View style={styles.list}>
            {aliases.map((item) => (
              <AliasCard key={item.id} item={item} onSaved={handleAliasSaved} />
            ))}
            {aliases.length === 0 ? <Text style={styles.emptyText}>Urun bulunamadi.</Text> : null}
          </View>
        )}

        <Pager pagination={pagination} onChange={setPage} />
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
  containerTablet: {
    maxWidth: 1040,
    alignSelf: 'center',
    width: '100%',
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primarySoft,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    color: '#DDE8FF',
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
  },
  heroPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroPill: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  controlCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minWidth: 96,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  searchInput: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  chipRow: {
    gap: spacing.sm,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  list: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: '#020713',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  statusBadgeText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
  },
  statusOk: {
    backgroundColor: colors.successSoft,
  },
  statusOkText: {
    color: colors.success,
  },
  statusWarning: {
    backgroundColor: colors.warningSoft,
  },
  statusWarningText: {
    color: colors.warning,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  metricBox: {
    flex: 1,
    minWidth: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  metricLabel: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  metricValue: {
    marginTop: 2,
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.lg,
  },
  metricValueSmall: {
    marginTop: 2,
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  aliasInput: {
    minHeight: 78,
    textAlignVertical: 'top',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
  },
  disabledButton: {
    opacity: 0.55,
  },
  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  helperText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
  },
  errorText: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  emptyText: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  pagerButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pagerButtonText: {
    fontFamily: fonts.semibold,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
  },
  pagerText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.medium,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
});
