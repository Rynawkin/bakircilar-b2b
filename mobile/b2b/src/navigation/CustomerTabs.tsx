import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartScreen } from '../screens/CartScreen';
import { DiscountedProductsScreen } from '../screens/DiscountedProductsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { PurchasedProductsScreen } from '../screens/PurchasedProductsScreen';
import { colors, fonts, radius, spacing } from '../theme';
import { useNotifications } from '../context/NotificationContext';

export type CustomerTabParamList = {
  Home: undefined;
  Products: undefined;
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
          height: 68 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          paddingHorizontal: spacing.xs,
          shadowColor: '#071B3A',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -2 },
          elevation: 10,
        },
        tabBarItemStyle: {
          borderRadius: radius.lg,
          marginHorizontal: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.medium,
          fontSize: 10,
          lineHeight: 13,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home',
            Products: 'grid',
            DiscountedProducts: 'pricetag',
            PurchasedProducts: 'bag-check',
            Cart: 'cart',
            More: 'ellipsis-horizontal-circle',
          };
          const iconName = iconMap[route.name] || 'ellipse';
          return (
            <View style={focused ? { backgroundColor: colors.primaryMuted, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 } : null}>
              <Ionicons name={iconName} size={Math.max(20, size - 1)} color={color} />
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
