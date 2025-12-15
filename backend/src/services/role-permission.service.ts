import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Tanımlı izinler - dashboard widget'ları ve rapor sayfaları
export const AVAILABLE_PERMISSIONS = {
  // Dashboard Widgets
  'dashboard:orders': 'Sipariş Widget',
  'dashboard:customers': 'Müşteri Widget',
  'dashboard:excess-stock': 'Fazla Stok Widget',
  'dashboard:sync': 'Senkronizasyon Widget',
  'dashboard:stok-ara': 'Stok Ara Widget',
  'dashboard:cari-ara': 'Cari Ara Widget',
  'dashboard:ekstre': 'Cari Ekstre Widget',
  'dashboard:diversey-stok': 'Diversey Stok Widget',

  // Report Pages
  'reports:margin-compliance': 'Marj Uyumsuzluk Raporu',
  'reports:price-history': 'Fiyat Değişim Raporu',
  'reports:pending-orders': 'Bekleyen Siparişler',

  // Admin Pages
  'admin:customers': 'Müşteri Yönetimi',
  'admin:price-rules': 'Fiyat Kuralları',
  'admin:settings': 'Sistem Ayarları',
  'admin:products': 'Ürün Yönetimi',
  'admin:sync': 'Senkronizasyon',
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
    // HEAD_ADMIN her şeyi görebilir
    if (role === 'HEAD_ADMIN') return true;

    // ADMIN - tüm dashboard ve admin sayfaları
    if (role === 'ADMIN') {
      if (permission.startsWith('dashboard:')) return true;
      if (permission.startsWith('reports:')) return true;
      if (permission.startsWith('admin:')) return true;
      return false;
    }

    // MANAGER - dashboard ve raporlar
    if (role === 'MANAGER') {
      if (permission.startsWith('dashboard:')) return true;
      if (permission.startsWith('reports:')) return true;
      if (permission === 'admin:customers') return true; // Müşteri görüntüleme
      return false;
    }

    // SALES_REP - sınırlı dashboard
    if (role === 'SALES_REP') {
      const allowedForSalesRep = [
        'dashboard:orders',
        'dashboard:stok-ara',
        'dashboard:cari-ara',
        'reports:pending-orders'
      ];
      return allowedForSalesRep.includes(permission);
    }

    // DIVERSEY - sadece Diversey stok
    if (role === 'DIVERSEY') {
      return permission === 'dashboard:diversey-stok';
    }

    // CUSTOMER - hiçbir şey (customers panele zaten girmiyor)
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
