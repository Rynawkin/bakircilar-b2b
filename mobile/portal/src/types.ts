export type CustomerType = 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
export type PriceVisibility = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
export type UserRole = 'HEAD_ADMIN' | 'ADMIN' | 'MANAGER' | 'CUSTOMER' | 'DIVERSEY' | 'SALES_REP';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  customerType?: CustomerType;
  mikroCariCode?: string;
  priceVisibility?: PriceVisibility;
  vatDisplayPreference?: 'WITH_VAT' | 'WITHOUT_VAT';
  parentCustomerId?: string | null;
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

export interface QuoteItem {
  id: string;
  productId?: string | null;
  productCode?: string;
  productName: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceSource?: 'PRICE_LIST' | 'MANUAL' | 'LAST_SALE';
  priceListNo?: number | null;
  priceType?: 'INVOICED' | 'WHITE';
  vatRate?: number;
  vatZeroed?: boolean;
  isManualLine?: boolean;
  manualVatRate?: number | null;
  lineDescription?: string | null;
  lastSales?: LastSale[];
  lastEntryPrice?: number | null;
  currentCost?: number | null;
  mikroPriceLists?: Record<string, number>;
}

export interface LastSale {
  saleDate: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number | null;
  vatZeroed?: boolean | null;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
  totalAmount: number;
  totalVat?: number;
  grandTotal?: number;
  createdAt: string;
  validityDate?: string;
  note?: string | null;
  documentNo?: string | null;
  responsibleCode?: string | null;
  vatZeroed?: boolean;
  mikroNumber?: string | null;
  adminNote?: string | null;
  items?: QuoteItem[];
  customer?: {
    id?: string;
    name?: string;
    displayName?: string;
    mikroName?: string;
    mikroCariCode?: string;
    paymentTerm?: number;
    paymentPlanName?: string | null;
  };
  createdBy?: {
    id?: string;
    name?: string;
    email?: string;
  };
}

