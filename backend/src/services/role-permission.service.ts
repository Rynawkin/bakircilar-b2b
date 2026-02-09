import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Tanımlı izinler - dashboard widget'ları ve rapor sayfaları
export const AVAILABLE_PERMISSIONS = {
  // Dashboard Widgets
  'dashboard:orders': 'Siparis Widget',
  'dashboard:customers': 'Musteri Widget',
  'dashboard:excess-stock': 'Fazla Stok Widget',
  'dashboard:sync': 'Senkronizasyon Widget',
  'dashboard:stok-ara': 'Stok Ara Widget',
  'dashboard:cari-ara': 'Cari Ara Widget',
  'dashboard:ekstre': 'Cari Ekstre Widget',
  'dashboard:diversey-stok': 'Diversey Stok Widget',

  // Report Pages
  'reports:margin-compliance': 'Marj Uyumsuzluk Raporu',
  'reports:price-history': 'Fiyat Degisim Raporu',
  'reports:pending-orders': 'Bekleyen Siparisler',
  'reports:cost-update-alerts': 'Maliyet Guncelleme Uyarilari',
  'reports:profit-analysis': 'Kar Marji Analizi',
  'reports:top-products': 'En Cok Satan Urunler',
  'reports:top-customers': 'En Cok Satan Musteriler',
  'reports:supplier-price-lists': 'Tedarikci Fiyat Karsilastirma',
  'reports:complement-missing': 'Tamamlayici Urun Eksikleri',

  // Admin Pages
  'admin:customers': 'Musteri Yonetimi',
  'admin:price-rules': 'Fiyat Kurallari',
  'admin:settings': 'Sistem Ayarlari',
  'admin:products': 'Urun Yonetimi',
  'admin:sync': 'Senkronizasyon',
  'admin:orders': 'Siparis Yonetimi',
  'admin:quotes': 'Teklif Yonetimi',
  'admin:agreements': 'Anlasmali Fiyatlar',
  'admin:order-tracking': 'Siparis Takip',
  'admin:einvoices': 'E-Faturalar',
  'admin:requests': 'Talepler',
  'admin:campaigns': 'Kampanyalar',
  'admin:vade': 'Vade Takip',
  'admin:staff': 'Personel Yonetimi',
  'admin:supplier-price-lists': 'Tedarikci Fiyat Listeleri',
  'admin:exclusions': 'Rapor Haric Tutma',
  'admin:notifications': 'Bildirimler',
  'admin:price-sync': 'Fiyat Senkronizasyonu',
} as const;

// İzin açıklamaları
export const PERMISSION_DESCRIPTIONS = {
  // Dashboard Widgets
  'dashboard:orders': "Dashboard'da bekleyen ve onaylanan siparis istatistiklerini gosterir",
  'dashboard:customers': "Dashboard'da aktif musteri sayisini ve musteri ekleme butonunu gosterir",
  'dashboard:excess-stock': "Dashboard'da fazla stoklu urun sayisini gosterir",
  'dashboard:sync': "Dashboard'da senkronizasyon butonlarini gosterir",
  'dashboard:stok-ara': "Dashboard'da Mikro F10 stok arama widget'ini gosterir",
  'dashboard:cari-ara': "Dashboard'da Mikro F10 cari arama widget'ini gosterir",
  'dashboard:ekstre': "Dashboard'da cari ekstre alma (Excel/PDF export) widget'ini gosterir",
  'dashboard:diversey-stok': "Dashboard'da Diversey markasi urun stoklari widget'ini gosterir",

  // Report Pages
  'reports:margin-compliance': 'Marj uyumsuzluk raporuna erisim izni verir',
  'reports:price-history': 'Fiyat degisim gecmisi raporuna erisim izni verir',
  'reports:pending-orders': 'Bekleyen siparisler raporuna erisim izni verir',
  'reports:cost-update-alerts': 'Maliyet guncelleme uyarilari raporuna erisim izni verir',
  'reports:profit-analysis': 'Kar marji analiz raporuna erisim izni verir',
  'reports:top-products': 'En cok satan urunler raporuna erisim izni verir',
  'reports:top-customers': 'En cok satan musteriler raporuna erisim izni verir',
  'reports:supplier-price-lists': 'Tedarikci fiyat karsilastirma raporuna erisim izni verir',
  'reports:complement-missing': 'Tamamlayici urun eksikleri raporuna erisim izni verir',

  // Admin Pages
  'admin:customers': 'Musteri listesi ve musteri yonetim sayfalarina erisim izni verir',
  'admin:price-rules': 'Kategori ve urun fiyat kurallari sayfasina erisim izni verir',
  'admin:settings': 'Sistem ayarlari sayfasina erisim izni verir',
  'admin:products': 'Urun listesi ve urun yonetim sayfalarina erisim izni verir',
  'admin:sync': 'Manuel senkronizasyon baslatma izni verir',
  'admin:orders': 'Siparis listesi ve siparis islemlerine erisim izni verir',
  'admin:quotes': 'Teklif listesi ve teklif islemlerine erisim izni verir',
  'admin:agreements': 'Anlasmali fiyat yonetimine erisim izni verir',
  'admin:order-tracking': 'Siparis takip sayfalarina erisim izni verir',
  'admin:einvoices': 'E-fatura arsivine erisim izni verir',
  'admin:requests': 'Talepler ve gorevler ekranina erisim izni verir',
  'admin:campaigns': 'Kampanya yonetimine erisim izni verir',
  'admin:vade': 'Vade ve alacak takip ekranina erisim izni verir',
  'admin:staff': 'Personel yonetimine erisim izni verir',
  'admin:supplier-price-lists': 'Tedarikci fiyat listeleri ekranina erisim izni verir',
  'admin:exclusions': 'Rapor haric tutma kurallarina erisim izni verir',
  'admin:notifications': 'Bildirimleri gorme ve okuma izni verir',
  'admin:price-sync': 'Fiyat senkronizasyon islemlerine erisim izni verir',
} as const;

