import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useNotifications } from '../context/NotificationContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, fonts, radius, spacing } from '../theme';

type Props = {
  cartCount?: number;
};

export function CustomerAppHeader({ cartCount = 0 }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { unreadCount } = useNotifications();

  return (
    <View style={styles.header}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.brand}
        onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
      >
        <View style={styles.logoShell}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>Bakırcılar</Text>
          <Text style={styles.brandMeta}>MÜŞTERİYE ÖZEL KATALOG</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Bildirimler"
          style={styles.iconButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{Math.min(unreadCount, 99)}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sepet"
          style={styles.iconButton}
          onPress={() => navigation.navigate('Tabs', { screen: 'Cart' })}
        >
          <Ionicons name="bag-handle-outline" size={20} color="#FFFFFF" />
          {cartCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{Math.min(cartCount, 99)}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryDark,
  },
  brand: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoShell: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 29,
    height: 22,
  },
  brandCopy: {
    minWidth: 0,
    flex: 1,
  },
  brandName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  brandMeta: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 8,
    color: 'rgba(255,255,255,0.62)',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    position: 'relative',
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 8,
    color: '#FFFFFF',
  },
});
