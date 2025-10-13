import { User, Product, Order, OrderItem, Cart, CartItem, Category } from '@prisma/client';

// ==================== USER TYPES ====================

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserResponse;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  customerType?: string;
  mikroCariCode?: string;
}

export interface CreateCustomerRequest {
  email: string;
  password: string;
  name: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode: string;
}

// ==================== MIKRO TYPES ====================

export interface MikroCategory {
  id: string;
  code: string;
  name: string;
}

export interface MikroProduct {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  vatRate: number;
  lastEntryPrice?: number;
  lastEntryDate?: Date;
  currentCost?: number;
  currentCostDate?: string | Date; // SQL'den string olarak geliyor (Türkçe format)
  guid?: string; // Resim çekmek için GUID gerekli (optional for mock)
  warehouseStocks?: Record<string, number>; // Depo bazlı stoklar (getProducts()'tan geliyor)
}

export interface MikroWarehouseStock {
  productCode: string;
  warehouseCode: string;
  quantity: number;
}

export interface MikroSalesMovement {
  productCode: string;
  year: number;
  month: number;
  totalQuantity: number;
}

export interface MikroPendingOrder {
  productCode: string;
  quantity: number;
  type: 'SALES' | 'PURCHASE';
}

export interface MikroCari {
  code: string;
  name: string;
  city?: string;
  district?: string;
  phone?: string;
  isLocked: boolean;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  hasEInvoice: boolean;
  balance: number;
}

// ==================== PRODUCT TYPES ====================

export interface ProductPrices {
  BAYI: {
    INVOICED: number;
    WHITE: number;
  };
  PERAKENDE: {
    INVOICED: number;
    WHITE: number;
  };
  VIP: {
    INVOICED: number;
    WHITE: number;
  };
  OZEL: {
    INVOICED: number;
    WHITE: number;
  };
}

export interface ProductWithPricesForCustomer {
  id: string;
  name: string;
  mikroCode: string;
  excessStock: number;
  unit: string;
  imageUrl?: string;
  prices: {
    invoiced: number;
    white: number;
  };
  category: {
    name: string;
  };
}

// ==================== CART TYPES ====================

export interface AddToCartRequest {
  productId: string;
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
}

export interface CartResponse {
  id: string;
  items: CartItemResponse[];
  total: number;
}

export interface CartItemResponse {
  id: string;
  product: {
    id: string;
    name: string;
    mikroCode: string;
  };
  quantity: number;
  priceType: string;
  unitPrice: number;
  totalPrice: number;
}

// ==================== ORDER TYPES ====================

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  message: string;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  items: OrderItemResponse[];
  createdAt: string;
  approvedAt?: string;
}

export interface OrderItemResponse {
  id: string;
  productName: string;
  mikroCode: string;
  quantity: number;
  priceType: string;
  unitPrice: number;
  totalPrice: number;
}

export interface PendingOrderForAdmin {
  id: string;
  orderNumber: string;
  user: {
    name: string;
    email: string;
    mikroCariCode: string;
  };
  items: OrderItemResponse[];
  totalAmount: number;
  createdAt: string;
}

export interface ApproveOrderResponse {
  message: string;
  mikroOrderIds: string[];
}

// ==================== SETTINGS TYPES ====================

export interface SettingsResponse {
  calculationPeriodMonths: number;
  includedWarehouses: string[];
  minimumExcessThreshold: number;
  costCalculationMethod: string;
  dynamicCostParams?: any;
  whiteVatFormula: string;
  lastSyncAt?: string;
}

export interface UpdateSettingsRequest {
  calculationPeriodMonths?: number;
  includedWarehouses?: string[];
  minimumExcessThreshold?: number;
  costCalculationMethod?: string;
  dynamicCostParams?: any;
  whiteVatFormula?: string;
}

// ==================== PRICE RULE TYPES ====================

export interface SetCategoryPriceRuleRequest {
  categoryId: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  profitMargin: number; // 0.15 = 15%
}

export interface SetProductPriceOverrideRequest {
  productId: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  profitMargin: number;
}

// ==================== SYNC TYPES ====================

export interface SyncResponse {
  message: string;
  stats: {
    categoriesUpdated: number;
    productsUpdated: number;
    pricesCalculated: number;
  };
}

// ==================== ERROR TYPES ====================

export interface ApiError {
  error: string;
  details?: string[];
}

export interface StockCheckError {
  error: 'INSUFFICIENT_STOCK';
  details: string[];
}

// ==================== REQUEST EXTENSIONS ====================

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
        assignedSectorCodes: string[]; // SALES_REP için atanan sektör kodları
      };
    }
  }
}
