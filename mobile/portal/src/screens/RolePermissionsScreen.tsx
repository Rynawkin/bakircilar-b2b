import { useEffect, useMemo, useRef, useState } from 'react';
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

import { adminApi } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { normalizeSearchText } from '../utils/search';

const ROLE_NAMES: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Yonetici',
  SALES_REP: 'Satis Personeli',
  DEPOCU: 'Depocu',
  CUSTOMER: 'Musteri',
  DIVERSEY: 'Diversey',
};

const CATEGORY_NAMES: Record<string, string> = {
  dashboard: 'Dashboard',
  reports: 'Raporlar',
  admin: 'Admin',
};

const CATEGORY_ORDER = ['dashboard', 'reports', 'admin'];

export function RolePermissionsScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [roles, setRoles] = useState<string[]>([]);
  const [activeRole, setActiveRole] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [availablePermissions, setAvailablePermissions] = useState<Record<string, string>>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savingKeyRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);
  const columns = width >= 1080 ? 2 : 1;
  const isTablet = width >= 820;
  const availableWidth = Math.min(width, 1180) - spacing.xl * 2;
  const cardWidth = columns > 1 ? Math.floor((availableWidth - spacing.md) / 2) : undefined;

  const beginSaving = (key: string) => {
    if (savingKeyRef.current) return false;
    savingKeyRef.current = key;
    setSavingKey(key);
    return true;
  };

  const endSaving = () => {
    savingKeyRef.current = null;
    setSavingKey(null);
  };

  const fetchPermissions = async () => {
    const requestSeq = ++fetchSeqRef.current;
    try {
      setLoading(true);
      const response = await adminApi.getAllRolePermissions();
      if (requestSeq !== fetchSeqRef.current) return;
      const roleKeys = Object.keys(response.permissions || {});
      setRoles(roleKeys);
      setActiveRole((prev) => prev || roleKeys[0] || '');
      setPermissions(response.permissions || {});
      setAvailablePermissions(response.availablePermissions || {});
      setDescriptions(response.permissionDescriptions || {});
    } catch (err: any) {
      if (requestSeq !== fetchSeqRef.current) return;
      Alert.alert('Hata', getApiErrorMessage(err, 'Yetkiler yuklenemedi.'));
    } finally {
      if (requestSeq === fetchSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const rolePermissions = activeRole ? permissions[activeRole] || {} : {};

  const categories = useMemo(() => {
    const seen = new Set(Object.keys(rolePermissions).map((key) => key.split(':')[0]));
    return CATEGORY_ORDER.filter((category) => seen.has(category));
  }, [rolePermissions]);

  const roleSummary = useMemo(() => {
    const total = Object.keys(rolePermissions).length;
    const enabled = Object.values(rolePermissions).filter(Boolean).length;
    return { total, enabled, disabled: Math.max(total - enabled, 0) };
  }, [rolePermissions]);

  const filteredGroups = useMemo(() => {
    const term = normalizeSearchText(search);
    return categories
      .map((category) => {
        const rows = Object.entries(rolePermissions)
          .filter(([key]) => key.split(':')[0] === category)
          .filter(([key]) => activeCategory === 'all' || key.split(':')[0] === activeCategory)
          .filter(([key]) => {
            if (!term) return true;
            const label = availablePermissions[key] || key;
            const description = descriptions[key] || '';
            return normalizeSearchText(`${key} ${label} ${description} ${category}`).includes(term);
          })
          .sort(([a], [b]) => a.localeCompare(b));
        return { category, rows };
      })
      .filter((group) => group.rows.length > 0);
  }, [activeCategory, availablePermissions, categories, descriptions, rolePermissions, search]);

  const togglePermission = async (permissionKey: string) => {
    if (!activeRole) return;
    const roleKey = activeRole;
    if (!beginSaving(permissionKey)) return;
    const current = permissions[roleKey]?.[permissionKey] ?? false;
    try {
      await adminApi.setRolePermission(roleKey, permissionKey, !current);
      setPermissions((prev) => ({
        ...prev,
        [roleKey]: { ...prev[roleKey], [permissionKey]: !current },
      }));
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Guncelleme basarisiz.'));
    } finally {
      endSaving();
    }
  };

  const resetRole = () => {
    if (!activeRole || savingKeyRef.current) return;
    const roleKey = activeRole;
    Alert.alert(
      'Yetkileri sifirla',
      `${ROLE_NAMES[roleKey] || roleKey} rolu varsayilan yetkilere dondurulsun mu?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Sifirla',
          style: 'destructive',
          onPress: async () => {
            if (!beginSaving('__reset__')) return;
            try {
              await adminApi.resetRolePermissions(roleKey);
              await fetchPermissions();
            } catch (err: any) {
              Alert.alert('Hata', getApiErrorMessage(err, 'Sifirlama basarisiz.'));
            } finally {
              endSaving();
            }
          },
        },
      ]
    );
  };

  if (user?.role !== 'HEAD_ADMIN') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.accessDenied}>
          <Text style={styles.title}>Erisim Engellendi</Text>
          <Text style={styles.subtitle}>Rol yetkileri sadece HEAD_ADMIN tarafindan yonetilir.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.subtitle}>Yetkiler yukleniyor</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.container, isTablet && styles.containerTablet]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Sistem</Text>
          <Text style={styles.heroTitle}>Rol Yetkileri</Text>
          <Text style={styles.heroSubtitle}>Izinler aninda kaydedilir. HEAD_ADMIN her zaman tum yetkilere sahiptir.</Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, cardWidth ? { width: cardWidth } : null]}>
            <Text style={styles.summaryLabel}>Secili Rol</Text>
            <Text style={styles.summaryValue}>{ROLE_NAMES[activeRole] || activeRole || '-'}</Text>
          </View>
          <View style={[styles.summaryCard, cardWidth ? { width: cardWidth } : null]}>
            <Text style={styles.summaryLabel}>Yetki Durumu</Text>
            <Text style={styles.summaryValue}>{roleSummary.enabled}/{roleSummary.total}</Text>
            <Text style={styles.summaryMeta}>{roleSummary.disabled} kapali</Text>
          </View>
        </View>

        <View style={styles.controlCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {roles.map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.chip, activeRole === role && styles.chipActive]}
                onPress={() => setActiveRole(role)}
              >
                <Text style={[styles.chipText, activeRole === role && styles.chipTextActive]}>
                  {ROLE_NAMES[role] || role}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Yetki adi, anahtar veya aciklama ara"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {['all', ...categories].map((category) => (
              <TouchableOpacity
                key={category}
                style={[styles.categoryChip, activeCategory === category && styles.categoryChipActive]}
                onPress={() => setActiveCategory(category)}
              >
                <Text style={[styles.categoryText, activeCategory === category && styles.categoryTextActive]}>
                  {category === 'all' ? 'Tumu' : CATEGORY_NAMES[category] || category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.resetButton, savingKey === '__reset__' && styles.disabledButton]}
            onPress={resetRole}
            disabled={savingKey === '__reset__'}
          >
            <Text style={styles.resetButtonText}>
              {savingKey === '__reset__' ? 'Sifirlaniyor...' : 'Rol Yetkilerini Sifirla'}
            </Text>
          </TouchableOpacity>
        </View>

        {filteredGroups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sonuc bulunamadi</Text>
            <Text style={styles.cardMeta}>Aramayi veya kategori filtresini sadelestir.</Text>
          </View>
        ) : (
          filteredGroups.map((group) => (
            <View key={group.category} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{CATEGORY_NAMES[group.category] || group.category}</Text>
                <Text style={styles.groupCount}>{group.rows.length}</Text>
              </View>
              <View style={[styles.permissionGrid, columns > 1 && styles.permissionGridTablet]}>
                {group.rows.map(([key, enabled]) => {
                  const saving = savingKey === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.card, cardWidth ? { width: cardWidth } : null]}
                      onPress={() => togglePermission(key)}
                      disabled={!!savingKey}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardTextArea}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{availablePermissions[key] || key}</Text>
                          <Text style={styles.permissionKey}>{key}</Text>
                        </View>
                        <View style={[styles.switchTrack, enabled && styles.switchTrackOn, saving && styles.switchSaving]}>
                          <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
                        </View>
                      </View>
                      {descriptions[key] ? <Text style={styles.cardMeta}>{descriptions[key]}</Text> : null}
                      <Text style={[styles.statusText, enabled ? styles.statusOn : styles.statusOff]}>
                        {saving ? 'Kaydediliyor' : enabled ? 'Acik' : 'Kapali'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
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
  container: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  containerTablet: {
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#DDE8FF',
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
    color: '#DDE8FF',
    marginTop: spacing.xs,
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
  loadingCard: {
    margin: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accessDenied: {
    margin: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryCard: {
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  summaryLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
    marginTop: spacing.xs,
  },
  summaryMeta: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  controlCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  chipRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
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
  searchInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  categoryChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryChipActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primarySoft,
  },
  categoryText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  categoryTextActive: {
    color: colors.primarySoft,
  },
  resetButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  resetButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  disabledButton: {
    opacity: 0.6,
  },
  group: {
    gap: spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  groupCount: {
    minWidth: 28,
    textAlign: 'center',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
  },
  permissionGrid: {
    gap: spacing.md,
  },
  permissionGridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    minHeight: 142,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cardTextArea: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  permissionKey: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 3,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    padding: 3,
  },
  switchTrackOn: {
    backgroundColor: colors.primary,
  },
  switchSaving: {
    opacity: 0.7,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
  },
  switchThumbOn: {
    transform: [{ translateX: 20 }],
  },
  statusText: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
  },
  statusOn: {
    backgroundColor: colors.successSoft,
    color: colors.success,
  },
  statusOff: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
});
