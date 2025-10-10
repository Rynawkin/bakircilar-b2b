/**
 * Mock Mikro ERP Service
 *
 * Gerçek Mikro ERP bağlantısı olmadan geliştirme yapmak için
 * mock data sağlar. Production'da USE_MOCK_MIKRO=false olacak.
 */

import {
  MikroCategory,
  MikroProduct,
  MikroWarehouseStock,
  MikroSalesMovement,
  MikroPendingOrder,
} from '../types';

export class MikroMockService {
  /**
   * Mikro KDV kod → yüzde dönüşümü
   * Real service ile aynı
   */
  public convertVatCodeToRate(vatCode: number): number {
    const vatMap: { [key: number]: number } = {
      0: 0.00,  // İstisna
      1: 0.00,  // İstisna
      2: 0.01,  // %1
      3: 0.00,  // Kullanılmıyor
      4: 0.18,  // %18
      5: 0.20,  // %20
      6: 0.00,  // Kullanılmıyor
      7: 0.10,  // %10
    };
    return vatMap[vatCode] ?? 0.20; // Default %20
  }

  /**
   * Mock kategoriler
   */
  async getCategories(): Promise<MikroCategory[]> {
    return [
      { id: '1', code: '1', name: 'Bilgisayar' },
      { id: '2', code: '2', name: 'Bilgisayar Aksesuarları' },
      { id: '3', code: '3', name: 'Yazıcılar' },
      { id: '4', code: '4', name: 'Network Ekipmanları' },
      { id: '5', code: '5', name: 'Mobil Cihazlar' },
    ];
  }

  /**
   * Mock ürünler
   */
  async getProducts(): Promise<MikroProduct[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    return [
      // Bilgisayar kategorisi
      {
        id: '1',
        code: 'URN-001',
        name: 'Laptop HP 15',
        categoryId: '1',
        unit: 'ADET',
        vatRate: 0.2,
        lastEntryPrice: 8500,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 9000,
        currentCostDate: now,
      },
      {
        id: '2',
        code: 'URN-002',
        name: 'Desktop Dell Optiplex',
        categoryId: '1',
        unit: 'ADET',
        vatRate: 0.2,
        lastEntryPrice: 12000,
        lastEntryDate: sixtyDaysAgo,
        currentCost: 13000,
        currentCostDate: now,
      },
      {
        id: '3',
        code: 'URN-003',
        name: 'Laptop Lenovo ThinkPad',
        categoryId: '1',
        unit: 'ADET',
        vatRate: 0.2,
        lastEntryPrice: 15000,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 15500,
        currentCostDate: now,
      },

      // Bilgisayar Aksesuarları
      {
        id: '4',
        code: 'URN-004',
        name: 'Mouse Logitech MX Master',
        categoryId: '2',
        unit: 'ADET',
        vatRate: 0.18,
        lastEntryPrice: 850,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 900,
        currentCostDate: now,
      },
      {
        id: '5',
        code: 'URN-005',
        name: 'Klavye Logitech K120',
        categoryId: '2',
        unit: 'ADET',
        vatRate: 0.18,
        lastEntryPrice: 250,
        lastEntryDate: sixtyDaysAgo,
        currentCost: 280,
        currentCostDate: now,
      },
      {
        id: '6',
        code: 'URN-006',
        name: 'Webcam Logitech C920',
        categoryId: '2',
        unit: 'ADET',
        vatRate: 0.18,
        lastEntryPrice: 1200,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 1300,
        currentCostDate: now,
      },
      {
        id: '7',
        code: 'URN-007',
        name: 'USB Hub 7 Port',
        categoryId: '2',
        unit: 'ADET',
        vatRate: 0.18,
        lastEntryPrice: 180,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 200,
        currentCostDate: now,
      },

      // Yazıcılar
      {
        id: '8',
        code: 'URN-008',
        name: 'Yazıcı HP LaserJet Pro',
        categoryId: '3',
        unit: 'ADET',
        vatRate: 0.2,
        lastEntryPrice: 3500,
        lastEntryDate: sixtyDaysAgo,
        currentCost: 3800,
        currentCostDate: now,
      },
      {
        id: '9',
        code: 'URN-009',
        name: 'Yazıcı Canon Pixma',
        categoryId: '3',
        unit: 'ADET',
        vatRate: 0.2,
        lastEntryPrice: 2200,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 2400,
        currentCostDate: now,
      },

      // Network Ekipmanları
      {
        id: '10',
        code: 'URN-010',
        name: 'Switch TP-Link 24 Port',
        categoryId: '4',
        unit: 'ADET',
        vatRate: 0.18,
        lastEntryPrice: 2800,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 3000,
        currentCostDate: now,
      },
      {
        id: '11',
        code: 'URN-011',
        name: 'Router Cisco RV340',
        categoryId: '4',
        unit: 'ADET',
        vatRate: 0.18,
        lastEntryPrice: 4500,
        lastEntryDate: sixtyDaysAgo,
        currentCost: 4800,
        currentCostDate: now,
      },
      {
        id: '12',
        code: 'URN-012',
        name: 'Access Point Ubiquiti',
        categoryId: '4',
        unit: 'ADET',
        vatRate: 0.18,
        lastEntryPrice: 1800,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 1900,
        currentCostDate: now,
      },

      // Mobil Cihazlar
      {
        id: '13',
        code: 'URN-013',
        name: 'Tablet Samsung Galaxy Tab',
        categoryId: '5',
        unit: 'ADET',
        vatRate: 0.2,
        lastEntryPrice: 5500,
        lastEntryDate: thirtyDaysAgo,
        currentCost: 5800,
        currentCostDate: now,
      },
      {
        id: '14',
        code: 'URN-014',
        name: 'Tablet iPad 10.2',
        categoryId: '5',
        unit: 'ADET',
        vatRate: 0.2,
        lastEntryPrice: 8000,
        lastEntryDate: sixtyDaysAgo,
        currentCost: 8500,
        currentCostDate: now,
      },
    ];
  }

