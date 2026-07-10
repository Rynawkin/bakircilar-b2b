import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/AppNavigator';
import { CustomerAppHeader } from '../components/CustomerAppHeader';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { normalizeSearchText } from '../utils/search';

const links: Array<{
  label: string;
  route: keyof RootStackParamList;
  params?: RootStackParamList[keyof RootStackParamList];
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  section: 'Siparis' | 'Katalog' | 'Hesap';
}> = [
  { label: 'Tum Urunler', route: 'Tabs', params: { screen: 'Products' }, description: 'Katalogda urun, fiyat ve stok ara.', icon: 'grid-outline', section: 'Katalog' },
  { label: 'Indirimli Urunler', route: 'Tabs', params: { screen: 'DiscountedProducts' }, description: 'Aktif kampanya ve indirimleri incele.', icon: 'pricetag-outline', section: 'Katalog' },
  { label: 'Daha Once Aldiklarim', route: 'Tabs', params: { screen: 'PurchasedProducts' }, description: 'Gecmis alimlardan hizli tekrar siparis ver.', icon: 'bag-check-outline', section: 'Katalog' },
  { label: 'Sepet', route: 'Tabs', params: { screen: 'Cart' }, description: 'Sepeti, hediye ve tamamlayici onerileri kontrol et.', icon: 'cart-outline', section: 'Siparis' },
  { label: 'Siparislerim', route: 'Orders', description: 'Siparis durumlarim ve detaylar.', icon: 'cart-outline', section: 'Siparis' },
  { label: 'Talepler', route: 'Requests', description: 'Alt kullanici taleplerini onayla.', icon: 'git-pull-request-outline', section: 'Siparis' },
  { label: 'Taleplerim', route: 'Tasks', description: 'Talep listesi ve yorumlar.', icon: 'checkbox-outline', section: 'Siparis' },
  { label: 'Bekleyen Siparisler', route: 'PendingOrders', description: 'Acik teslimatlar ve bakiye.', icon: 'time-outline', section: 'Siparis' },
  { label: 'Teklifler', route: 'Quotes', description: 'Teklifleri incele ve yanitla.', icon: 'document-text-outline', section: 'Siparis' },
  { label: 'Anlasmali Fiyatlar', route: 'Agreements', description: 'Sabit fiyat listelerini gor.', icon: 'pricetag-outline', section: 'Katalog' },
  { label: 'Koleksiyonlar', route: 'Collections', description: 'Ozel urun gruplarini incele.', icon: 'albums-outline', section: 'Katalog' },
  { label: 'Yeni Kategoriler', route: 'NewCategories', description: 'Henuz almadigin kategori ve urunleri kesfet.', icon: 'sparkles-outline', section: 'Katalog' },
  { label: 'Faturalarim', route: 'Invoices', description: 'E-faturalarini PDF olarak ac.', icon: 'receipt-outline', section: 'Hesap' },
  { label: 'Bildirimler', route: 'Notifications', description: 'Son bildirimleri gor.', icon: 'notifications-outline', section: 'Hesap' },
  { label: 'Tercihler', route: 'Preferences', description: 'KDV gorunumu ayarlari.', icon: 'options-outline', section: 'Hesap' },
  { label: 'Profil', route: 'Profile', description: 'Hesap ayarlari ve tercihler.', icon: 'person-circle-outline', section: 'Hesap' },
];

const sections = ['Tumu', 'Siparis', 'Katalog', 'Hesap'] as const;

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]>('Tumu');
  const columns = width >= 960 ? 3 : width >= 620 ? 2 : 1;
  const availableWidth = Math.max(320, width - spacing.xl * 2);
  const cardWidth = columns > 1 ? Math.floor((availableWidth - spacing.md * (columns - 1)) / columns) : undefined;
  const isTablet = width >= 820;
  const visibleLinks = useMemo(() => {
    const term = normalizeSearchText(search);
    return links.filter((link) => {
      const matchesSection = activeSection === 'Tumu' || link.section === activeSection;
      const matchesSearch = !term || normalizeSearchText(`${link.label} ${link.description} ${link.section}`).includes(term);
      return matchesSection && matchesSearch;
    });
  }, [activeSection, search]);

  const openLink = (link: (typeof links)[number]) => {
    navigation.navigate(link.route as any, link.params as any);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <CustomerAppHeader />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isTablet && styles.containerTablet,
          { paddingBottom: spacing.xl + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>B2B Menu</Text>
          <Text style={styles.title}>Daha Fazla</Text>
          <Text style={styles.subtitle}>Siparis, fatura, teklif ve hesap islemleri.</Text>
        </View>

        <View style={styles.searchCard}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Menu veya islem ara"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          <Text style={styles.searchCount}>{visibleLinks.length}</Text>
        </View>

        <View style={styles.sectionRow}>
          {sections.map((section) => {
            const isActive = activeSection === section;
            const count = section === 'Tumu' ? links.length : links.filter((link) => link.section === section).length;
            return (
              <TouchableOpacity
                key={section}
                style={[styles.sectionChip, isActive && styles.sectionChipActive]}
                onPress={() => setActiveSection(section)}
              >
                <Text style={isActive ? styles.sectionChipTextActive : styles.sectionChipText}>
                  {section}
                </Text>
                <Text style={isActive ? styles.sectionChipCountActive : styles.sectionChipCount}>
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.list, columns > 1 && styles.listGrid]}>
          {visibleLinks.map((link) => (
            <TouchableOpacity
              key={link.label}
              style={[styles.card, cardWidth ? { width: cardWidth } : null]}
              onPress={() => openLink(link)}
            >
              <View style={styles.cardIcon}>
                <Ionicons name={link.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.cardBodyWrap}>
                <Text style={styles.sectionTag}>{link.section}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>{link.label}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{link.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
        {visibleLinks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.cardTitle}>Sonuc bulunamadi</Text>
            <Text style={styles.cardBody}>Aramayi sadelestirip tekrar deneyin.</Text>
          </View>
        ) : null}
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
    paddingVertical: spacing.md,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: colors.textStrong,
    marginTop: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  searchCard: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    shadowColor: '#0A2A57',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  searchCount: {
    minWidth: 28,
    textAlign: 'center',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  sectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionChip: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sectionChipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  sectionChipTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  sectionChipCount: {
    minWidth: 22,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  sectionChipCountActive: {
    minWidth: 22,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#DDE8FF',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primaryDark,
  },
  list: {
    gap: spacing.md,
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0A2A57',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBodyWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sectionTag: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardBody: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
