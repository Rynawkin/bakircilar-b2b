import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardScreen } from '../screens/DashboardScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { QuotesScreen } from '../screens/QuotesScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { colors } from '../theme';
import { hapticLight } from '../utils/haptics';
import { useNotifications } from '../context/NotificationContext';

export type PortalTabParamList = {
  Dashboard: undefined;
  Quotes: undefined;
  Orders: undefined;
  Tasks: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<PortalTabParamList>();

export function PortalTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const { unreadCount } = useNotifications();

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => {
          hapticLight();
        },
      }}
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
            Dashboard: 'speedometer',
            Quotes: 'document-text',
            Orders: 'cart',
            Tasks: 'checkbox',
            More: 'ellipsis-horizontal-circle',
          };
          const iconName = iconMap[route.name] || 'ellipse';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Panel' }} />
      <Tab.Screen name="Quotes" component={QuotesScreen} options={{ title: 'Teklifler' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Siparisler' }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: 'Talepler' }} />
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