  /**
   * Mock depo stokları
   */
  async getWarehouseStocks(): Promise<MikroWarehouseStock[]> {
    return [
      // URN-001 (Laptop HP) - Fazla stoklu
      { productCode: 'URN-001', warehouseCode: 'DEPO1', quantity: 45 },
      { productCode: 'URN-001', warehouseCode: 'MERKEZ', quantity: 35 },

      // URN-002 (Desktop Dell) - Orta stok
      { productCode: 'URN-002', warehouseCode: 'DEPO1', quantity: 20 },
      { productCode: 'URN-002', warehouseCode: 'MERKEZ', quantity: 15 },

      // URN-003 (Lenovo) - Az stok
      { productCode: 'URN-003', warehouseCode: 'DEPO1', quantity: 8 },
      { productCode: 'URN-003', warehouseCode: 'MERKEZ', quantity: 5 },

      // URN-004 (Mouse) - Çok fazla stok
      { productCode: 'URN-004', warehouseCode: 'DEPO1', quantity: 150 },
      { productCode: 'URN-004', warehouseCode: 'MERKEZ', quantity: 100 },

      // URN-005 (Klavye) - Fazla stok
      { productCode: 'URN-005', warehouseCode: 'DEPO1', quantity: 80 },
      { productCode: 'URN-005', warehouseCode: 'MERKEZ', quantity: 60 },

      // URN-006 (Webcam) - Orta stok
      { productCode: 'URN-006', warehouseCode: 'DEPO1', quantity: 25 },
      { productCode: 'URN-006', warehouseCode: 'MERKEZ', quantity: 20 },

      // URN-007 (USB Hub) - Fazla stok
      { productCode: 'URN-007', warehouseCode: 'DEPO1', quantity: 200 },
      { productCode: 'URN-007', warehouseCode: 'MERKEZ', quantity: 150 },

      // URN-008 (HP Yazıcı) - Orta stok
      { productCode: 'URN-008', warehouseCode: 'DEPO1', quantity: 18 },
      { productCode: 'URN-008', warehouseCode: 'MERKEZ', quantity: 12 },

      // URN-009 (Canon Yazıcı) - Fazla stok
      { productCode: 'URN-009', warehouseCode: 'DEPO1', quantity: 30 },
      { productCode: 'URN-009', warehouseCode: 'MERKEZ', quantity: 25 },

      // URN-010 (Switch) - Orta stok
      { productCode: 'URN-010', warehouseCode: 'DEPO1', quantity: 15 },
      { productCode: 'URN-010', warehouseCode: 'MERKEZ', quantity: 10 },

      // URN-011 (Router) - Az stok
      { productCode: 'URN-011', warehouseCode: 'DEPO1', quantity: 6 },
      { productCode: 'URN-011', warehouseCode: 'MERKEZ', quantity: 4 },

      // URN-012 (Access Point) - Fazla stok
      { productCode: 'URN-012', warehouseCode: 'DEPO1', quantity: 40 },
      { productCode: 'URN-012', warehouseCode: 'MERKEZ', quantity: 35 },

      // URN-013 (Samsung Tablet) - Orta stok
      { productCode: 'URN-013', warehouseCode: 'DEPO1', quantity: 12 },
      { productCode: 'URN-013', warehouseCode: 'MERKEZ', quantity: 10 },

      // URN-014 (iPad) - Az stok
      { productCode: 'URN-014', warehouseCode: 'DEPO1', quantity: 5 },
      { productCode: 'URN-014', warehouseCode: 'MERKEZ', quantity: 3 },
    ];
  }

  /**
   * Mock satış hareketleri (son 6 ay)
   */
  async getSalesHistory(): Promise<MikroSalesMovement[]> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const movements: MikroSalesMovement[] = [];

