import { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function RolePermissionsScreen() {
  const [roles, setRoles] = useState<string[]>([]);
  const [activeRole, setActiveRole] = useState<string>('');
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});

  const fetchPermissions = async () => {
    try {
      const response = await adminApi.getAllRolePermissions();
      const roleKeys = Object.keys(response.permissions || {});
      setRoles(roleKeys);
      setActiveRole((prev) => prev || roleKeys[0] || '');
      setPermissions(response.permissions || {});
      setDescriptions(response.permissionDescriptions || {});
    } catch (err) {
      Alert.alert('Hata', 'Yetkiler yuklenemedi.');
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const togglePermission = async (permissionKey: string) => {
    if (!activeRole) return;
    const current = permissions[activeRole]?.[permissionKey] ?? false;
    try {
      await adminApi.setRolePermission(activeRole, permissionKey, !current);
      setPermissions((prev) => ({
        ...prev,
        [activeRole]: { ...prev[activeRole], [permissionKey]: !current },
      }));
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    }
  };

  const resetRole = async () => {
    if (!activeRole) return;
    try {
      await adminApi.resetRolePermissions(activeRole);
      await fetchPermissions();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Sifirlama basarisiz.');
    }
  };

  const rolePermissions = activeRole ? permissions[activeRole] || {} : {};

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Rol Yetkileri</Text>
        <Text style={styles.subtitle}>Rol bazli izinler.</Text>

        <View style={styles.row}>
          {roles.map((role) => (
            <TouchableOpacity
              key={role}
              style={[styles.segmentButton, activeRole === role && styles.segmentButtonActive]}
              onPress={() => setActiveRole(role)}
            >
              <Text style={activeRole === role ? styles.segmentTextActive : styles.segmentText}>{role}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={resetRole}>
          <Text style={styles.secondaryButtonText}>Rol Yetkilerini Sifirla</Text>
        </TouchableOpacity>

        {Object.entries(rolePermissions).map(([key, enabled]) => (
          <TouchableOpacity
            key={key}
            style={styles.card}
            onPress={() => togglePermission(key)}
          >
            <Text style={styles.cardTitle}>{key}</Text>
            {descriptions[key] && <Text style={styles.cardMeta}>{descriptions[key]}</Text>}
            <Text style={styles.cardMeta}>Durum: {enabled ? 'Acik' : 'Kapali'}</Text>
          </TouchableOpacity>
        ))}
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
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
  cardTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
