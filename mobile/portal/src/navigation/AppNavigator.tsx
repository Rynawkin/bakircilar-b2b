import { createNavigationContainerRef, DarkTheme, NavigationContainer, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { colors, fonts } from '../theme';

import { PortalAccessProvider } from '../context/PortalAccessContext';
import { PortalAccessGuard } from './PortalAccessGuard';
import { PortalTabs, PortalTabParamList } from './PortalTabs';
import { AuditReportsScreen } from '../screens/AuditReportsScreen';
import { BannersScreen } from '../screens/BannersScreen';
import { BundlesScreen } from '../screens/BundlesScreen';
import { CampaignsScreen } from '../screens/CampaignsScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { CategoryImagesScreen } from '../screens/CategoryImagesScreen';
import { CollectionsScreen } from '../screens/CollectionsScreen';
import { CustomerAgreementsScreen } from '../screens/CustomerAgreementsScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { CustomerEngagementScreen } from '../screens/CustomerEngagementScreen';
import { CustomerRecoveryReportScreen } from '../screens/CustomerRecoveryReportScreen';
import { Customer360Screen } from '../screens/Customer360Screen';
import { CustomersScreen } from '../screens/CustomersScreen';
import { DecisionSupportScreen } from '../screens/DecisionSupportScreen';
import { EkstreScreen } from '../screens/EkstreScreen';
import { EInvoicesScreen } from '../screens/EInvoicesScreen';
import { ExclusionsScreen } from '../screens/ExclusionsScreen';
import { FamilyReportsScreen } from '../screens/FamilyReportsScreen';
import { FieldSalesScreen } from '../screens/FieldSalesScreen';
import { FieldSalesVisitsScreen } from '../screens/FieldSalesVisitsScreen';
import { GiftCampaignsScreen } from '../screens/GiftCampaignsScreen';
import { HotSalesScreen } from '../screens/HotSalesScreen';
import { ImageIssuesScreen } from '../screens/ImageIssuesScreen';
import { OrderTrackingScreen } from '../screens/OrderTrackingScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderCreateScreen } from '../screens/OrderCreateScreen';
import { OperationsScreen } from '../screens/OperationsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PassiveStocksScreen } from '../screens/PassiveStocksScreen';
import { ProductOverridesScreen } from '../screens/ProductOverridesScreen';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { RolePermissionsScreen } from '../screens/RolePermissionsScreen';
import { SearchManagementScreen } from '../screens/SearchManagementScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StaffScreen } from '../screens/StaffScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { SupplierPriceListSettingsScreen } from '../screens/SupplierPriceListSettingsScreen';
import { SupplierPriceListsScreen } from '../screens/SupplierPriceListsScreen';
import { SupplierCostsScreen } from '../screens/SupplierCostsScreen';
import { TaskCreateScreen } from '../screens/TaskCreateScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { UcarerDepotScreen } from '../screens/UcarerDepotScreen';
import { QuoteCreateScreen } from '../screens/QuoteCreateScreen';
import { QuoteDetailScreen } from '../screens/QuoteDetailScreen';
import { QuoteConvertScreen } from '../screens/QuoteConvertScreen';
import { QuoteLinesScreen } from '../screens/QuoteLinesScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { ComplementManagementScreen } from '../screens/ComplementManagementScreen';
import { ProductDimensionsScreen } from '../screens/ProductDimensionsScreen';
import { RecoveryActionsScreen } from '../screens/RecoveryActionsScreen';
import { VadeAnalyticsScreen } from '../screens/VadeAnalyticsScreen';
import { VadeCustomerScreen } from '../screens/VadeCustomerScreen';
import { VadeDashboardScreen } from '../screens/VadeDashboardScreen';
import { VadeManagementScreen } from '../screens/VadeManagementScreen';
import { VadeScreen } from '../screens/VadeScreen';
import { WarehouseScreen } from '../screens/WarehouseScreen';

export type PortalStackParamList = {
  Tabs: NavigatorScreenParams<PortalTabParamList> | undefined;
  Customers: undefined;
  CustomerAgreements: undefined;
  CustomerEngagement: undefined;
  Customer360: { customerIdOrCode?: string } | undefined;
  CustomerDetail: { customerId: string };
  FieldSales: { customerIdOrCode?: string } | undefined;
  FieldSalesVisits: undefined;
  HotSales: undefined;
  Warehouse: undefined;
  AuditReports: undefined;
  DecisionSupport:
    | {
        initialView?: 'barter' | 'sticky' | 'belowCost' | 'demand' | 'churn' | 'opportunity';
      }
    | undefined;
  FamilyReports:
    | {
        initialView?: 'suggestions' | 'clusters' | 'outliers' | 'unitMismatch' | 'stockFamilies' | 'priceFamilies' | 'priceCosts';
      }
    | undefined;
  Vade: undefined;
  VadeDashboard: undefined;
  VadeAnalytics: undefined;
  VadeManagement: undefined;
  VadeCustomer: { customerId: string };
  Ekstre: undefined;
  Reports:
    | {
        initialReport?:
          | 'cost'
          | 'margin'
          | 'profit'
          | 'price'
          | 'priceNew'
          | 'topProducts'
          | 'topCustomers'
          | 'productCustomers'
          | 'complementMissing'
          | 'customerActivity'
          | 'customerCarts'
          | 'actionRadar';
      }
    | undefined;
  CustomerRecoveryReport: undefined;
  RecoveryActions: undefined;
  Sync: undefined;
  Products:
    | {
        search?: string;
        qualityFilter?: 'ALL' | 'BAD' | 'WARN' | 'NO_IMAGE' | 'GALLERY_MISSING';
        detailTab?: 'SUMMARY' | 'PRICES' | 'STOCK' | 'IMAGE';
        autoOpenFirst?: boolean;
        scope?: 'DIVERSEY';
      }
    | undefined;
  ProductDimensions: undefined;
  PassiveStocks: undefined;
  OrderDetail: { orderId: string };
  OrderCreate: undefined;
  Operations: undefined;
  Notifications: undefined;
  ImageIssues: undefined;
  QuoteDetail: { quoteId: string };
  QuoteConvert: { quoteId: string };
  QuoteCreate:
    | {
        quoteId?: string;
        customerIdOrCode?: string;
        productCode?: string;
        productName?: string;
        productPrefills?: Array<{
          productCode: string;
          productName?: string;
          quantity?: number;
          unitPrice?: number;
          priceType?: 'INVOICED' | 'WHITE';
        }>;
        autoAddProduct?: boolean;
      }
    | undefined;
  OrderTracking: undefined;
  TaskDetail: { taskId: string };
  TaskCreate: undefined;
  ProductOverrides: undefined;
  Portfolio: undefined;
  SupplierPriceListSettings: undefined;
  SupplierPriceLists: undefined;
  SupplierCosts: undefined;
  UcarerDepot: undefined;
  QuoteLines: undefined;
  ComplementManagement:
    | {
        initialSearch?: string;
        autoSelect?: boolean;
      }
    | undefined;
  Bundles: undefined;
  Banners: undefined;
  GiftCampaigns: undefined;
  Collections: undefined;
  CategoryImages: undefined;
  Categories: undefined;
  Campaigns: undefined;
  Exclusions: undefined;
  Staff: undefined;
  RolePermissions: undefined;
  SearchManagement: undefined;
  Settings: undefined;
  Search:
    | {
        mode?: 'stocks' | 'customers';
        term?: string;
        autoRun?: boolean;
        openColumns?: boolean;
      }
    | undefined;
  EInvoices: undefined;
};

const Stack = createNativeStackNavigator<PortalStackParamList>();
export const navigationRef = createNavigationContainerRef<PortalStackParamList>();

const portalNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primarySoft,
    background: colors.background,
    card: colors.backgroundRaised,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
  fonts: {
    regular: { fontFamily: fonts.regular, fontWeight: '400' as const },
    medium: { fontFamily: fonts.medium, fontWeight: '500' as const },
    bold: { fontFamily: fonts.bold, fontWeight: '700' as const },
    heavy: { fontFamily: fonts.extrabold, fontWeight: '800' as const },
  },
};

