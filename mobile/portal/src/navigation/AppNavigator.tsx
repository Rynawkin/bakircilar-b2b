import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { PortalTabs } from './PortalTabs';
import { CampaignsScreen } from '../screens/CampaignsScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { CustomerAgreementsScreen } from '../screens/CustomerAgreementsScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { CustomersScreen } from '../screens/CustomersScreen';
import { EkstreScreen } from '../screens/EkstreScreen';
import { EInvoicesScreen } from '../screens/EInvoicesScreen';
import { ExclusionsScreen } from '../screens/ExclusionsScreen';
import { OrderTrackingScreen } from '../screens/OrderTrackingScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderCreateScreen } from '../screens/OrderCreateScreen';
import { ProductOverridesScreen } from '../screens/ProductOverridesScreen';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { RolePermissionsScreen } from '../screens/RolePermissionsScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StaffScreen } from '../screens/StaffScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { SupplierPriceListSettingsScreen } from '../screens/SupplierPriceListSettingsScreen';
import { SupplierPriceListsScreen } from '../screens/SupplierPriceListsScreen';
import { TaskCreateScreen } from '../screens/TaskCreateScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { QuoteCreateScreen } from '../screens/QuoteCreateScreen';
import { QuoteDetailScreen } from '../screens/QuoteDetailScreen';
import { QuoteConvertScreen } from '../screens/QuoteConvertScreen';
import { QuoteLinesScreen } from '../screens/QuoteLinesScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { ComplementManagementScreen } from '../screens/ComplementManagementScreen';
import { VadeCustomerScreen } from '../screens/VadeCustomerScreen';
import { VadeScreen } from '../screens/VadeScreen';

export type PortalStackParamList = {
  Tabs: undefined;
  Customers: undefined;
  CustomerAgreements: undefined;
  CustomerDetail: { customerId: string };
  Vade: undefined;
  VadeCustomer: { customerId: string };
  Ekstre: undefined;
  Reports: undefined;
  Sync: undefined;
  Products: undefined;
  OrderDetail: { orderId: string };
  OrderCreate: undefined;
  QuoteDetail: { quoteId: string };
  QuoteConvert: { quoteId: string };
  QuoteCreate: { quoteId?: string } | undefined;
  OrderTracking: undefined;
  TaskDetail: { taskId: string };
  TaskCreate: undefined;
  ProductOverrides: undefined;
  Portfolio: undefined;
  SupplierPriceListSettings: undefined;
  SupplierPriceLists: undefined;
  QuoteLines: undefined;
  ComplementManagement: undefined;
  Categories: undefined;
  Campaigns: undefined;
  Exclusions: undefined;
  Staff: undefined;
  RolePermissions: undefined;
  Settings: undefined;
  Search: undefined;
  EInvoices: undefined;
};

const Stack = createNativeStackNavigator<PortalStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={PortalTabs} />
        <Stack.Screen name="Customers" component={CustomersScreen} />
        <Stack.Screen name="CustomerAgreements" component={CustomerAgreementsScreen} />
        <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
        <Stack.Screen name="Vade" component={VadeScreen} />
        <Stack.Screen name="VadeCustomer" component={VadeCustomerScreen} />
        <Stack.Screen name="Ekstre" component={EkstreScreen} />
        <Stack.Screen name="Reports" component={ReportsScreen} />
        <Stack.Screen name="Sync" component={SyncScreen} />
        <Stack.Screen name="Products" component={ProductsScreen} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Stack.Screen name="OrderCreate" component={OrderCreateScreen} />
        <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} />
        <Stack.Screen name="QuoteConvert" component={QuoteConvertScreen} />
        <Stack.Screen name="QuoteCreate" component={QuoteCreateScreen} />
        <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
        <Stack.Screen name="TaskCreate" component={TaskCreateScreen} />
        <Stack.Screen name="ProductOverrides" component={ProductOverridesScreen} />
        <Stack.Screen name="Portfolio" component={PortfolioScreen} />
        <Stack.Screen name="SupplierPriceListSettings" component={SupplierPriceListSettingsScreen} />
        <Stack.Screen name="SupplierPriceLists" component={SupplierPriceListsScreen} />
        <Stack.Screen name="QuoteLines" component={QuoteLinesScreen} />
        <Stack.Screen name="ComplementManagement" component={ComplementManagementScreen} />
        <Stack.Screen name="Categories" component={CategoriesScreen} />
        <Stack.Screen name="Campaigns" component={CampaignsScreen} />
        <Stack.Screen name="Exclusions" component={ExclusionsScreen} />
        <Stack.Screen name="Staff" component={StaffScreen} />
        <Stack.Screen name="RolePermissions" component={RolePermissionsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="EInvoices" component={EInvoicesScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
