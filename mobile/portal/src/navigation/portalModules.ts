import type { PortalStackParamList } from './AppNavigator';
import type { UserRole } from '../types';

export type PortalModuleSection =
  | 'Satis ve Cari'
  | 'Operasyon'
  | 'Katalog'
  | 'Tedarik'
  | 'Vitrin'
  | 'Rapor'
  | 'Vade'
  | 'Sistem';

export type PortalModuleLink = {
  label: string;
  route: keyof PortalStackParamList;
  params?: PortalStackParamList[keyof PortalStackParamList];
  description: string;
  section: PortalModuleSection;
  permission?: string | string[];
  roles?: UserRole[];
};

export const portalModuleSections: PortalModuleSection[] = [
  'Satis ve Cari',
  'Operasyon',
  'Katalog',
  'Tedarik',
  'Vitrin',
  'Rapor',
  'Vade',
  'Sistem',
];

export const portalModuleLinks: PortalModuleLink[] = [
  { label: 'Portfoy', route: 'Portfolio', description: 'Atanan cari portfoyu ve aktiflik.', section: 'Satis ve Cari', permission: 'admin:customers' },
  { label: 'Musteriler', route: 'Customers', description: 'Cari listesi ve fiyat ayarlari.', section: 'Satis ve Cari', permission: 'admin:customers' },
  { label: 'Cari 360', route: 'Customer360', description: 'Cari ozet, sepet, vade, temas ve fiyat guveni.', section: 'Satis ve Cari', permission: 'admin:customers' },
  { label: 'Cari Aktivite', route: 'CustomerEngagement', description: 'Giris, siparis ve temas aksiyonlari.', section: 'Satis ve Cari', permission: 'reports:customer-engagement' },
  { label: 'Saha Satis', route: 'FieldSales', description: 'Mobil urun arama, fiyat/stok ve ziyaret notu.', section: 'Satis ve Cari', permission: 'admin:field-sales' },
  { label: 'Saha Ziyaretleri', route: 'FieldSalesVisits', description: 'Ziyaret notlari, talepler ve konum/fotograf takibi.', section: 'Satis ve Cari', permission: 'admin:field-sales' },
  { label: 'Anlasmalar', route: 'CustomerAgreements', description: 'Anlasmali fiyat listesi.', section: 'Satis ve Cari', permission: 'admin:agreements' },
  { label: 'Teklif Kalemleri', route: 'QuoteLines', description: 'Teklif satirlarini kapat/ac yonetimi.', section: 'Satis ve Cari', permission: 'admin:quotes' },
  { label: 'Arama', route: 'Search', description: 'Stok ve cari arama.', section: 'Satis ve Cari', permission: ['dashboard:stok-ara', 'dashboard:cari-ara'] },
  { label: 'Sicak Satis', route: 'HotSales', description: 'Arac stogu, sicak satis, teslimat ve gun sonu.', section: 'Operasyon', permission: 'admin:hot-sales' },
  { label: 'Depo Kiosk', route: 'Warehouse', description: 'Toplama, yukleme, irsaliye ve perakende satis.', section: 'Operasyon', permission: 'admin:warehouse-kiosk' },
  { label: 'Ucarer Depo', route: 'UcarerDepot', description: 'Depo karar raporu, MinMax ve islem gecmisi.', section: 'Operasyon', permission: 'reports:ucarer-depo' },
  { label: 'Operasyon', route: 'Operations', description: 'ATP, depo, risk ve veri kalite komuta merkezi.', section: 'Operasyon', permission: ['admin:order-tracking', 'admin:orders', 'reports:customer-activity', 'admin:vade'] },
  { label: 'Siparis Takip', route: 'OrderTracking', description: 'Gecikme ve mail akisi.', section: 'Operasyon', permission: 'admin:order-tracking' },
  { label: 'E-Fatura', route: 'EInvoices', description: 'Gonderilen fatura listesi.', section: 'Operasyon', permission: 'admin:einvoices' },
  { label: 'Urunler', route: 'Products', description: 'Stok ve fiyat incelemesi.', section: 'Katalog', permission: 'admin:products' },
  { label: 'Diversey Stok', route: 'Products', params: { scope: 'DIVERSEY' }, description: 'Diversey urunleri, stok ve katalog kalitesi.', section: 'Katalog', permission: 'dashboard:diversey-stok' },
  { label: 'Urun Olcu ve Raf', route: 'ProductDimensions', description: 'Mikro birim, kg, desi ve raf bilgileri.', section: 'Katalog', permission: 'admin:product-dimensions' },
  { label: 'Stok Acma / Pasif Stok', route: 'PassiveStocks', description: 'Yeni stok acma, pasif stok aktiflestirme ve on kontrol.', section: 'Katalog', permission: 'admin:stock-create' },
  { label: 'Tamamlayici Yonetimi', route: 'ComplementManagement', description: 'Oto/manuel tamamlayici urun ayarlari.', section: 'Katalog', permission: ['reports:complement-missing', 'admin:products'] },
  { label: 'Aile Raporlari', route: 'FamilyReports', description: 'Aile onerisi, kume, aykiri urun ve birim uyumu.', section: 'Katalog', permission: ['reports:ucarer-depo', 'reports:price-family-costs'] },
  { label: 'Paketler', route: 'Bundles', description: 'Paket urun olusturma ve bilesen yonetimi.', section: 'Katalog', permission: 'admin:products' },
  { label: 'Urun Override', route: 'ProductOverrides', description: 'Urun bazli fiyat marji.', section: 'Katalog', permission: 'admin:price-rules' },
  { label: 'Tedarik Maliyetleri', route: 'SupplierCosts', description: 'Tedarikci maliyet, fiyat teyit ve ihale akislari.', section: 'Tedarik', permission: ['admin:supplier-costs', 'admin:quotes', 'admin:orders', 'admin:field-sales'] },
  { label: 'Tedarikci Ayarlari', route: 'SupplierPriceListSettings', description: 'Tedarikci iskonto ve eslestirme ayarlari.', section: 'Tedarik', permission: 'admin:supplier-price-lists' },
  { label: 'Tedarikci Yuklemeleri', route: 'SupplierPriceLists', description: 'Excel/PDF fiyat listesi yukleme ve rapor.', section: 'Tedarik', permission: ['admin:supplier-price-lists', 'reports:supplier-price-lists'] },
  { label: 'Banner Yonetimi', route: 'Banners', description: 'Musteri ana sayfa vitrin gorselleri.', section: 'Vitrin', permission: 'admin:campaigns' },
  { label: 'Hediyeli Kampanyalar', route: 'GiftCampaigns', description: 'Sepet baraji ve hediye urun secimi.', section: 'Vitrin', permission: 'admin:campaigns' },
  { label: 'Koleksiyonlar', route: 'Collections', description: 'Ana sayfa koleksiyon kartlari ve urun secimleri.', section: 'Vitrin', permission: 'admin:campaigns' },
  { label: 'Kategori Gorselleri', route: 'CategoryImages', description: 'Kategori kesfi icin kare gorsel yonetimi.', section: 'Vitrin', permission: 'admin:campaigns' },
  { label: 'Kategoriler', route: 'Categories', description: 'Kategori fiyat kurallari.', section: 'Vitrin', permission: 'admin:price-rules' },
  { label: 'Kampanyalar', route: 'Campaigns', description: 'Kampanya ve indirim akisi.', section: 'Vitrin', permission: 'admin:campaigns' },
  { label: 'Fiyat Haric Tut', route: 'Exclusions', description: 'Dislama listeleri.', section: 'Vitrin', permission: 'admin:exclusions' },
  { label: 'Raporlar', route: 'Reports', description: 'Karlilik ve performans raporlari.', section: 'Rapor', permission: ['reports:margin-compliance', 'reports:price-history', 'reports:pending-orders', 'reports:cost-update-alerts', 'reports:profit-analysis', 'reports:top-products', 'reports:top-customers', 'reports:supplier-price-lists', 'reports:complement-missing', 'reports:customer-recovery', 'reports:customer-carts', 'reports:ucarer-depo', 'reports:ucarer-minmax', 'reports:price-family-costs', 'admin:supplier-costs'] },
  { label: 'Aksiyon Radari', route: 'Reports', params: { initialReport: 'actionRadar' }, description: 'Teklif, sepet, katalog ve saha aksiyon sinyalleri.', section: 'Rapor', permission: ['admin:quotes', 'reports:customer-carts', 'reports:complement-missing', 'admin:products', 'admin:field-sales', 'reports:ucarer-depo'] },
  { label: 'Musteri Sepetleri', route: 'Reports', params: { initialReport: 'customerCarts' }, description: 'Terk sepetler ve sepet temizleme aksiyonu.', section: 'Rapor', permission: 'reports:customer-carts' },
  { label: 'Tamamlayici Eksikler', route: 'Reports', params: { initialReport: 'complementMissing' }, description: 'Eksik tamamlayici satis firsatlari.', section: 'Rapor', permission: 'reports:complement-missing' },
  { label: 'Musteri Aktivitesi', route: 'Reports', params: { initialReport: 'customerActivity' }, description: 'Sayfa, urun, arama ve tiklama davranislari.', section: 'Rapor', permission: 'reports:customer-activity' },
  { label: 'Top Urunler', route: 'Reports', params: { initialReport: 'topProducts' }, description: 'Ciro, miktar ve kar bazli urun performansi.', section: 'Rapor', permission: 'reports:top-products' },
  { label: 'Top Cariler', route: 'Reports', params: { initialReport: 'topCustomers' }, description: 'Cari bazli ciro, kar ve sektor performansi.', section: 'Rapor', permission: 'reports:top-customers' },
  { label: 'Karar Destek', route: 'DecisionSupport', description: 'Takas, talep deseni, iskonto ve kategori firsatlari.', section: 'Rapor', permission: ['reports:ucarer-depo', 'reports:margin-compliance', 'reports:customer-activity'] },
  { label: 'Geri Kazanim Raporu', route: 'CustomerRecoveryReport', description: 'Kaybedilen cari, risk ve toplu aksiyon atama.', section: 'Rapor', permission: 'reports:customer-recovery' },
  { label: 'Geri Kazanim Aksiyonlari', route: 'RecoveryActions', description: 'Size atanan cari takiplerini kapatma.', section: 'Rapor', permission: 'reports:customer-recovery' },
  { label: 'Denetim Raporlari', route: 'AuditReports', description: 'Personel aktivite ve TOPLU denetimi.', section: 'Rapor', permission: ['reports:staff-activity', 'reports:ucarer-depo'] },
  { label: 'Vade Takip', route: 'Vade', description: 'Geciken bakiyeler ve notlar.', section: 'Vade', permission: 'admin:vade' },
  { label: 'Vade Paneli', route: 'VadeDashboard', description: 'Yaslandirma, yogunlasma ve once aranacak cariler.', section: 'Vade', permission: 'admin:vade' },
  { label: 'Vade Analiz', route: 'VadeAnalytics', description: 'Musteri davranisi ve personel not performansi.', section: 'Vade', permission: 'admin:vade' },
  { label: 'Vade Yonetim', route: 'VadeManagement', description: 'Takip disiplini ve sorun tespiti.', section: 'Vade', permission: 'admin:vade' },
  { label: 'Ekstre', route: 'Ekstre', description: 'Cari hareket foye goruntuleme.', section: 'Vade', permission: 'dashboard:ekstre' },
  { label: 'Resim Hata Talepleri', route: 'ImageIssues', description: 'Depo/musteri gorsel sorunlarini kapatma.', section: 'Sistem', permission: 'admin:order-tracking' },
  { label: 'Bildirim Merkezi', route: 'Notifications', description: 'Bildirimler, kategori tercihleri ve push testleri.', section: 'Sistem', permission: 'admin:notifications' },
  { label: 'Personel', route: 'Staff', description: 'Satis temsilcisi ayarlari.', section: 'Sistem', permission: 'admin:staff' },
  { label: 'Rol Yetkileri', route: 'RolePermissions', description: 'Rol izinleri ve erisimler.', section: 'Sistem', permission: 'admin:settings', roles: ['HEAD_ADMIN'] },
  { label: 'Arama Yonetimi', route: 'SearchManagement', description: 'Sonucsuz aramalar ve urun es-anlamlari.', section: 'Sistem', permission: 'admin:search-management' },
  { label: 'Ayarlar', route: 'Settings', description: 'Genel sistem ayarlari.', section: 'Sistem', permission: 'admin:settings' },
  { label: 'Senkronizasyon', route: 'Sync', description: 'Mikro senkron takibi.', section: 'Sistem', permission: 'admin:sync' },
];

