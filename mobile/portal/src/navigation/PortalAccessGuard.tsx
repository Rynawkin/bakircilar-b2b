import React from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import type { PortalStackParamList } from './AppNavigator';
import { getPortalRouteAccess, hasPortalModuleAccess, PortalModuleLink } from './portalModules';
import { usePortalAccess } from '../context/PortalAccessContext';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type Props = {
  routeName: keyof PortalStackParamList;
  children: React.ReactNode;
};

type FeatureProps = {
  access?: Pick<PortalModuleLink, 'permission' | 'roles'>;
  children: React.ReactNode;
};

export function PortalAccessGuard({ routeName, children }: Props) {
  return (
    <PortalFeatureAccessGuard access={getPortalRouteAccess(routeName)}>
      {children}
    </PortalFeatureAccessGuard>
  );
}

export function PortalFeatureAccessGuard({ access, children }: FeatureProps) {
  const { permissions, role, loading } = usePortalAccess();

  if (!access) return <>{children}</>;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.card}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.subtitle}>Yetki kontrol ediliyor</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasPortalModuleAccess(access, permissions, role)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.card}>
          <Text style={styles.title}>Erisim Engellendi</Text>
          <Text style={styles.subtitle}>Bu mobil modul icin gerekli rol veya izin tanimli degil.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    margin: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
