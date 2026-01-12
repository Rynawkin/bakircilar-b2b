import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function ProfileScreen() {
  const { user, signOut, refresh } = useAuth();
  const [vatPref, setVatPref] = useState(user?.vatDisplayPreference || 'WITH_VAT');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.vatDisplayPreference) {
      setVatPref(user.vatDisplayPreference);
    }
  }, [user?.vatDisplayPreference]);

  const updateVatPreference = async (value: 'WITH_VAT' | 'WITHOUT_VAT') => {
    setVatPref(value);
    setSaving(true);
    try {
      await customerApi.updateSettings({ vatDisplayPreference: value });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Profil</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Unvan</Text>
          <Text style={styles.value}>{user?.name || '-'}</Text>
          <Text style={styles.label}>Kullanici</Text>
          <Text style={styles.value}>{user?.email || '-'}</Text>
          <Text style={styles.label}>Cari Kodu</Text>
          <Text style={styles.value}>{user?.mikroCariCode || '-'}</Text>
          <Text style={styles.label}>Fiyat Gorunurlugu</Text>
          <Text style={styles.value}>{user?.priceVisibility || 'INVOICED_ONLY'}</Text>
          <Text style={styles.label}>KDV Gorunumu</Text>
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentButton, vatPref === 'WITH_VAT' && styles.segmentActive]}
              onPress={() => updateVatPreference('WITH_VAT')}
              disabled={saving}
            >
              <Text
                style={[
                  styles.segmentText,
                  vatPref === 'WITH_VAT' && styles.segmentTextActive,
                ]}
              >
                KDV Dahil
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, vatPref === 'WITHOUT_VAT' && styles.segmentActive]}
              onPress={() => updateVatPreference('WITHOUT_VAT')}
              disabled={saving}
            >
              <Text
                style={[
                  styles.segmentText,
                  vatPref === 'WITHOUT_VAT' && styles.segmentTextActive,
                ]}
              >
                KDV Haric
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={signOut}>
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
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  value: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
    marginBottom: spacing.sm,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
});
