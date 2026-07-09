import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

export function LoginScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 820;
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Kullanici adi ve sifre gerekli.');
      return;
    }

    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Giris yapilamadi. Bilgileri kontrol edin.'));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, isTablet && styles.heroTablet]}>
            <View style={styles.brandRow}>
              <View style={styles.logoShell}>
                <Image source={require('../../assets/icon.png')} style={styles.logo} />
              </View>
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandKicker}>Bakircilar</Text>
                <Text style={styles.brandTitle} numberOfLines={1}>B2B Siparis</Text>
              </View>
            </View>

            <Text style={styles.title}>Anlasmali fiyatlar, kampanyalar ve siparisler tek yerde.</Text>
            <Text style={styles.subtitle}>
              Size ozel fiyatlar, onceki alimlar, faturalar ve sepet aksiyonlarina hizli erisin.
            </Text>

            <View style={styles.featureRow}>
              <View style={styles.featurePill}>
                <Ionicons name="pricetag-outline" size={15} color="#DCEBFF" />
                <Text style={styles.featureText}>Ozel Fiyat</Text>
              </View>
              <View style={styles.featurePill}>
                <Ionicons name="bag-check-outline" size={15} color="#DCEBFF" />
                <Text style={styles.featureText}>Onceki Alim</Text>
              </View>
              <View style={styles.featurePill}>
                <Ionicons name="receipt-outline" size={15} color="#DCEBFF" />
                <Text style={styles.featureText}>Fatura</Text>
              </View>
            </View>
          </View>

          <View style={[styles.formCard, isTablet && styles.formCardTablet]}>
            <Text style={styles.formTitle}>Musteri Girisi</Text>
            <Text style={styles.formSubtitle}>Cari kodu veya kullanici adinizla devam edin.</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Kullanici Adi</Text>
              <View style={styles.inputShell}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="120.01.022 veya e-posta"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Sifre</Text>
              <View style={styles.inputShell}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="Sifreni gir"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Giris Yap</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.help}>
              Sorun yasarsaniz musteri temsilcinizden destek alabilirsiniz.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  containerTablet: {
    maxWidth: 1080,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#173D78',
    shadowColor: '#071B3A',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroTablet: {
    flex: 1.15,
    minHeight: 420,
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoShell: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
  },
  brandTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  brandKicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  brandTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: '#FFFFFF',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    lineHeight: fontSizes.xl + 7,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 6,
    color: '#DCEBFF',
  },
  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  featureText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#0A2A57',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  formCardTablet: {
    flex: 0.85,
    maxWidth: 430,
  },
  formTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  formSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: spacing.sm,
  },
  error: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.danger,
  },
  help: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
