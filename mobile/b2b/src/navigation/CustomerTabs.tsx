import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { CartScreen } from '../screens/CartScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { colors } from '../theme';

export type CustomerTabParamList = {
  Home: undefined;
  Products: undefined;
  Cart: undefined;
  Orders: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<CustomerTabParamList>();

export function CustomerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: colors.border,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home',
            Products: 'grid',
            Cart: 'cart',
            Orders: 'file-tray-full',
            More: 'ellipsis-horizontal-circle',
          };
          const iconName = iconMap[route.name] || 'ellipse';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Ana Sayfa' }} />
      <Tab.Screen name="Products" component={ProductsScreen} options={{ title: 'Urunler' }} />
      <Tab.Screen name="Cart" component={CartScreen} options={{ title: 'Sepet' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Siparisler' }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'Daha Fazla' }} />
    </Tab.Navigator>
  );
}
