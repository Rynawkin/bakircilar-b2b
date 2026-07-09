import { getStoredValue, setStoredValue } from './kv';

export type DashboardWidgetKey =
  | 'stats'
  | 'quickActions'
  | 'notifications'
  | 'stockSearch'
  | 'customerSearch';

export type DashboardQuickActionKey =
  | 'quoteCreate'
  | 'orderCreate'
  | 'search'
  | 'customers'
  | 'reports'
  | 'sync'
  | 'orderTracking'
  | 'eInvoices';

export type DashboardReportCardKey = 'sales' | 'quotes' | 'orders';

export type DashboardPrefs = {
  visibleWidgets: DashboardWidgetKey[];
  quickActions: DashboardQuickActionKey[];
  reportCards?: DashboardReportCardKey[];
  period?: 'daily' | 'weekly' | 'monthly';
};

const keyForUser = (userId: string) => `portal-dashboard-prefs-${userId}`;

export async function getDashboardPrefs(userId: string): Promise<DashboardPrefs | null> {
  const raw = await getStoredValue(keyForUser(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DashboardPrefs;
  } catch {
    return null;
  }
}

export async function saveDashboardPrefs(userId: string, prefs: DashboardPrefs) {
  await setStoredValue(keyForUser(userId), JSON.stringify(prefs));
}
