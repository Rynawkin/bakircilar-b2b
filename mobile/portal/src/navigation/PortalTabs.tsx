import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { DashboardScreen } from '../screens/DashboardScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { QuotesScreen } from '../screens/QuotesScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { colors } from '../theme';

export type PortalTabParamList = {
  Dashboard: undefined;
  Quotes: undefined;
  Orders: undefined;
  Tasks: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<PortalTabParamList>();

export function PortalTabs() {
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
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'Daha Fazla' }} />
    </Tab.Navigator>
  );
}
