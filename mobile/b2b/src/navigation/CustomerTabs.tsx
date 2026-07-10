import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartScreen } from '../screens/CartScreen';
import { DiscountedProductsScreen } from '../screens/DiscountedProductsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { PurchasedProductsScreen } from '../screens/PurchasedProductsScreen';
import { colors, fonts } from '../theme';
import { useNotifications } from '../context/NotificationContext';

export type CustomerTabParamList = {
  Home: undefined;
  Products: { categoryId?: string; categoryName?: string; search?: string } | undefined;
  DiscountedProducts: undefined;
  PurchasedProducts: undefined;
  Cart: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<CustomerTabParamList>();

export function CustomerTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const { unreadCount } = useNotifications();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64 + bottomInset,
          paddingTop: 5,
          paddingBottom: bottomInset,
          paddingHorizontal: 2,
          shadowColor: colors.primaryDark,
          shadowOpacity: 0.07,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        },
        tabBarItemStyle: {
          minWidth: 0,
          paddingHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.semibold,
          fontSize: 9,
          lineHeight: 11,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, { active: keyof typeof Ionicons.glyphMap; idle: keyof typeof Ionicons.glyphMap }> = {
            Home: { active: 'home', idle: 'home-outline' },
            Products: { active: 'grid', idle: 'grid-outline' },
            DiscountedProducts: { active: 'pricetag', idle: 'pricetag-outline' },
            PurchasedProducts: { active: 'bag-check', idle: 'bag-check-outline' },
            Cart: { active: 'cart', idle: 'cart-outline' },
            More: { active: 'ellipsis-horizontal-circle', idle: 'ellipsis-horizontal-circle-outline' },
          };
          const iconName = iconMap[route.name] || { active: 'ellipse', idle: 'ellipse-outline' };
          return (
            <View style={styles.iconShell}>
              <View style={[styles.activeLine, !focused && styles.activeLineHidden]} />
              <Ionicons name={focused ? iconName.active : iconName.idle} size={Math.max(19, size - 2)} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Ana Sayfa' }} />
      <Tab.Screen name="Products" component={ProductsScreen} options={{ title: 'Urunler' }} />
      <Tab.Screen
        name="DiscountedProducts"
        component={DiscountedProductsScreen}
        options={{ title: 'Indirimli' }}
      />
      <Tab.Screen
        name="PurchasedProducts"
        component={PurchasedProductsScreen}
        options={{ title: 'Daha Once' }}
      />
      <Tab.Screen name="Cart" component={CartScreen} options={{ title: 'Sepet' }} />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          title: 'Daha Fazla',
          tabBarBadge: unreadCount > 0 ? Math.min(unreadCount, 99) : undefined,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    width: 38,
    height: 30,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  activeLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  activeLineHidden: {
    opacity: 0,
  },
});
