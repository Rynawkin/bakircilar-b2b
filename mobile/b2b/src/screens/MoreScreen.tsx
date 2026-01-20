import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const links: Array<{ label: string; route: keyof RootStackParamList; description: string }> = [
  { label: 'Siparislerim', route: 'Orders', description: 'Siparis durumlarim ve detaylar.' },
  { label: 'Talepler', route: 'Requests', description: 'Alt kullanici taleplerini onayla.' },
  { label: 'Taleplerim', route: 'Tasks', description: 'Talep listesi ve yorumlar.' },
  { label: 'Anlasmali Fiyatlar', route: 'Agreements', description: 'Sabit fiyat listelerini gor.' },
  { label: 'Bekleyen Siparisler', route: 'PendingOrders', description: 'Acik teslimatlar ve bakiye.' },
  { label: 'Teklifler', route: 'Quotes', description: 'Teklifleri incele ve yanitla.' },
  { label: 'Bildirimler', route: 'Notifications', description: 'Son bildirimleri gor.' },
  { label: 'Tercihler', route: 'Preferences', description: 'KDV gorunumu ayarlari.' },
  { label: 'Profil', route: 'Profile', description: 'Hesap ayarlari ve tercihler.' },
];

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Daha Fazla</Text>
        <Text style={styles.subtitle}>Hizli menuler ve ayarlar.</Text>

        <View style={styles.list}>
          {links.map((link) => (
            <TouchableOpacity
              key={link.label}
              style={styles.card}
              onPress={() => navigation.navigate(link.route)}
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
