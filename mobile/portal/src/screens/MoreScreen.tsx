import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const links: Array<{ label: string; route: keyof PortalStackParamList; description: string }> = [
  { label: 'Portfoy', route: 'Portfolio', description: 'Atanan cari portfoyu ve aktiflik.' },
  { label: 'Musteriler', route: 'Customers', description: 'Cari listesi ve fiyat ayarlari.' },
  { label: 'Anlasmalar', route: 'CustomerAgreements', description: 'Anlasmali fiyat listesi.' },
  { label: 'Teklif Kalemleri', route: 'QuoteLines', description: 'Teklif satirlarini kapat/ac yonetimi.' },
  { label: 'Arama', route: 'Search', description: 'Stok ve cari arama.' },
  { label: 'Urunler', route: 'Products', description: 'Stok ve fiyat incelemesi.' },
  { label: 'Tamamlayici Yonetimi', route: 'ComplementManagement', description: 'Oto/manuel tamamlayici urun ayarlari.' },
  { label: 'Urun Override', route: 'ProductOverrides', description: 'Urun bazli fiyat marji.' },
  { label: 'Tedarikci Ayarlari', route: 'SupplierPriceListSettings', description: 'Tedarikci iskonto ve eslestirme ayarlari.' },
  { label: 'Tedarikci Yuklemeleri', route: 'SupplierPriceLists', description: 'Excel/PDF fiyat listesi yukleme ve rapor.' },
  { label: 'Kategoriler', route: 'Categories', description: 'Kategori fiyat kurallari.' },
  { label: 'Kampanyalar', route: 'Campaigns', description: 'Kampanya ve indirim akisi.' },
  { label: 'Fiyat Haric Tut', route: 'Exclusions', description: 'Dislama listeleri.' },
  { label: 'Vade Takip', route: 'Vade', description: 'Geciken bakiyeler ve notlar.' },
  { label: 'Ekstre', route: 'Ekstre', description: 'Cari hareket foye goruntuleme.' },
  { label: 'Raporlar', route: 'Reports', description: 'Karlilik ve performans raporlari.' },
  { label: 'Siparis Takip', route: 'OrderTracking', description: 'Gecikme ve mail akisi.' },
  { label: 'E-Fatura', route: 'EInvoices', description: 'Gonderilen fatura listesi.' },
  { label: 'Personel', route: 'Staff', description: 'Satis temsilcisi ayarlari.' },
  { label: 'Rol Yetkileri', route: 'RolePermissions', description: 'Rol izinleri ve erisimler.' },
  { label: 'Ayarlar', route: 'Settings', description: 'Genel sistem ayarlari.' },
  { label: 'Senkronizasyon', route: 'Sync', description: 'Mikro senkron takibi.' },
];

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Daha Fazla</Text>
        <Text style={styles.subtitle}>Ek moduller, raporlar ve operasyon araclari.</Text>

        <View style={styles.list}>
          {links.map((link) => (
            <TouchableOpacity
              key={link.label}
              style={styles.card}
              onPress={() => navigation.navigate(link.route as never)}
            >
              <Text style={styles.cardTitle}>{link.label}</Text>
              <Text style={styles.cardBody}>{link.description}</Text>
            </TouchableOpacity>
          ))}
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
  list: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primarySoft,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardBody: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
