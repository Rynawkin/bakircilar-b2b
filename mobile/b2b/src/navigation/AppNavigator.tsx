import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
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
