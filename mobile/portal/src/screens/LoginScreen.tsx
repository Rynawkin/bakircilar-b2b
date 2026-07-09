import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAuth } from '../context/AuthContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

export function LoginScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 820;
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const showAccessHelp = () => {
    Alert.alert(
      'Erisim yardimi',
      'Sifre yenileme veya hesap erisimi icin yoneticiniz ya da sorumlu temsilcinizle iletisime gecin.'
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.container, isTablet && styles.containerTablet]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.content, isTablet && styles.contentTablet]}>
            <View style={styles.brandBlock}>
              <View style={styles.logoShell}>
                <Image source={require('../../assets/icon.png')} style={styles.logo} />
              </View>
              <View style={styles.brandCopy}>
                <Text style={styles.brandTitle}>Bakircilar Portal</Text>
                <Text style={styles.brandSubtitle}>Operasyon & Saha Yonetimi</Text>
              </View>
            </View>

            <View style={styles.formCard}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>E-posta</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="mail-outline" size={18} color={colors.primarySoft} />
                  <TextInput
                    style={styles.input}
                    placeholder="umut@bakircilar.com"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="username"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Sifre</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.primarySoft} />
                  <TextInput
                    style={styles.input}
                    placeholder="Sifreni gir"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={handleSubmit}
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Sifreyi gizle' : 'Sifreyi goster'}
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((current) => !current)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.forgotButton} onPress={showAccessHelp}>
                <Text style={styles.forgotText}>Sifremi unuttum</Text>
              </TouchableOpacity>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Giris Yap</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.helpButton} onPress={showAccessHelp}>
              <Text style={styles.help}>
                Erisim sorununda <Text style={styles.helpLink}>temsilcinizle iletisime</Text> gecin.
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            © {new Date().getFullYear()} Bakircilar Grup · Portal v1.0
          </Text>
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
    minHeight: '100%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    justifyContent: 'space-between',
    backgroundColor: colors.background,
  },
  containerTablet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    paddingHorizontal: spacing.xxl,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  contentTablet: {
    minHeight: 620,
  },
  brandBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
  logoShell: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: colors.backgroundRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  logo: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  brandCopy: {
    alignItems: 'center',
    gap: 3,
  },
  brandTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.textStrong,
  },
  brandSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSoft,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: spacing.md,
  },
  fieldGroup: {
    gap: 7,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textSoft,
  },
  inputShell: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  eyeButton: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primarySoft,
  },
  button: {
    minHeight: 52,
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: 15,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
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
  helpButton: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  help: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  helpLink: {
    fontFamily: fonts.semibold,
    color: colors.primarySoft,
  },
  footer: {
    paddingTop: spacing.md,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: '#5A6F92',
    textAlign: 'center',
  },
});