export type PermissionKey = keyof typeof AVAILABLE_PERMISSIONS;

interface GetRolePermissionsParams {
  role: UserRole;
}

interface SetRolePermissionParams {
  role: UserRole;
  permission: string;
  enabled: boolean;
}

interface InitializeDefaultPermissionsParams {
  role: UserRole;
}

class RolePermissionService {
  /**
   * Belirli bir rol için tüm izinleri getir
   */
  async getRolePermissions(params: GetRolePermissionsParams) {
    const { role } = params;

    const permissions = await prisma.rolePermission.findMany({
      where: { role },
      orderBy: { permission: 'asc' }
    });

    // Tüm mevcut izinleri dön, yoksa default değerlerle
    const allPermissions: Record<string, boolean> = {};

    Object.keys(AVAILABLE_PERMISSIONS).forEach(key => {
      const existing = permissions.find(p => p.permission === key);
      allPermissions[key] = existing ? existing.enabled : this.getDefaultPermission(role, key);
    });

    return allPermissions;
  }

  /**
   * Bir izni açma/kapatma
   */
  async setRolePermission(params: SetRolePermissionParams) {
    const { role, permission, enabled } = params;

    // İzin mevcut izinler arasında mı kontrol et
    if (!Object.keys(AVAILABLE_PERMISSIONS).includes(permission)) {
      throw new Error(`Invalid permission: ${permission}`);
    }

    // Upsert - varsa güncelle, yoksa oluştur
    const result = await prisma.rolePermission.upsert({
      where: {
        role_permission: { role, permission }
      },
      update: {
        enabled
      },
      create: {
        role,
        permission,
        enabled
      }
    });

    return result;
  }

  /**
   * Bir rol için tüm izinleri varsayılan değerlere sıfırla
   */
  async initializeDefaultPermissions(params: InitializeDefaultPermissionsParams) {
    const { role } = params;

    // Mevcut izinleri sil
    await prisma.rolePermission.deleteMany({
      where: { role }
    });

    // Varsayılan izinleri oluştur
    const defaultPermissions = Object.keys(AVAILABLE_PERMISSIONS).map(permission => ({
      role,
      permission,
      enabled: this.getDefaultPermission(role, permission)
    }));

    await prisma.rolePermission.createMany({
      data: defaultPermissions
    });

    return { message: 'Default permissions initialized', count: defaultPermissions.length };
  }

  /**
   * Tüm roller için izinleri getir (HEAD_ADMIN için)
   */
  async getAllRolePermissions() {
    const roles: UserRole[] = ['ADMIN', 'MANAGER', 'SALES_REP', 'CUSTOMER', 'DIVERSEY'];

    const result: Record<string, Record<string, boolean>> = {};

    for (const role of roles) {
      result[role] = await this.getRolePermissions({ role });
    }

    return result;
  }

  /**
   * Varsayılan izin değerlerini belirle
   */
  private getDefaultPermission(role: UserRole, permission: string): boolean {
    const isDashboard = permission.startsWith('dashboard:');
    const isReport = permission.startsWith('reports:');

    // HEAD_ADMIN her seyi gorebilir
    if (role === 'HEAD_ADMIN') return true;

    // ADMIN - tum dashboard, rapor ve admin sayfalari
    if (role === 'ADMIN') {
      if (isDashboard || isReport) return true;
      if (permission.startsWith('admin:')) return true;
      return false;
    }

    // MANAGER - dashboard, raporlar ve belirli admin sayfalari
    if (role === 'MANAGER') {
      if (isDashboard || isReport) return true;
      const allowed = new Set([
        'admin:customers',
        'admin:price-rules',
        'admin:products',
        'admin:orders',
        'admin:quotes',
        'admin:agreements',
        'admin:order-tracking',
        'admin:einvoices',
        'admin:requests',
        'admin:vade',
        'admin:staff',
        'admin:supplier-price-lists',
        'admin:notifications',
      ]);
      return allowed.has(permission);
    }

    // SALES_REP - sinirli dashboard + belirli admin sayfalari
    if (role === 'SALES_REP') {
      const allowed = new Set([
        'dashboard:orders',
        'dashboard:stok-ara',
        'dashboard:cari-ara',
        'reports:pending-orders',
        'admin:orders',
        'admin:quotes',
        'admin:customers',
        'admin:order-tracking',
        'admin:requests',
        'admin:vade',
        'admin:einvoices',
        'admin:notifications',
      ]);
      return allowed.has(permission);
    }

    // DIVERSEY - sadece Diversey stok
    if (role === 'DIVERSEY') {
      return permission === 'dashboard:diversey-stok';
    }

    // CUSTOMER - admin panel izinleri yok
    return false;
  }

  /**
   * Kullanıcının bir izni var mı kontrol et
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user) return false;

    // HEAD_ADMIN her şeyi görebilir
    if (user.role === 'HEAD_ADMIN') return true;

    // İzin kaydını getir
    const rolePermission = await prisma.rolePermission.findUnique({
      where: {
        role_permission: {
          role: user.role,
          permission
        }
      }
    });

    // Kayıt varsa ona göre, yoksa varsayılan değere göre
    if (rolePermission) {
      return rolePermission.enabled;
    } else {
      return this.getDefaultPermission(user.role, permission);
    }
  }
}

export const rolePermissionService = new RolePermissionService();
