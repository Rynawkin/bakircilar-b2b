import { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function ProfileScreen() {
  const { user, signOut, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const [vatPref, setVatPref] = useState(user?.vatDisplayPreference || 'WITH_VAT');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const isTablet = width >= 820;

  useEffect(() => {
    if (user?.vatDisplayPreference) {
      setVatPref(user.vatDisplayPreference);
    }
  }, [user?.vatDisplayPreference]);

  const updateVatPreference = async (value: 'WITH_VAT' | 'WITHOUT_VAT') => {
    if (savingRef.current) return;
    savingRef.current = true;
    setVatPref(value);
    setSaving(true);
    try {
      await customerApi.updateSettings({ vatDisplayPreference: value });
      await refresh();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Hesap</Text>
          <Text style={styles.heroTitle}>Profil</Text>
          <Text style={styles.heroSubtitle} numberOfLines={2}>{user?.name || 'B2B musteri hesabi'}</Text>
        </View>
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
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  containerTablet: {
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  heroKicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DBEAFE',
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
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
    marginBottom: spacing.sm,
  },
  segmentButton: {
    flex: 1,
    minWidth: 96,
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
