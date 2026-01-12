import { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { Settings } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const COST_METHODS: Settings['costCalculationMethod'][] = ['LAST_ENTRY', 'CURRENT_COST', 'DYNAMIC'];

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const [calculationPeriod, setCalculationPeriod] = useState('');
  const [minimumExcess, setMinimumExcess] = useState('');
  const [warehouses, setWarehouses] = useState('');
  const [costMethod, setCostMethod] = useState<Settings['costCalculationMethod']>('LAST_ENTRY');
  const [whiteVatFormula, setWhiteVatFormula] = useState('');

  const loadSettings = async () => {
    try {
      const data = await adminApi.getSettings();
      setSettings(data);
      setCalculationPeriod(String(data.calculationPeriodMonths || ''));
      setMinimumExcess(String(data.minimumExcessThreshold || ''));
      setWarehouses((data.includedWarehouses || []).join(', '));
      setCostMethod(data.costCalculationMethod || 'LAST_ENTRY');
      setWhiteVatFormula(data.whiteVatFormula || '');
    } catch (err) {
      Alert.alert('Hata', 'Ayarlar yuklenemedi.');
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await adminApi.updateSettings({
        calculationPeriodMonths: calculationPeriod ? Number(calculationPeriod) : settings.calculationPeriodMonths,
        minimumExcessThreshold: minimumExcess ? Number(minimumExcess) : settings.minimumExcessThreshold,
        includedWarehouses: warehouses
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        costCalculationMethod: costMethod,
        whiteVatFormula: whiteVatFormula || settings.whiteVatFormula,
      });
      Alert.alert('Basarili', 'Ayarlar guncellendi.');
      await loadSettings();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kaydetme basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Ayarlar</Text>
        <Text style={styles.subtitle}>Sistem ve hesaplama tercihleri.</Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Hesaplama donemi (ay)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={calculationPeriod}
            onChangeText={setCalculationPeriod}
          />
          <TextInput
            style={styles.input}
            placeholder="Minimum fazla stok"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={minimumExcess}
            onChangeText={setMinimumExcess}
          />
          <TextInput
            style={styles.input}
            placeholder="Depolar (virgul)"
            placeholderTextColor={colors.textMuted}
            value={warehouses}
            onChangeText={setWarehouses}
          />
          <View style={styles.row}>
            {COST_METHODS.map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.segmentButton, costMethod === method && styles.segmentButtonActive]}
                onPress={() => setCostMethod(method)}
              >
                <Text style={costMethod === method ? styles.segmentTextActive : styles.segmentText}>{method}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="White VAT formul"
            placeholderTextColor={colors.textMuted}
            value={whiteVatFormula}
            onChangeText={setWhiteVatFormula}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={saveSettings} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
          </TouchableOpacity>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
