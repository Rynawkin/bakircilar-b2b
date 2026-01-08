// ==================== USER TYPES ====================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'HEAD_ADMIN' | 'ADMIN' | 'MANAGER' | 'CUSTOMER' | 'DIVERSEY' | 'SALES_REP';
  customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode?: string;
  active?: boolean;
  paymentPlanNo?: number | null;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
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
  unit2?: string | null;
  unit2Factor?: number | null;
  excessStock: number;
  availableStock?: number;
  maxOrderQuantity?: number;
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
  excessPrices?: {
    invoiced: number;
    white: number;
  };
  listPrices?: {
    invoiced: number;
    white: number;
  };
  pricingMode?: 'LIST' | 'EXCESS';
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
  vatRate: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number; // KDV hariç
  totalVat: number; // KDV tutarı
  total: number; // KDV dahil
}

export interface AddToCartRequest {
  productId: string;
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  priceMode?: 'LIST' | 'EXCESS';
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
  mikroOrderIds?: string[];
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
  paymentPlanNo?: number | null;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
  hasEInvoice?: boolean;
  balance?: number;
  isLocked?: boolean;
  };
}

// ==================== QUOTE TYPES ====================

export type QuoteStatus =
  | 'PENDING_APPROVAL'
  | 'SENT_TO_MIKRO'
  | 'REJECTED'
  | 'CUSTOMER_ACCEPTED'
  | 'CUSTOMER_REJECTED';

export type QuotePriceSource = 'LAST_SALE' | 'PRICE_LIST' | 'MANUAL';

export interface QuoteItem {
  id: string;
  productCode: string;
  productName: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceSource: QuotePriceSource;
  priceListNo?: number;
  priceType: 'INVOICED' | 'WHITE';
  vatRate: number;
  vatZeroed: boolean;
  isManualLine: boolean;
  isBlocked: boolean;
  blockedReason?: string;
  sourceSaleDate?: string;
  sourceSalePrice?: number;
  sourceSaleQuantity?: number;
  sourceSaleVatZeroed?: boolean;
  lineDescription?: string;
  product?: {
    imageUrl?: string | null;
    unit?: string | null;
  };
}

export interface Quote {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  note?: string;
  documentNo?: string;
  responsibleCode?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  validityDate: string;
  vatZeroed: boolean;
  totalAmount: number;
  totalVat: number;
  grandTotal: number;
  mikroNumber?: string;
  mikroGuid?: string;
  mikroUpdatedAt?: string;
  adminNote?: string;
  adminActionAt?: string;
  customerRespondedAt?: string;
  createdAt: string;
  updatedAt: string;
  items: QuoteItem[];
  customer?: {
    id: string;
    name: string;
    email?: string;
    displayName?: string;
    mikroName?: string;
    mikroCariCode?: string;
    customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
    city?: string;
    district?: string;
    phone?: string;
    groupCode?: string;
    sectorCode?: string;
    paymentTerm?: number;
    paymentPlanNo?: number | null;
    paymentPlanCode?: string | null;
    paymentPlanName?: string | null;
    hasEInvoice?: boolean;
    balance?: number;
    isLocked?: boolean;
  };
  createdBy?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    role?: string;
  };
  adminUser?: {
    id: string;
    name: string;
    email?: string;
  };
}

// ==================== TASK TYPES ====================

export type TaskStatus = 'NEW' | 'TRIAGE' | 'IN_PROGRESS' | 'WAITING' | 'REVIEW' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskType =
  | 'BUG'
  | 'IMPROVEMENT'
  | 'FEATURE'
  | 'OPERATION'
  | 'PROCUREMENT'
  | 'REPORT'
  | 'DATA_SYNC'
  | 'ACCESS'
  | 'DESIGN_UX'
  | 'OTHER';
export type TaskVisibility = 'PUBLIC' | 'INTERNAL';
export type TaskLinkType = 'PRODUCT' | 'QUOTE' | 'ORDER' | 'CUSTOMER' | 'PAGE' | 'OTHER';
export type TaskView = 'KANBAN' | 'LIST';

export interface TaskUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface TaskLink {
  id: string;
  type: TaskLinkType;
  label?: string | null;
  referenceId?: string | null;
  referenceCode?: string | null;
  referenceUrl?: string | null;
}

export interface TaskComment {
  id: string;
  body: string;
  visibility: TaskVisibility;
  createdAt: string;
  author: TaskUser;
}

export interface TaskAttachment {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  visibility: TaskVisibility;
  createdAt: string;
  uploadedBy: TaskUser;
}

export interface TaskStatusHistory {
  id: string;
  fromStatus?: TaskStatus | null;
  toStatus: TaskStatus;
  createdAt: string;
  changedBy?: TaskUser | null;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description?: string | null;
  type: TaskType;
  priority: TaskPriority;
  defaultStatus: TaskStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  completedAt?: string | null;
  createdBy: TaskUser;
  assignedTo?: TaskUser | null;
  customer?: {
    id: string;
    name: string;
    displayName?: string;
    mikroName?: string;
    mikroCariCode?: string;
    sectorCode?: string;
  } | null;
  links?: TaskLink[];
  _count?: {
    comments: number;
    attachments: number;
  };
}

export interface TaskDetail extends Task {
  comments: TaskComment[];
  attachments: TaskAttachment[];
  statusHistory: TaskStatusHistory[];
}

export interface Notification {
  id: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  isRead: boolean;
  createdAt: string;
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
  customerPriceLists?: {
    BAYI: { invoiced: number; white: number };
    PERAKENDE: { invoiced: number; white: number };
    VIP: { invoiced: number; white: number };
    OZEL: { invoiced: number; white: number };
  };
  lastSyncAt?: string;
}

// ==================== CUSTOMER TYPES ====================

export interface Customer {
  id: string;
  email: string;
  name: string;
  customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode: string;
  invoicedPriceListNo?: number | null;
  whitePriceListNo?: number | null;
  active: boolean;
  createdAt: string;
  // Mikro-synced fields
  city?: string;
  district?: string;
  phone?: string;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  paymentPlanNo?: number | null;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
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
  invoicedPriceListNo?: number | null;
  whitePriceListNo?: number | null;
}

export interface CustomerContact {
  id: string;
  customerId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
  updatedAt: string;
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

// ==================== CAMPAIGN TYPES ====================

export type CampaignType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: CampaignType;
  discountValue: number; // Percentage: 0.15 = %15, Fixed: 50 = 50 TL
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  startDate: string;
  endDate: string;
  active: boolean;
  customerTypes: string[];
  categoryIds: string[];
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignRequest {
  name: string;
  description?: string;
  type: CampaignType;
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  startDate: string;
  endDate: string;
  active?: boolean;
  customerTypes?: string[];
  categoryIds?: string[];
  productIds?: string[];
}

export interface UpdateCampaignRequest extends Partial<CreateCampaignRequest> {}

export interface CalculateDiscountRequest {
  orderAmount: number;
  customerType: string;
  items: Array<{
    productId: string;
    categoryId: string;
    quantity: number;
    price: number;
  }>;
}

export interface CalculateDiscountResponse {
  discountAmount: number;
  finalAmount: number;
  appliedCampaign?: {
    id: string;
    name: string;
    type: CampaignType;
  };
}