export function AppNavigator() {
  return (
    <PortalAccessProvider>
      <PortalStackNavigator />
    </PortalAccessProvider>
  );
}

function PortalStackNavigator() {
  const guarded = (routeName: keyof PortalStackParamList, Component: ComponentType<any>) => (props: any) => (
    <PortalAccessGuard routeName={routeName}>
      <Component {...props} />
    </PortalAccessGuard>
  );

  return (
    <NavigationContainer ref={navigationRef} theme={portalNavigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Tabs" component={PortalTabs} />
        <Stack.Screen name="Customers" children={guarded('Customers', CustomersScreen)} />
        <Stack.Screen name="CustomerAgreements" children={guarded('CustomerAgreements', CustomerAgreementsScreen)} />
        <Stack.Screen name="CustomerEngagement" children={guarded('CustomerEngagement', CustomerEngagementScreen)} />
        <Stack.Screen name="Customer360" children={guarded('Customer360', Customer360Screen)} />
        <Stack.Screen name="CustomerDetail" children={guarded('CustomerDetail', CustomerDetailScreen)} />
        <Stack.Screen name="FieldSales" children={guarded('FieldSales', FieldSalesScreen)} />
        <Stack.Screen name="FieldSalesVisits" children={guarded('FieldSalesVisits', FieldSalesVisitsScreen)} />
        <Stack.Screen name="HotSales" children={guarded('HotSales', HotSalesScreen)} />
        <Stack.Screen name="Warehouse" children={guarded('Warehouse', WarehouseScreen)} />
        <Stack.Screen name="AuditReports" children={guarded('AuditReports', AuditReportsScreen)} />
        <Stack.Screen name="DecisionSupport" children={guarded('DecisionSupport', DecisionSupportScreen)} />
        <Stack.Screen name="FamilyReports" children={guarded('FamilyReports', FamilyReportsScreen)} />
        <Stack.Screen name="Vade" children={guarded('Vade', VadeScreen)} />
        <Stack.Screen name="VadeDashboard" children={guarded('VadeDashboard', VadeDashboardScreen)} />
        <Stack.Screen name="VadeAnalytics" children={guarded('VadeAnalytics', VadeAnalyticsScreen)} />
        <Stack.Screen name="VadeManagement" children={guarded('VadeManagement', VadeManagementScreen)} />
        <Stack.Screen name="VadeCustomer" children={guarded('VadeCustomer', VadeCustomerScreen)} />
        <Stack.Screen name="Ekstre" children={guarded('Ekstre', EkstreScreen)} />
        <Stack.Screen name="Reports" children={guarded('Reports', ReportsScreen)} />
        <Stack.Screen name="CustomerRecoveryReport" children={guarded('CustomerRecoveryReport', CustomerRecoveryReportScreen)} />
        <Stack.Screen name="RecoveryActions" children={guarded('RecoveryActions', RecoveryActionsScreen)} />
        <Stack.Screen name="Sync" children={guarded('Sync', SyncScreen)} />
        <Stack.Screen name="Products" children={guarded('Products', ProductsScreen)} />
        <Stack.Screen name="ProductDimensions" children={guarded('ProductDimensions', ProductDimensionsScreen)} />
        <Stack.Screen name="PassiveStocks" children={guarded('PassiveStocks', PassiveStocksScreen)} />
        <Stack.Screen name="Operations" children={guarded('Operations', OperationsScreen)} />
        <Stack.Screen name="Notifications" children={guarded('Notifications', NotificationsScreen)} />
        <Stack.Screen name="ImageIssues" children={guarded('ImageIssues', ImageIssuesScreen)} />
        <Stack.Screen name="OrderDetail" children={guarded('OrderDetail', OrderDetailScreen)} />
        <Stack.Screen name="OrderCreate" children={guarded('OrderCreate', OrderCreateScreen)} />
        <Stack.Screen name="QuoteDetail" children={guarded('QuoteDetail', QuoteDetailScreen)} />
        <Stack.Screen name="QuoteConvert" children={guarded('QuoteConvert', QuoteConvertScreen)} />
        <Stack.Screen name="QuoteCreate" children={guarded('QuoteCreate', QuoteCreateScreen)} />
        <Stack.Screen name="OrderTracking" children={guarded('OrderTracking', OrderTrackingScreen)} />
        <Stack.Screen name="TaskDetail" children={guarded('TaskDetail', TaskDetailScreen)} />
        <Stack.Screen name="TaskCreate" children={guarded('TaskCreate', TaskCreateScreen)} />
        <Stack.Screen name="ProductOverrides" children={guarded('ProductOverrides', ProductOverridesScreen)} />
        <Stack.Screen name="Portfolio" children={guarded('Portfolio', PortfolioScreen)} />
        <Stack.Screen name="SupplierPriceListSettings" children={guarded('SupplierPriceListSettings', SupplierPriceListSettingsScreen)} />
        <Stack.Screen name="SupplierPriceLists" children={guarded('SupplierPriceLists', SupplierPriceListsScreen)} />
        <Stack.Screen name="SupplierCosts" children={guarded('SupplierCosts', SupplierCostsScreen)} />
        <Stack.Screen name="UcarerDepot" children={guarded('UcarerDepot', UcarerDepotScreen)} />
        <Stack.Screen name="QuoteLines" children={guarded('QuoteLines', QuoteLinesScreen)} />
        <Stack.Screen name="ComplementManagement" children={guarded('ComplementManagement', ComplementManagementScreen)} />
        <Stack.Screen name="Bundles" children={guarded('Bundles', BundlesScreen)} />
        <Stack.Screen name="Banners" children={guarded('Banners', BannersScreen)} />
        <Stack.Screen name="GiftCampaigns" children={guarded('GiftCampaigns', GiftCampaignsScreen)} />
        <Stack.Screen name="Collections" children={guarded('Collections', CollectionsScreen)} />
        <Stack.Screen name="CategoryImages" children={guarded('CategoryImages', CategoryImagesScreen)} />
        <Stack.Screen name="Categories" children={guarded('Categories', CategoriesScreen)} />
        <Stack.Screen name="Campaigns" children={guarded('Campaigns', CampaignsScreen)} />
        <Stack.Screen name="Exclusions" children={guarded('Exclusions', ExclusionsScreen)} />
        <Stack.Screen name="Staff" children={guarded('Staff', StaffScreen)} />
        <Stack.Screen name="RolePermissions" children={guarded('RolePermissions', RolePermissionsScreen)} />
        <Stack.Screen name="SearchManagement" children={guarded('SearchManagement', SearchManagementScreen)} />
        <Stack.Screen name="Settings" children={guarded('Settings', SettingsScreen)} />
        <Stack.Screen name="Search" children={guarded('Search', SearchScreen)} />
        <Stack.Screen name="EInvoices" children={guarded('EInvoices', EInvoicesScreen)} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
