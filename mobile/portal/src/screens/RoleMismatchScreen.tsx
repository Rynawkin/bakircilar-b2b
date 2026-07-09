import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function RoleMismatchScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Hesap Turu</Text>
          <Text style={styles.title}>Bu uygulama personel hesaplari icindir.</Text>
          <Text style={styles.body}>
            Musteri hesabi ile giris yaptiysaniz siparis ve katalog islemleri icin Bakircilar B2B uygulamasini kullanin.
          </Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Ne yapmaliyim?</Text>
            <Text style={styles.infoText}>Bu oturumu kapatip dogru uygulamadan tekrar giris yapin.</Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={onSignOut}>
            <Text style={styles.buttonText}>Cikis Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: '#071B3A',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
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
    lineHeight: fontSizes.xl + 6,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DDE8FF',
    lineHeight: fontSizes.sm + 6,
  },
  infoBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: spacing.md,
    gap: 3,
  },
  infoLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  infoText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: '#C9D8F2',
    lineHeight: fontSizes.xs + 5,
  },
  button: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.semibold,
    color: colors.primarySoft,
  },
});
