import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function PreferencesScreen() {
  const { user, refresh } = useAuth();
  const [vatPref, setVatPref] = useState<'WITH_VAT' | 'WITHOUT_VAT'>(
    user?.vatDisplayPreference || 'WITH_VAT'
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.vatDisplayPreference) {
      setVatPref(user.vatDisplayPreference);
    }
  }, [user?.vatDisplayPreference]);

  const updatePreference = async (value: 'WITH_VAT' | 'WITHOUT_VAT') => {
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
        <Text style={styles.title}>Tercihler</Text>
        <Text style={styles.subtitle}>Faturalý fiyat gorunumu</Text>

        <View style={styles.card}>
          <Text style={styles.label}>KDV Gorunumu</Text>
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentButton, vatPref === 'WITH_VAT' && styles.segmentActive]}
              onPress={() => updatePreference('WITH_VAT')}
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
              onPress={() => updatePreference('WITHOUT_VAT')}
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
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
});