const portalRouteAccessOverrides: Partial<Record<keyof PortalStackParamList, Pick<PortalModuleLink, 'permission' | 'roles'>>> = {
  Reports: {
    permission: [
      'reports:margin-compliance',
      'reports:price-history',
      'reports:pending-orders',
      'reports:cost-update-alerts',
      'reports:profit-analysis',
      'reports:top-products',
      'reports:top-customers',
      'reports:supplier-price-lists',
      'reports:complement-missing',
      'reports:customer-recovery',
      'reports:customer-carts',
      'reports:customer-activity',
      'reports:ucarer-depo',
      'reports:ucarer-minmax',
      'reports:price-family-costs',
      'admin:supplier-costs',
      'admin:quotes',
      'admin:products',
      'admin:field-sales',
    ],
  },
  Products: { permission: ['admin:products', 'dashboard:diversey-stok'] },
  CustomerDetail: { permission: 'admin:customers' },
  VadeCustomer: { permission: 'admin:vade' },
  OrderDetail: { permission: 'admin:orders' },
  OrderCreate: { permission: 'admin:orders' },
  QuoteDetail: { permission: 'admin:quotes' },
  QuoteConvert: { permission: 'admin:quotes' },
  QuoteCreate: { permission: 'admin:quotes' },
  TaskDetail: { permission: 'admin:requests' },
  TaskCreate: { permission: 'admin:requests' },
  Notifications: { permission: 'admin:notifications' },
};

export function getPortalRouteAccess(route: keyof PortalStackParamList) {
  return portalRouteAccessOverrides[route] ?? portalModuleLinks.find((link) => link.route === route);
}

export function hasPortalModuleAccess(
  link: Pick<PortalModuleLink, 'permission' | 'roles'>,
  permissions: Record<string, boolean> | null,
  role?: UserRole | null
) {
  if (link.roles && (!role || !link.roles.includes(role))) return false;
  if (!link.permission || !permissions) return true;
  if (Array.isArray(link.permission)) {
    return link.permission.some((key) => permissions[key] !== false);
  }
  return permissions[link.permission] !== false;
}
