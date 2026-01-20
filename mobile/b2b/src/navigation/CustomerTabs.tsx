import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartScreen } from '../screens/CartScreen';
import { DiscountedProductsScreen } from '../screens/DiscountedProductsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { PurchasedProductsScreen } from '../screens/PurchasedProductsScreen';
import { colors } from '../theme';

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

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: colors.border,
          height: 62 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: {
          fontSize: 10,
        },
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home',
            Products: 'grid',
            DiscountedProducts: 'pricetag',
            PurchasedProducts: 'bag-check',
            Cart: 'cart',
            More: 'ellipsis-horizontal-circle',
          };
          const iconName = iconMap[route.name] || 'ellipse';
          return <Ionicons name={iconName} size={size} color={color} />;
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
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'Daha Fazla' }} />
    </Tab.Navigator>
  );
}
