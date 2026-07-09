import { useEffect, useRef, useState } from 'react';
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
import { StaffMember } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const ROLES: Array<'SALES_REP' | 'MANAGER'> = ['SALES_REP', 'MANAGER'];

export function StaffScreen() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'SALES_REP' | 'MANAGER'>('SALES_REP');
  const [sectorCodes, setSectorCodes] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const fetchSeqRef = useRef(0);

  const beginSaving = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };

  const endSaving = () => {
    savingRef.current = false;
    setSaving(false);
  };

  const fetchStaff = async () => {
    const requestSeq = ++fetchSeqRef.current;
    try {
      const response = await adminApi.getStaffMembers();
      if (requestSeq !== fetchSeqRef.current) return;
      setStaff(response.staff || []);
    } catch (err: any) {
      if (requestSeq !== fetchSeqRef.current) return;
      Alert.alert('Hata', getApiErrorMessage(err, 'Personel listesi yuklenemedi.'));
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const createStaff = async () => {
    if (savingRef.current) return;
    if (!email.trim() || !name.trim() || !password.trim()) {
      Alert.alert('Eksik Bilgi', 'Email, ad ve sifre gerekli.');
      return;
    }
    if (!beginSaving()) return;
    try {
      await adminApi.createStaffMember({
        email: email.trim(),
        name: name.trim(),
        password: password.trim(),
        role,
        assignedSectorCodes: sectorCodes
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean),
      });
      setEmail('');
      setName('');
      setPassword('');
      setSectorCodes('');
      await fetchStaff();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Personel eklenemedi.'));
    } finally {
      endSaving();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Sistem Yetkileri</Text>
          <Text style={styles.title}>Personel</Text>
          <Text style={styles.subtitle}>Satis temsilcileri ve yoneticiler.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{staff.length}</Text>
              <Text style={styles.heroMetricLabel}>Personel</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{staff.filter((item) => item.role === 'SALES_REP').length}</Text>
              <Text style={styles.heroMetricLabel}>Satisci</Text>
            </View>
          </View>
        </View>

        {staff.map((member) => (
          <View key={member.id} style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={1}>{member.name}</Text>
            <Text style={styles.cardMeta}>{member.email}</Text>
            <Text style={styles.cardMeta}>Rol: {member.role}</Text>
            <Text style={styles.cardMeta}>Sektor: {(member.assignedSectorCodes || []).join(', ') || '-'}</Text>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Yeni Personel</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Ad Soyad"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Sifre"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <View style={styles.row}>
            {ROLES.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.segmentButton, role === option && styles.segmentButtonActive]}
                onPress={() => setRole(option)}
              >
                <Text style={role === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Sektor kodlari (virgul)"
            placeholderTextColor={colors.textMuted}
            value={sectorCodes}
            onChangeText={setSectorCodes}
          />
          <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={createStaff} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Ekleniyor...' : 'Personel Ekle'}</Text>
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
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#9EC5FF',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DDE8FF',
    lineHeight: 22,
  },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  heroMetric: {
    flexGrow: 1,
    minWidth: 118,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#DDE8FF' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
