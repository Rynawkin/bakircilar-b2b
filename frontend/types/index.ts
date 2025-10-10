// ==================== USER TYPES ====================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'CUSTOMER';
  customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode?: string;
  active?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ==================== PRODUCT TYPES ====================

export interface Product {
  id: string;
  name: string;
  mikroCode: string;
  unit: string;
  excessStock: number;
  imageUrl?: string;
  warehouseStocks?: Record<string, number>;
  warehouseExcessStocks?: Record<string, number>;
  category: {
    id: string;
    name: string;
  };
  prices: {
    invoiced: number;
    white: number;
  };
}

export interface Category {
  id: string;
  name: string;
  mikroCode: string;
}

// ==================== CART TYPES ====================

export interface CartItem {
  id: string;
  product: {
    id: string;
    name: string;
    mikroCode: string;
    imageUrl?: string;
  };
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  unitPrice: number;
  totalPrice: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  total: number;
}

export interface AddToCartRequest {
  productId: string;
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
}

// ==================== ORDER TYPES ====================

export interface OrderItem {
  id: string;
  productName: string;
  mikroCode: string;
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  totalAmount: number;
  items: OrderItem[];
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  adminNote?: string;
}

export interface PendingOrderForAdmin extends Order {
  user: {
    name: string;
    email: string;
    mikroCariCode: string;
    customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
    city?: string;
    district?: string;
    phone?: string;
    groupCode?: string;
    sectorCode?: string;
    paymentTerm?: number;
    hasEInvoice?: boolean;
    balance?: number;
    isLocked?: boolean;
  };
}

// ==================== SETTINGS TYPES ====================

export interface Settings {
  id: string;
  calculationPeriodMonths: number;
  includedWarehouses: string[];
  minimumExcessThreshold: number;
  costCalculationMethod: 'LAST_ENTRY' | 'CURRENT_COST' | 'DYNAMIC';
  dynamicCostParams?: {
    dayThreshold?: number;
    priceWeightNew?: number;
    priceWeightOld?: number;
  };
  whiteVatFormula: string;
  lastSyncAt?: string;
}

// ==================== CUSTOMER TYPES ====================

export interface Customer {
  id: string;
  email: string;
  name: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode: string;
  active: boolean;
  createdAt: string;
  // Mikro-synced fields
  city?: string;
  district?: string;
  phone?: string;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  hasEInvoice?: boolean;
  balance?: number;
  isLocked?: boolean;
}

export interface CreateCustomerRequest {
  email: string;
  password: string;
  name: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode: string;
}

// ==================== CATEGORY PRICE RULE ====================

export interface CategoryWithPriceRules extends Category {
  priceRules: PriceRule[];
}

export interface PriceRule {
  id: string;
  categoryId: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  profitMargin: number;
}

export interface SetPriceRuleRequest {
  categoryId: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  profitMargin: number;
}

// ==================== DASHBOARD STATS ====================

export interface DashboardStats {
  orders: {
    pendingCount: number;
    approvedToday: number;
    totalAmount: number;
  };
  customerCount: number;
  excessProductCount: number;
  lastSyncAt?: string;
}

// ==================== SYNC ====================

export interface SyncResponse {
  message: string;
  syncLogId: string;
}

export interface SyncStatus {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  categoriesCount?: number;
  productsCount?: number;
  imagesDownloaded?: number;
  imagesSkipped?: number;
  imagesFailed?: number;
  errorMessage?: string;
  details?: {
    totalImages?: number;
    totalPricesToCalculate?: number;
    pricesCalculated?: number;
    totalStocksToCalculate?: number;
    stocksCalculated?: number;
  };
  warnings?: Array<{
    type: string;
    productCode: string;
    productName: string;
    message: string;
    size?: number;
  }>;
  isRunning: boolean;
  isCompleted: boolean;
}

// ==================== ERROR ====================

export interface ApiError {
  error: string;
  details?: string[];
}
