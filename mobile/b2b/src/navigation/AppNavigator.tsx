import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';

import { CustomerTabs } from './CustomerTabs';
import { AgreementsScreen } from '../screens/AgreementsScreen';
import { CustomerTaskDetailScreen } from '../screens/CustomerTaskDetailScreen';
import { CustomerTasksScreen } from '../screens/CustomerTasksScreen';
import { DiscountedProductsScreen } from '../screens/DiscountedProductsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { PendingOrdersScreen } from '../screens/PendingOrdersScreen';
import { PreferencesScreen } from '../screens/PreferencesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { PurchasedProductsScreen } from '../screens/PurchasedProductsScreen';
import { QuoteDetailScreen } from '../screens/QuoteDetailScreen';
import { QuotesScreen } from '../screens/QuotesScreen';
import { RequestDetailScreen } from '../screens/RequestDetailScreen';
import { RequestsScreen } from '../screens/RequestsScreen';
import { flushActivePing, setActivityPage, trackCustomerActivity } from '../utils/activity';

export type RootStackParamList = {
  Tabs: undefined;
  Orders: undefined;
  OrderDetail: { orderId: string };
  ProductDetail: { productId: string };
  Requests: undefined;
  RequestDetail: { requestId: string };
  Agreements: undefined;
  DiscountedProducts: undefined;
  PurchasedProducts: undefined;
  PendingOrders: undefined;
  Preferences: undefined;
  Tasks: undefined;
  TaskDetail: { taskId: string };
  Quotes: undefined;
  QuoteDetail: { quoteId: string };
  Profile: undefined;
  Notifications: undefined;
};

const serializeParams = (params?: Record<string, unknown>) => {
  if (!params) return '';
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
};

const formatRoutePath = (route?: { name?: string; params?: Record<string, unknown> }) => {
  if (!route?.name) return '';
  const query = serializeParams(route.params);
  return query ? `${route.name}?${query}` : route.name;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const lastPathRef = useRef<string>('');

  useEffect(() => {
    const intervalId = setInterval(() => flushActivePing(false), 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        flushActivePing(true);
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
      flushActivePing(true);
    };
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        const route = navigationRef.getCurrentRoute();
        const pagePath = formatRoutePath(route as any);
        lastPathRef.current = pagePath;
        setActivityPage(pagePath, route?.name);
        trackCustomerActivity({ type: 'PAGE_VIEW', pagePath, pageTitle: route?.name });
      }}
      onStateChange={() => {
        const route = navigationRef.getCurrentRoute();
        const pagePath = formatRoutePath(route as any);
        if (!pagePath || pagePath === lastPathRef.current) return;
        lastPathRef.current = pagePath;
        setActivityPage(pagePath, route?.name);
        trackCustomerActivity({ type: 'PAGE_VIEW', pagePath, pageTitle: route?.name });
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={CustomerTabs} />
        <Stack.Screen name="Orders" component={OrdersScreen} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen name="Requests" component={RequestsScreen} />
        <Stack.Screen name="RequestDetail" component={RequestDetailScreen} />
        <Stack.Screen name="Agreements" component={AgreementsScreen} />
        <Stack.Screen name="DiscountedProducts" component={DiscountedProductsScreen} />
        <Stack.Screen name="PurchasedProducts" component={PurchasedProductsScreen} />
        <Stack.Screen name="PendingOrders" component={PendingOrdersScreen} />
        <Stack.Screen name="Preferences" component={PreferencesScreen} />
        <Stack.Screen name="Tasks" component={CustomerTasksScreen} />
        <Stack.Screen name="TaskDetail" component={CustomerTaskDetailScreen} />
        <Stack.Screen name="Quotes" component={QuotesScreen} />
        <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
