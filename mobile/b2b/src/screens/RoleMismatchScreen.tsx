import { Alert, Linking, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function RoleMismatchScreen({ onSignOut }: { onSignOut: () => void }) {
  const openStaffPortal = async () => {
    try {
      await Linking.openURL('bakircilar-portal://');
    } catch {
      Alert.alert(
        'Bakircilar Portal bulunamadi',
        'Personel uygulamasini yukleyin veya ana ekrandaki Bakircilar Portal uygulamasini acin.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Hesap Turu</Text>
          <Text style={styles.title}>Bu uygulama musteri hesaplari icindir.</Text>
          <Text style={styles.body}>
            Personel hesabiyla giris yaptiysaniz Bakircilar Portal uygulamasini kullanmaniz gerekir.
          </Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Ne yapmaliyim?</Text>
            <Text style={styles.infoText}>Bu oturumu kapatip dogru uygulamadan tekrar giris yapin.</Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={openStaffPortal}>
            <Text style={styles.buttonText}>Bakircilar Portal'i Ac</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onSignOut}>
            <Text style={styles.secondaryButtonText}>Bu Oturumu Kapat</Text>
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
    borderColor: '#173D78',
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
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
