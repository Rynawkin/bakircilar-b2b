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
  MikroPendingOrderByWarehouse,
  MikroCariPersonel,
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

  async disconnect(): Promise<void> {
    return;
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
        warehouseStocks: { 'DEPO1': 45, 'MERKEZ': 35 },
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
        warehouseStocks: { 'DEPO1': 20, 'MERKEZ': 15 },
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
        warehouseStocks: { 'DEPO1': 8, 'MERKEZ': 5 },
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
        warehouseStocks: { 'DEPO1': 150, 'MERKEZ': 100 },
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
        warehouseStocks: { 'DEPO1': 80, 'MERKEZ': 60 },
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
        warehouseStocks: { 'DEPO1': 25, 'MERKEZ': 20 },
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
        warehouseStocks: { 'DEPO1': 200, 'MERKEZ': 150 },
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
        warehouseStocks: { 'DEPO1': 18, 'MERKEZ': 12 },
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
        warehouseStocks: { 'DEPO1': 30, 'MERKEZ': 25 },
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
        warehouseStocks: { 'DEPO1': 15, 'MERKEZ': 10 },
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
        warehouseStocks: { 'DEPO1': 6, 'MERKEZ': 4 },
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
        warehouseStocks: { 'DEPO1': 40, 'MERKEZ': 35 },
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
        warehouseStocks: { 'DEPO1': 12, 'MERKEZ': 10 },
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
        warehouseStocks: { 'DEPO1': 5, 'MERKEZ': 3 },
      },
    ];
  }

  async getProductGuidsByCodes(productCodes: string[]): Promise<Array<{ code: string; guid: string | null }>> {
    if (!productCodes || productCodes.length === 0) {
      return [];
    }

    const uniqueCodes = Array.from(
      new Set(productCodes.map((code) => (code || '').trim()).filter((code) => code.length > 0))
    );

    return uniqueCodes.map((code) => ({
      code,
      guid: null,
    }));
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
   * Mock satış hareketleri (günlük - son 90 gün)
   */
  async getSalesHistory(): Promise<MikroSalesMovement[]> {
    const now = new Date();
    const movements: MikroSalesMovement[] = [];

    const products = ['URN-001', 'URN-002', 'URN-003', 'URN-004', 'URN-005',
                     'URN-006', 'URN-007', 'URN-008', 'URN-009', 'URN-010',
                     'URN-011', 'URN-012', 'URN-013', 'URN-014'];

    // Her ürün için günlük satış aralıkları
    const dailyRanges: Record<string, [number, number]> = {
      'URN-001': [0, 1],   // Laptop - günde 0-1
      'URN-002': [0, 1],   // Desktop - günde 0-1
      'URN-003': [0, 1],   // Lenovo - günde 0-1
      'URN-004': [1, 3],   // Mouse - günde 1-3
      'URN-005': [0, 2],   // Klavye - günde 0-2
      'URN-006': [0, 1],   // Webcam - günde 0-1
      'URN-007': [1, 3],   // USB Hub - günde 1-3
      'URN-008': [0, 1],   // HP Yazıcı - günde 0-1
      'URN-009': [0, 1],   // Canon Yazıcı - günde 0-1
      'URN-010': [0, 1],   // Switch - günde 0-1
      'URN-011': [0, 1],   // Router - günde 0-1
      'URN-012': [0, 1],   // Access Point - günde 0-1
      'URN-013': [0, 1],   // Samsung Tablet - günde 0-1
      'URN-014': [0, 1],   // iPad - günde 0-1
    };

    for (const productCode of products) {
      const [min, max] = dailyRanges[productCode] || [0, 1];

      // Son 90 gün (F10 ile aynı)
      for (let i = 0; i < 90; i++) {
        const saleDate = new Date(now);
        saleDate.setDate(saleDate.getDate() - i);

        const quantity = Math.floor(Math.random() * (max - min + 1)) + min;

        if (quantity > 0) {
          movements.push({
            productCode,
            saleDate,
            totalQuantity: quantity,
          });
        }
      }
    }

    return movements;
  }

  /**
   * Mock: daha Çônce satŽñY yapŽñlan Ç¬rÇ¬n kodlarŽñ
   */
  async getPurchasedProductCodes(_cariCode: string): Promise<string[]> {
    return ['URN-001', 'URN-004', 'URN-005', 'URN-008', 'URN-010'];
  }

  /**
   * Mock bekleyen siparişler
   */
  /**
   * Mock: cari bazlÄ± son satÄ±ÅŸ hareketleri
   */
  async getCustomerSalesMovements(
    _cariCode: string,
    productCodes: string[],
    limit = 1
  ): Promise<Array<{
    productCode: string;
    saleDate: Date;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    vatAmount: number;
    vatRate: number;
    vatZeroed: boolean;
  }>> {
    const now = new Date();
    return productCodes.flatMap((code) => {
      return Array.from({ length: limit }).map((_, idx) => {
        const quantity = Math.max(1, idx + 1);
        const unitPrice = 100 + idx * 10;
        const lineTotal = unitPrice * quantity;
        const vatRate = 0.18;
        const vatAmount = lineTotal * vatRate;
        return {
          productCode: code,
          saleDate: new Date(now.getTime() - idx * 86400000),
          quantity,
          unitPrice,
          lineTotal,
          vatAmount,
          vatRate,
          vatZeroed: false,
        };
      });
    });
  }

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

  async getPendingOrdersByWarehouse(): Promise<MikroPendingOrderByWarehouse[]> {
    return [
      { productCode: 'URN-001', warehouseCode: '1', quantity: 3, type: 'SALES' },
      { productCode: 'URN-001', warehouseCode: '6', quantity: 2, type: 'SALES' },
      { productCode: 'URN-004', warehouseCode: '1', quantity: 20, type: 'SALES' },
      { productCode: 'URN-005', warehouseCode: '1', quantity: 10, type: 'SALES' },
      { productCode: 'URN-003', warehouseCode: '1', quantity: 15, type: 'PURCHASE' },
      { productCode: 'URN-011', warehouseCode: '6', quantity: 10, type: 'PURCHASE' },
      { productCode: 'URN-014', warehouseCode: '1', quantity: 8, type: 'PURCHASE' },
    ];
  }

  /**
   * Mock cari listesi
   */
  async getCariList(): Promise<import('../types').MikroCari[]> {
    return [
      { code: 'CARI001', name: 'ABC Bilgisayar Ltd.', isLocked: false, hasEInvoice: false, balance: 0 },
      { code: 'CARI002', name: 'XYZ Teknoloji A.Ş.', isLocked: false, hasEInvoice: false, balance: 0 },
      { code: 'CARI003', name: 'Deneme Ticaret', isLocked: false, hasEInvoice: false, balance: 0 },
      { code: 'CARI004', name: 'Premium Müşteri A.Ş.', isLocked: false, hasEInvoice: false, balance: 0 },
      { code: 'CARI005', name: 'Özel Anlaşmalı Firma', isLocked: false, hasEInvoice: false, balance: 0 },
      { code: 'CARI006', name: 'Test Şirketi Ltd.', isLocked: false, hasEInvoice: false, balance: 0 },
      { code: 'CARI007', name: 'Standart Satış Ltd.', isLocked: false, hasEInvoice: false, balance: 0 },
      { code: 'CARI008', name: 'Elite Teknoloji', isLocked: false, hasEInvoice: false, balance: 0 },
    ];
  }

  /**
   * Mock cari detaylı bilgileri (sync için)
   */
  async getCariDetails(): Promise<Array<{
    code: string;
    name: string;
    city?: string;
    district?: string;
    phone?: string;
    isLocked: boolean;
    groupCode?: string;
    sectorCode?: string;
    paymentTerm?: number | null;
    paymentPlanNo?: number | null;
    paymentPlanCode?: string | null;
    paymentPlanName?: string | null;
    hasEInvoice: boolean;
    balance: number;
  }>> {
    return [
      {
        code: 'CARI001',
        name: 'ABC Bilgisayar Ltd.',
        city: 'İstanbul',
        district: 'Kadıköy',
        phone: '0216 123 45 67',
        isLocked: false,
        groupCode: 'BAYI',
        sectorCode: 'SATIŞ',
        paymentTerm: 30,
        paymentPlanNo: 1,
        paymentPlanCode: '30',
        paymentPlanName: '30 GUN VADE',
        hasEInvoice: true,
        balance: 15000,
      },
      {
        code: 'CARI002',
        name: 'XYZ Teknoloji A.Ş.',
        city: 'Ankara',
        district: 'Çankaya',
        phone: '0312 987 65 43',
        isLocked: false,
        groupCode: 'PERAKENDE',
        sectorCode: 'SATIŞ',
        paymentTerm: 15,
        paymentPlanNo: 15,
        paymentPlanCode: '15',
        paymentPlanName: '15 GUN VADE',
        hasEInvoice: true,
        balance: -5000,
      },
      {
        code: 'CARI003',
        name: 'Deneme Ticaret',
        city: 'İzmir',
        district: 'Konak',
        phone: '0232 555 12 34',
        isLocked: false,
        groupCode: 'VIP',
        sectorCode: 'SATIŞ',
        paymentTerm: 45,
        paymentPlanNo: 8,
        paymentPlanCode: '45',
        paymentPlanName: '45 GUN VADE',
        hasEInvoice: false,
        balance: 0,
      },
    ];
  }

  async getEInvoiceMetadataByGibNo(_gibNo: string): Promise<{
    gibNo: string;
    uuid: string | null;
    evrakSeri: string | null;
    evrakSira: number | null;
    cariCode: string | null;
    cariName: string | null;
    issueDate: Date | null;
    sentAt: Date | null;
    currencyCode: number | null;
  } | null> {
    return null;
  }

  async getInvoiceTotalsByEvrak(_evrakSeri: string, _evrakSira: number): Promise<{
    subtotal?: number | null;
    total?: number | null;
    currency?: string | null;
    issueDate?: Date | null;
  } | null> {
    return null;
  }

  /**
   * Mock cari personel listesi
   */
  async getCariPersonelList(): Promise<MikroCariPersonel[]> {
    return [
      { code: '195.01.001', name: 'Necati', surname: 'UCAREP' },
      { code: '195.01.002', name: 'Ensar', surname: 'UCAREP' },
      { code: '195.01.003', name: 'Burcu', surname: 'Tiryaki' },
      { code: '195.01.006', name: 'Duygu', surname: 'Tiryaki' },
      { code: '195.01.007', name: 'Selim', surname: 'IMAK' },
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
      lineDescription?: string;
      quoteLineGuid?: string;
      responsibilityCenter?: string;
      reserveQty?: number;
    }>;
    applyVAT: boolean;
    description: string;
    documentDescription?: string;
    documentNo?: string;
    evrakSeri?: string;
    evrakSira?: number;
    warehouseNo?: number;
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
   * Mock cari hesap kontrolü ve oluşturma
   * Gerçek sistemde Mikro'ya cari kaydı yazacak
   */
  /**
   * Mock Mikro'ya teklif yazma
   */
  async hasOrdersForQuote(_params: { evrakSeri: string; evrakSira: number }): Promise<boolean> {
    return false;
  }

  async writeQuote(quoteData: {
    cariCode: string;
    quoteNumber: string;
    validityDate: Date;
    description: string;
    documentNo?: string;
    responsibleCode?: string;
    paymentPlanNo?: number | null;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
      priceListNo?: number;
    }>;
  }): Promise<{ quoteNumber: string; guid?: string }> {
    const mockQuoteNumber = `M-${Math.floor(Math.random() * 10000) + 1000}`;

    console.log('ğŸ“ [MOCK] Mikro\'ya teklif yazÄ±ldÄ±:', {
      ...quoteData,
      mockQuoteNumber,
    });

    return {
      quoteNumber: mockQuoteNumber,
      guid: undefined,
    };
  }

  async updateQuote(quoteData: {
    evrakSeri: string;
    evrakSira: number;
    cariCode: string;
    validityDate: Date;
    description: string;
    documentNo?: string;
    responsibleCode?: string;
    paymentPlanNo?: number | null;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
      priceListNo?: number;
    }>;
  }): Promise<{ quoteNumber: string }> {
    console.log('[MOCK] Teklif guncelleme:', {
      ...quoteData,
    });
    return {
      quoteNumber: `${quoteData.evrakSeri}-${quoteData.evrakSira}`,
    };
  }
  async getQuoteLines(params: { evrakSeri: string; evrakSira: number }): Promise<any[]> {
    console.log('[MOCK] Teklif satirlari isteniyor:', params);
    return [];
  }

  async getQuoteBelgeNos(pairs: Array<{ evrakSeri: string; evrakSira: number }>): Promise<Map<string, string>> {
    console.log('[MOCK] Teklif belge no listesi isteniyor:', pairs);
    return new Map();
  }

  async getCustomerQuoteHistory(params: {
    cariCode: string;
    productCodes: string[];
    limit: number;
  }): Promise<Array<import('../types').MikroCustomerQuoteHistory>> {
    console.log('[MOCK] Musteri teklif gecmisi isteniyor:', params);
    return [];
  }

  async getQuoteLineGuids(params: { evrakSeri: string; evrakSira: number }): Promise<Array<{
    satirNo: number;
    guid: string;
    productCode: string;
    unitPrice: number;
    quantity: number;
  }>> {
    console.log('[MOCK] Teklif guid listesi isteniyor:', params);
    return [];
  }

  async closeQuoteLines(params: {
    evrakSeri: string;
    evrakSira: number;
    lines: Array<{ satirNo: number; reason: string }>;
  }): Promise<number> {
    console.log('[MOCK] Teklif satir kapatma istendi:', params);
    return 0;
  }

  async reopenQuoteLines(params: {
    evrakSeri: string;
    evrakSira: number;
    lines: Array<{ satirNo: number }>;
  }): Promise<number> {
    console.log('[MOCK] Teklif satir acma istendi:', params);
    return 0;
  }

  async updateOrderLines(params: {
    orderNumber: string;
    items: Array<{
      existingProductCode?: string;
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
    }>;
    documentDescription?: string;
  }): Promise<void> {
    console.log('[MOCK] Siparis satir guncelleme istendi:', params);
  }

  async ensureCariExists(cariData: {
    cariCode: string;
    unvan: string;
    email?: string;
    phone?: string;
    city?: string;
    district?: string;
    hasEInvoice?: boolean;
    taxOffice?: string;
    taxNumber?: string;
  }): Promise<boolean> {
    console.log('📝 [MOCK] Cari kontrolü simüle edildi:', cariData.cariCode);
    // Mock modda her zaman var kabul et
    return false;
  }

  /**
   * Mock bağlantı testi
   */
  async testConnection(): Promise<boolean> {
    console.log('✅ [MOCK] Mikro bağlantısı simüle edildi');
    return true;
  }

  /**
   * Ham SQL sorgusu çalıştır (Mock)
   * Order tracking için gerçek DB gerekli, mock'ta çalışmaz
   */
  async executeQuery(query: string): Promise<any[]> {
    console.warn('⚠️ [MOCK] executeQuery çağrıldı - Mock modda order tracking çalışmaz');
    return [];
  }
}

export default new MikroMockService();






