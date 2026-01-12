import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function RoleMismatchScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Bu uygulama sadece personel icindir.</Text>
        <Text style={styles.body}>Musteri islemleri icin Bakircilar B2B uygulamasini kullanin.</Text>
        <TouchableOpacity style={styles.button} onPress={onSignOut}>
          <Text style={styles.buttonText}>Cikis Yap</Text>
        </TouchableOpacity>
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
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  buttonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
