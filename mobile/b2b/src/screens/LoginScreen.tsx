import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function LoginScreen() {
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
      setError(err?.response?.data?.error || 'Giris yapilamadi. Bilgileri kontrol edin.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>B2B Giris</Text>
        <Text style={styles.subtitle}>Anlasmali fiyatlar ve siparisler tek yerde.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Kullanici Adi</Text>
          <TextInput
            style={styles.input}
            placeholder="ornek@bakircilar.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Sifre</Text>
          <TextInput
            style={styles.input}
            placeholder="********"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Giris Yap</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.help}>
          Sorun mu var? Yardim icin musteri temsilcisine ulasin.
        </Text>
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
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  logo: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
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
    marginBottom: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  help: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
