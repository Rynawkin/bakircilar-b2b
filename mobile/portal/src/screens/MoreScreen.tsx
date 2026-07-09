import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { PortalStackParamList } from '../navigation/AppNavigator';
import { usePortalAccess } from '../context/PortalAccessContext';
import {
  hasPortalModuleAccess,
  portalModuleLinks,
  portalModuleSections,
  PortalModuleSection,
  PortalModuleLink,
} from '../navigation/portalModules';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { normalizeSearchText } from '../utils/search';

const sectionVisuals: Record<PortalModuleSection, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  'Satis ve Cari': { color: colors.primarySoft, icon: 'people-outline' },
  Operasyon: { color: colors.warning, icon: 'cube-outline' },
  Katalog: { color: colors.purple, icon: 'grid-outline' },
  Tedarik: { color: colors.success, icon: 'pricetags-outline' },
  Vitrin: { color: '#F472B6', icon: 'images-outline' },
  Rapor: { color: colors.purple, icon: 'bar-chart-outline' },
  Vade: { color: colors.warning, icon: 'time-outline' },
  Sistem: { color: colors.textSoft, icon: 'settings-outline' },
};

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { permissions, role, loading: permissionsLoading } = usePortalAccess();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<PortalModuleSection | 'Tumu'>('Tumu');
  const columns = width >= 1100 ? 3 : 2;
  const isTablet = width >= 820;
  const availableWidth = Math.min(width, 1180) - spacing.xl * 2;
  const cardWidth = columns > 1 ? Math.floor((availableWidth - spacing.md * (columns - 1)) / columns) : undefined;

  const visibleLinks = useMemo(() => {
    const term = normalizeSearchText(search);
    return portalModuleLinks.filter((link) => {
      if (!hasPortalModuleAccess(link, permissions, role)) return false;
      if (activeSection !== 'Tumu' && link.section !== activeSection) return false;
      if (!term) return true;
      return normalizeSearchText(`${link.label} ${link.description} ${link.section}`).includes(term);
    });
  }, [activeSection, permissions, role, search]);

  const groupedLinks = useMemo(() => {
    if (search.trim() || activeSection !== 'Tumu') {
      return [{ section: activeSection === 'Tumu' ? 'Sonuclar' : activeSection, rows: visibleLinks }];
    }
    return portalModuleSections
      .map((section) => ({ section, rows: visibleLinks.filter((link) => link.section === section) }))
      .filter((group) => group.rows.length > 0);
  }, [activeSection, search, visibleLinks]);

  const openModule = (link: PortalModuleLink) => {
    navigation.navigate(link.route as any, link.params as any);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isTablet && styles.containerTablet,
          { paddingBottom: spacing.xl + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Portal</Text>
          <Text style={styles.title} numberOfLines={1}>Daha Fazla</Text>
          <Text style={styles.subtitle} numberOfLines={2}>Ek moduller, raporlar ve operasyon araclari.</Text>
        </View>

        <View style={styles.controlCard}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Modul, rapor veya operasyon ara"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {(['Tumu', ...portalModuleSections] as Array<PortalModuleSection | 'Tumu'>).map((section) => (
              <TouchableOpacity
                key={section}
                style={[styles.chip, activeSection === section && styles.chipActive]}
                onPress={() => setActiveSection(section)}
              >
                <Text style={[styles.chipText, activeSection === section && styles.chipTextActive]}>{section}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.resultRow}>
            <Text style={styles.resultText}>{visibleLinks.length} modul gorunuyor</Text>
            {permissionsLoading ? (
              <View style={styles.permissionLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.resultText}>Yetkiler kontrol ediliyor</Text>
              </View>
            ) : null}
          </View>
        </View>

        {visibleLinks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sonuc bulunamadi</Text>
            <Text style={styles.cardBody}>Aramayi sadelestir veya kategori filtresini temizle.</Text>
          </View>
        ) : (
          groupedLinks.map((group) => (
            <View key={group.section} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={styles.groupTitleRow}>
                  {group.section !== 'Sonuclar' ? (
                    <View style={[styles.groupDot, { backgroundColor: sectionVisuals[group.section as PortalModuleSection]?.color || colors.primarySoft }]} />
                  ) : null}
                  <Text style={styles.groupTitle}>{group.section}</Text>
                </View>
                <Text style={styles.groupCount}>{group.rows.length}</Text>
              </View>
              <View style={[styles.list, columns > 1 && styles.listGrid]}>
                {group.rows.map((link) => (
                  <TouchableOpacity
                    key={link.label}
                    style={[styles.card, cardWidth ? { width: cardWidth } : null]}
                    onPress={() => openModule(link)}
                  >
                    <View style={[styles.moduleIcon, { backgroundColor: `${sectionVisuals[link.section].color}20` }]}>
                      <Ionicons name={sectionVisuals[link.section].icon} size={17} color={sectionVisuals[link.section].color} />
                    </View>
                    <View style={styles.cardTextWrap}>
                      <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{link.label}</Text>
                      <Text style={styles.cardBody} numberOfLines={2} ellipsizeMode="tail">{link.description}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  containerTablet: {
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#DDE8FF',
    letterSpacing: 0,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  controlCard: {
    gap: spacing.sm,
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
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
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  chipTextActive: {
    color: '#0B1F3F',
  },
  resultText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  permissionLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  group: {
    gap: spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
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
    color: colors.textMuted,
  },
  list: {
    gap: spacing.md,
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  moduleIcon: { width: 32, height: 32, flexShrink: 0, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTextWrap: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
    color: colors.text,
    marginTop: 1,
  },
  cardBody: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.xs + 4,
    color: colors.textMuted,
    marginTop: 3,
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