export interface OrderItem {
  id: string;
  productName: string;
  mikroCode: string;
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  unitPrice: number;
  totalPrice: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  product?: {
    name?: string;
    mikroCode?: string;
    unit?: string;
    imageUrl?: string | null;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items?: OrderItem[];
  user?: {
    name?: string;
    mikroCariCode?: string;
  };
}

export type TaskType =
  | 'CALL'
  | 'FOLLOW_UP'
  | 'COLLECTION'
  | 'MEETING'
  | 'VISIT'
  | 'SUPPORT'
  | 'QUOTE'
  | 'ORDER'
  | 'CUSTOMER'
  | 'INTERNAL'
  | 'DOCUMENT'
  | 'REPORT'
  | 'DATA_SYNC'
  | 'ACCESS'
  | 'DESIGN_UX'
  | 'OTHER';
export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
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
  lastActivityAt?: string;
  completedAt?: string | null;
  createdBy?: TaskUser;
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

export interface Customer {
  id: string;
  email?: string;
  name: string;
  customerType?: CustomerType;
  mikroCariCode?: string;
  invoicedPriceListNo?: number | null;
  whitePriceListNo?: number | null;
  priceVisibility?: PriceVisibility;
  active?: boolean;
  createdAt?: string;
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

export interface CustomerContact {
  id: string;
  customerId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSubUser {
  id: string;
  name: string;
  email?: string;
  active: boolean;
  createdAt: string;
}

export interface Agreement {
  id: string;
  productId: string;
  productName?: string;
  mikroCode?: string;
  priceInvoiced: number;
  priceWhite: number;
  minQuantity?: number;
  validFrom?: string | null;
  validTo?: string | null;
  product?: {
    id?: string;
    name?: string;
    mikroCode?: string;
    unit?: string | null;
  };
}

export interface Product {
  id: string;
  name: string;
  mikroCode: string;
  unit?: string | null;
  unit2?: string | null;
  unit2Factor?: number | null;
  excessStock?: number | null;
  totalStock?: number | null;
  currentCost?: number | null;
  lastEntryPrice?: number | null;
  vatRate?: number | null;
  mikroPriceLists?: Record<string, number>;
  imageUrl?: string | null;
  imageSyncStatus?: string | null;
  imageSyncErrorType?: string | null;
  imageSyncErrorMessage?: string | null;
  imageSyncUpdatedAt?: string | null;
  warehouseStocks?: Record<string, number>;
  lastSales?: LastSale[];
}

export interface CostUpdateAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCost: number;
  lastEntryCost: number;
  diffPercent: number;
  riskAmount: number;
  stockQuantity: number;
  dayDiff: number;
  salePrice: number;
}

export interface CostUpdateSummary {
  totalAlerts: number;
  totalRiskAmount: number;
  totalStockValue: number;
  avgDiffPercent: number;
}

export type MarginComplianceRow = Record<string, any>;

export interface PriceHistoryChange {
  productCode: string;
  productName: string;
  category: string;
  changeDate: string;
  avgChangePercent: number;
  updatedListsCount: number;
  isConsistent: boolean;
  changeDirection: 'increase' | 'decrease' | 'mixed';
}

export interface CategoryWithPriceRules {
  id: string;
  name: string;
  priceRules: Array<{ id: string; customerType: CustomerType; profitMargin: number }>;
}

export interface SetPriceRuleRequest {
  categoryId: string;
  customerType: CustomerType;
  profitMargin: number;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y';
  discountValue: number;
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

export interface Exclusion {
  id: string;
  type: 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';
  value: string;
  description?: string;
  active: boolean;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  assignedSectorCodes: string[];
  active: boolean;
  createdAt: string;
}

export type VadeBalanceSource = 'MIKRO' | 'EXCEL' | 'MANUAL';

export interface VadeBalance {
  id: string;
  pastDueBalance: number;
  pastDueDate?: string | null;
  notDueBalance: number;
  notDueDate?: string | null;
  totalBalance: number;
  valor: number;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
  source: VadeBalanceSource;
  createdAt: string;
  updatedAt: string;
  lastNoteAt?: string | null;
  user: {
    id: string;
    name: string;
    mikroCariCode?: string | null;
    sectorCode?: string | null;
    groupCode?: string | null;
  };
}

export interface VadeNote {
  id: string;
  customerId: string;
  noteContent: string;
  promiseDate?: string | null;
  tags?: string[];
  reminderDate?: string | null;
  reminderNote?: string | null;
  reminderCompleted?: boolean;
  balanceAtTime?: number | null;
  author?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface VadeClassification {
  id: string;
  customerId: string;
  classification: string;
  customClassification?: string | null;
  riskScore?: number | null;
  updatedAt: string;
}

export interface VadeAssignment {
  id: string;
  staffId: string;
  customerId: string;
  staff?: { id: string; name: string; email?: string };
  customer?: { id: string; name: string; mikroCariCode?: string };
  createdAt: string;
}

export interface VadeSyncLog {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  totalRows?: number;
  successRows?: number;
  failedRows?: number;
  errorMessage?: string | null;
}

export interface EInvoiceDocument {
  id: string;
  invoiceNo: string;
  customerCode?: string;
  documentUrl?: string;
  fileName?: string;
  issueDate?: string;
  sentAt?: string;
  subtotalAmount?: number;
  totalAmount?: number;
  currency?: string;
  matchStatus?: string;
  customerName?: string;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    name?: string;
    displayName?: string;
    mikroName?: string;
    mikroCariCode?: string;
  };
}

export interface SyncStatus {
  id?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  categoriesCount?: number;
  productsCount?: number;
  imagesDownloaded?: number;
  imagesSkipped?: number;
  imagesFailed?: number;
  errorMessage?: string | null;
  warnings?: string[] | null;
  details?: Record<string, any> | null;
}
