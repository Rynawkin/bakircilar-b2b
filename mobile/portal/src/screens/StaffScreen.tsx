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
import { StaffMember } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const ROLES: Array<'SALES_REP' | 'MANAGER'> = ['SALES_REP', 'MANAGER'];

export function StaffScreen() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'SALES_REP' | 'MANAGER'>('SALES_REP');
  const [sectorCodes, setSectorCodes] = useState('');

  const fetchStaff = async () => {
    try {
      const response = await adminApi.getStaffMembers();
      setStaff(response.staff || []);
    } catch (err) {
      Alert.alert('Hata', 'Personel listesi yuklenemedi.');
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const createStaff = async () => {
    if (!email.trim() || !name.trim() || !password.trim()) {
      Alert.alert('Eksik Bilgi', 'Email, ad ve sifre gerekli.');
      return;
    }
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
      Alert.alert('Hata', err?.response?.data?.error || 'Personel eklenemedi.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Personel</Text>
        <Text style={styles.subtitle}>Satis temsilcileri ve yoneticiler.</Text>

        {staff.map((member) => (
          <View key={member.id} style={styles.card}>
            <Text style={styles.cardTitle}>{member.name}</Text>
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
          <TouchableOpacity style={styles.primaryButton} onPress={createStaff}>
            <Text style={styles.primaryButtonText}>Personel Ekle</Text>
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
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