    // Son 6 ay için her ürün için satış verileri
    const products = ['URN-001', 'URN-002', 'URN-003', 'URN-004', 'URN-005',
                     'URN-006', 'URN-007', 'URN-008', 'URN-009', 'URN-010',
                     'URN-011', 'URN-012', 'URN-013', 'URN-014'];

    const salesPatterns: Record<string, number[]> = {
      'URN-001': [10, 12, 8, 15, 11, 9],    // Laptop HP - orta satış
      'URN-002': [5, 6, 4, 7, 5, 6],        // Desktop Dell - düşük satış
      'URN-003': [3, 4, 2, 3, 4, 3],        // Lenovo - düşük satış
      'URN-004': [40, 45, 38, 50, 42, 44],  // Mouse - yüksek satış
      'URN-005': [25, 28, 22, 30, 26, 24],  // Klavye - orta-yüksek satış
      'URN-006': [8, 10, 7, 9, 8, 9],       // Webcam - orta satış
      'URN-007': [60, 65, 55, 70, 62, 58],  // USB Hub - yüksek satış
      'URN-008': [6, 7, 5, 6, 7, 6],        // HP Yazıcı - orta satış
      'URN-009': [8, 9, 7, 10, 8, 9],       // Canon Yazıcı - orta satış
      'URN-010': [4, 5, 3, 4, 5, 4],        // Switch - düşük satış
      'URN-011': [2, 3, 2, 2, 3, 2],        // Router - düşük satış
      'URN-012': [10, 12, 9, 11, 10, 11],   // Access Point - orta satış
      'URN-013': [3, 4, 3, 4, 3, 4],        // Samsung Tablet - düşük satış
      'URN-014': [2, 2, 1, 2, 2, 2],        // iPad - düşük satış
    };

    for (const productCode of products) {
      const pattern = salesPatterns[productCode] || [5, 5, 5, 5, 5, 5];

      for (let i = 0; i < 6; i++) {
        const monthDiff = 5 - i;
        let year = currentYear;
        let month = currentMonth - monthDiff;

        if (month <= 0) {
          month += 12;
          year -= 1;
        }

        movements.push({
          productCode,
          year,
          month,
          totalQuantity: pattern[i],
        });
      }
    }

    return movements;
  }

  /**
   * Mock bekleyen siparişler
   */
  async getPendingOrders(): Promise<MikroPendingOrder[]> {
    return [
      // Bekleyen müşteri siparişleri
      { productCode: 'URN-001', quantity: 5, type: 'SALES' },
      { productCode: 'URN-004', quantity: 20, type: 'SALES' },
      { productCode: 'URN-005', quantity: 10, type: 'SALES' },

      // Bekleyen satınalma siparişleri (gelecek stoklar)
      { productCode: 'URN-003', quantity: 15, type: 'PURCHASE' },
      { productCode: 'URN-011', quantity: 10, type: 'PURCHASE' },
      { productCode: 'URN-014', quantity: 8, type: 'PURCHASE' },
    ];
  }

  /**
   * Mock cari listesi
   */
  async getCariList(): Promise<import('../types').MikroCari[]> {
    return [
      { code: 'CARI001', name: 'ABC Bilgisayar Ltd.' },
      { code: 'CARI002', name: 'XYZ Teknoloji A.Ş.' },
      { code: 'CARI003', name: 'Deneme Ticaret' },
      { code: 'CARI004', name: 'Premium Müşteri A.Ş.' },
      { code: 'CARI005', name: 'Özel Anlaşmalı Firma' },
      { code: 'CARI006', name: 'Test Şirketi Ltd.' },
      { code: 'CARI007', name: 'Standart Satış Ltd.' },
      { code: 'CARI008', name: 'Elite Teknoloji' },
    ];
  }

  /**
   * Anlık stok kontrolü (tek ürün için)
   */
  async getRealtimeStock(
    productCode: string,
    includedWarehouses: string[]
  ): Promise<number> {
    const allStocks = await this.getWarehouseStocks();

    const productStocks = allStocks.filter(
      (s) =>
        s.productCode === productCode &&
        includedWarehouses.includes(s.warehouseCode)
    );

    return productStocks.reduce((sum, s) => sum + s.quantity, 0);
  }

  /**
   * Mock Mikro'ya sipariş yazma
   * Gerçekte Mikro'nun sipariş tablosuna INSERT yapacak
   */
  async writeOrder(orderData: {
    cariCode: string;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
    }>;
    applyVAT: boolean;
    description: string;
  }): Promise<string> {
    // Mock sipariş ID üret
    const mockOrderId = `MKR-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    console.log('📝 [MOCK] Mikro\'ya sipariş yazıldı:', {
      orderId: mockOrderId,
      ...orderData,
    });

    // Gerçek sistemde burada INSERT query'leri çalışacak
    return mockOrderId;
  }

  /**
   * Mock bağlantı testi
   */
  async testConnection(): Promise<boolean> {
    console.log('✅ [MOCK] Mikro bağlantısı simüle edildi');
    return true;
  }
}

export default new MikroMockService();
