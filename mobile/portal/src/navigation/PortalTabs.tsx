import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentType } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardScreen } from '../screens/DashboardScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { QuotesScreen } from '../screens/QuotesScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { colors, fonts, radius, spacing } from '../theme';
import { hapticLight } from '../utils/haptics';
import { useNotifications } from '../context/NotificationContext';
import { usePortalAccess } from '../context/PortalAccessContext';
import { hasPortalModuleAccess } from './portalModules';
import { PortalFeatureAccessGuard } from './PortalAccessGuard';

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
  const { permissions, role, loading } = usePortalAccess();
  const canShow = (permission?: string | string[]) =>
    !loading && hasPortalModuleAccess({ permission }, permissions, role);
  const guardedTab = (permission: string | string[] | undefined, Component: ComponentType<any>) => (props: any) => (
    <PortalFeatureAccessGuard access={{ permission }}>
      <Component {...props} />
    </PortalFeatureAccessGuard>
  );

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => {
          hapticLight();
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primarySoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: '#060E1C',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64 + bottomInset,
          paddingTop: 5,
          paddingBottom: bottomInset,
          paddingHorizontal: spacing.xs,
          shadowColor: '#020713',
          shadowOpacity: 0.42,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -7 },
          elevation: 16,
        },
        tabBarItemStyle: {
          borderRadius: radius.lg,
          marginHorizontal: 2,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.medium,
          fontSize: 9,
          lineHeight: 12,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: 'speedometer',
            Quotes: 'document-text',
            Orders: 'cart',
            Tasks: 'checkbox',
            More: 'ellipsis-horizontal-circle',
          };
          const iconName = iconMap[route.name] || 'ellipse';
          return (
            <View style={focused ? { backgroundColor: colors.primaryMuted, borderRadius: 9, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 11, paddingVertical: 4 } : null}>
              <Ionicons name={iconName} size={Math.max(19, size - 2)} color={focused ? colors.primarySoft : color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Panel' }} />
      {canShow('admin:quotes') ? (
        <Tab.Screen name="Quotes" children={guardedTab('admin:quotes', QuotesScreen)} options={{ title: 'Teklifler' }} />
      ) : null}
      {canShow('admin:orders') ? (
        <Tab.Screen name="Orders" children={guardedTab('admin:orders', OrdersScreen)} options={{ title: 'Siparisler' }} />
      ) : null}
      {canShow('admin:requests') ? (
        <Tab.Screen name="Tasks" children={guardedTab('admin:requests', TasksScreen)} options={{ title: 'Talepler' }} />
      ) : null}
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
