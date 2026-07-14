// ==================== USER TYPES ====================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'HEAD_ADMIN' | 'ADMIN' | 'MANAGER' | 'CUSTOMER' | 'DIVERSEY' | 'SALES_REP' | 'DEPOCU';
  customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode?: string;
  priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  vatDisplayPreference?: 'WITH_VAT' | 'WITHOUT_VAT';
  parentCustomerId?: string;
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
  vatRate?: number;
  popularSalesQuantity?: number;
  popularSalesValue?: number;
  popularSalesUpdatedAt?: string | null;
  excessStock: number;
  availableStock?: number;
  maxOrderQuantity?: number;
  imageUrl?: string;
  images?: string[]; // Urun galerisi (coklu gorsel) — sadece detay ucundan gelir; primary once
  imageSizeBytes?: number | null;
  imageUploadedAt?: string | null;
  imageUploadedById?: string | null;
  imageUploadedByName?: string | null;
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
  agreement?: {
    priceInvoiced: number;
    priceWhite?: number | null;
    customerProductCode?: string | null;
    minQuantity: number;
    validFrom: string;
    validTo?: string | null;
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
  // Paket (bundle) alanlari
  isBundle?: boolean;
  bundleDiscountPercent?: number;
  bundleItemCount?: number;
  bundleContents?: Array<{ mikroCode: string; name: string; quantity: number; unit?: string | null }>;
  lastSales?: Array<{
    saleDate: string;
    quantity: number;
    unitPrice: number;
    lineTotal?: number;
    vatAmount?: number;
    vatRate?: number;
    vatZeroed?: boolean;
    orderNumber?: string | null;
    documentNo?: string | null;
  }>;
}

export interface Category {
  id: string;
  name: string;
  mikroCode: string;
  imageUrl?: string | null;
  autoImage?: boolean; // true: imageUrl kategorinin cok-satan urun gorselinden turetildi (portre olabilir)
}

// ==================== CART TYPES ====================

export interface CartItem {
  id: string;
  product: {
    id: string;
    name: string;
    mikroCode: string;
    imageUrl?: string;
    unit?: string | null;
    unit2?: string | null;
    unit2Factor?: number | null;
  };
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  priceMode?: 'LIST' | 'EXCESS';
  unitPrice: number;
  totalPrice: number;
  vatRate: number;
  lineNote?: string | null;
  responsibilityCenter?: string | null;
  /** Musteri 2. birim (KOLI/PAKET) sectiyse birim adi; ana birim ise null/bos */
  selectedUnit?: string | null;
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
  /** BAZ (ana) birim miktari; 2. birim secildiyse cagirandan cevrilerek gelir (float olabilir) */
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  priceMode?: 'LIST' | 'EXCESS';
  /** Musteri 2. birim (KOLI/PAKET) sectiyse birim adi — depo notu icin backend'e iletilir */
  selectedUnit?: string | null;
}

// ==================== ORDER TYPES ====================

export interface OrderItem {
  id: string;
  productName: string;
  mikroCode: string;
  unit?: string | null;
  unit2?: string | null;
  unit2Factor?: number | null;
  selectedUnit?: string | null;
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  unitPrice: number;
  totalPrice: number;
  mikroOrderId?: string | null;
  lineNote?: string | null;
  approvedQuantity?: number | null;
  responsibilityCenter?: string | null;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  isGift?: boolean;
  vatRate?: number | null;
  vatZeroed?: boolean;
  product?: {
    id: string;
    name: string;
    mikroCode: string;
    unit?: string | null;
    imageUrl?: string | null;
    vatRate?: number | null;
  } | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  totalAmount: number;
  items: OrderItem[];
  createdAt: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  adminNote?: string;
  mikroOrderIds?: string[];
  customerOrderNumber?: string | null;
  deliveryLocation?: string | null;
  sourceQuote?: {
    id: string;
    quoteNumber: string;
    createdAt: string;
  } | null;
  customerRequest?: {
    id: string;
    createdAt: string;
    requestedBy?: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
  } | null;
  requestedBy?: {
    id: string;
    name: string;
    email?: string;
    phone?: string | null;
  };
}

// ==================== ORDER REQUEST TYPES ====================

export interface OrderRequestItem {
  id: string;
  product: {
    id: string;
    name: string;
    mikroCode: string;
    unit?: string;
    imageUrl?: string;
  };
  quantity: number;
  approvedQuantity?: number | null;
  customerProductCode?: string | null;
  priceMode: 'LIST' | 'EXCESS';
  status: 'PENDING' | 'CONVERTED' | 'REJECTED';
  lineNote?: string | null;
  selectedPriceType?: 'INVOICED' | 'WHITE';
  selectedUnitPrice?: number;
  selectedTotalPrice?: number;
  previewUnitPriceInvoiced?: number;
  previewUnitPriceWhite?: number;
  previewTotalPriceInvoiced?: number;
  previewTotalPriceWhite?: number;
}

export interface OrderRequest {
  id: string;
  status: 'PENDING' | 'CONVERTED' | 'REJECTED';
  note?: string;
  orderId?: string | null;
  createdAt: string;
  convertedAt?: string | null;
  requestedBy?: {
    id: string;
    name: string;
    email?: string | null;
  };
  convertedBy?: {
    id: string;
    name: string;
    email?: string | null;
  };
  items: OrderRequestItem[];
}

export interface PendingOrderForAdmin extends Order {
  user: {
    id?: string;
    name: string;
    email: string;
    mikroCariCode: string;
    displayName?: string | null;
    mikroName?: string | null;
    customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
    city?: string | null;
    district?: string | null;
    phone?: string | null;
    groupCode?: string | null;
    sectorCode?: string | null;
    paymentTerm?: number | null;
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
export type QuoteItemStatus = 'OPEN' | 'CONVERTED' | 'CLOSED';

export interface QuoteItem {
  id: string;
  productCode: string;
  productName: string;
  unit?: string;
  unit2?: string | null;
  unit2Factor?: number | null;
  selectedUnit?: string | null;
  lineOrder?: number;
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
  status?: QuoteItemStatus;
  statusUpdatedAt?: string;
  closedReason?: string | null;
  closedAt?: string | null;
  convertedAt?: string | null;
  sourceSaleDate?: string;
  sourceSalePrice?: number;
  sourceSaleQuantity?: number;
  sourceSaleVatZeroed?: boolean;
  lineDescription?: string;
  manualImageUrl?: string | null;
  lastSales?: Array<{
    saleDate: string;
    quantity: number;
    unitPrice: number;
    lineTotal?: number;
    vatAmount?: number;
    vatRate?: number;
    vatZeroed?: boolean;
  }>;
  lastQuotes?: Array<{
    quoteDate: string;
    quantity: number;
    unitPrice: number;
    priceType?: 'INVOICED' | 'WHITE';
    documentNo?: string | null;
    quoteNumber?: string | null;
  }>;
  mikroPriceLists?: Record<number, number> | Record<string, number>;
  product?: {
    imageUrl?: string | null;
    unit?: string | null;
    unit2?: string | null;
    unit2Factor?: number | null;
    lastEntryPrice?: number | null;
    lastEntryDate?: string | null;
    currentCost?: number | null;
    currentCostDate?: string | null;
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
  customerPdfSentAt?: string | null;
  customerRespondedAt?: string;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string | null;
  convertedSource?: 'B2B' | 'MIKRO' | null;
  items: QuoteItem[];
  orders?: Array<{ id: string; orderNumber: string; createdAt: string }>;
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
  updatedBy?: {
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
  customerPdfSentBy?: {
    id: string;
    name: string;
    email?: string;
  } | null;
}

export interface QuoteLineItem extends QuoteItem {
  waitingDays?: number;
  quote?: {
    id: string;
    quoteNumber: string;
    documentNo?: string | null;
    status: QuoteStatus;
    createdAt: string;
    mikroNumber?: string | null;
    customer?: {
      id: string;
      name: string;
      displayName?: string;
      mikroCariCode?: string;
    };
  };
}

export type QuoteHistoryAction = 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'CONVERTED';

export interface QuoteHistory {
  id: string;
  quoteId: string;
  action: QuoteHistoryAction;
  summary?: string | null;
  payload?: any;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email?: string;
  } | null;
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

// ==================== VADE TYPES ====================

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
    displayName?: string | null;
    mikroName?: string | null;
    mikroCariCode?: string | null;
    sectorCode?: string | null;
    groupCode?: string | null;
    city?: string | null;
    district?: string | null;
    phone?: string | null;
    paymentPlanNo?: number | null;
    paymentPlanCode?: string | null;
    paymentPlanName?: string | null;
    balance?: number;
    isLocked?: boolean;
    vadeClassification?: {
      classification: string;
      customClassification?: string | null;
      riskScore?: number | null;
    } | null;
  };
}

export interface VadeNote {
  id: string;
  customerId: string;
  authorId?: string | null;
  noteContent: string;
  promiseDate?: string | null;
  tags: string[];
  reminderDate?: string | null;
  reminderNote?: string | null;
  reminderCompleted: boolean;
  reminderSentAt?: string | null;
  balanceAtTime?: number | null;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    name: string;
    displayName?: string | null;
    mikroName?: string | null;
    mikroCariCode?: string | null;
    sectorCode?: string | null;
  };
  author?: {
    id: string;
    name: string;
    email?: string | null;
    role?: string | null;
  };
}

export interface VadeClassification {
  id: string;
  customerId: string;
  classification: string;
  customClassification?: string | null;
  riskScore?: number | null;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VadeAssignment {
  id: string;
  staffId: string;
  customerId: string;
  assignedById?: string | null;
  createdAt: string;
  updatedAt: string;
  staff?: {
    id: string;
    name: string;
    email?: string | null;
    role?: string | null;
  };
  customer?: {
    id: string;
    name: string;
    mikroCariCode?: string | null;
    sectorCode?: string | null;
  };
}

export interface VadeSyncLog {
  id: string;
  source: VadeBalanceSource;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  recordsTotal: number;
  recordsUpdated: number;
  recordsSkipped: number;
  startedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
}

export interface VadeAgingBucket { amount: number; count: number }
export interface VadeDistributionItem { label: string; amount: number; count: number }
export interface VadeDashboard {
  kpis: { count: number; overdue: number; upcoming: number; total: number };
  aging: Record<'d0_30' | 'd31_60' | 'd61_90' | 'd91_180' | 'd181_365' | 'd365plus', VadeAgingBucket> | null;
  concentration: { overdueCount: number; top10: number; top20: number; top50: number };
  sectorDistribution: VadeDistributionItem[];
  groupDistribution: VadeDistributionItem[];
  topOverdue: Array<{ id: string; code: string; name: string; sector: string; pastDue: number; valor: number }>;
}

export interface VadeAnalytics {
  customerBehavior: Array<{
    name: string; code: string; sector: string;
    noteCount: number; promiseCount: number;
    lastNoteAt: string | null; mostUsedTag: string | null; mostUsedTagCount: number;
  }>;
  staffPerformance: Array<{
    name: string; role: string;
    totalNotes: number; promiseNotes: number; taggedNotes: number;
    uniqueCustomers: number; avgNotesPerCustomer: number;
  }>;
  days: number;
}

export interface VadeManagement {
  summary: { totalUsers: number; totalNotes: number; totalAssignments: number; activeUsers: number };
  topPerformers: Array<{
    id: string; name: string; role: string;
    noteCount: number; assignedCustomers: number; efficiency: number;
    activityScore: number; lastActivity: string | null; daysSinceActivity: number | null;
  }>;
  issues: Array<{ type: 'warning' | 'info' | 'error'; title: string; names: string[] }>;
  dailyTrend: Array<{ date: string; notes: number }>;
  days: number;
}

// ==================== E-INVOICE TYPES ====================

export type EInvoiceMatchStatus = 'MATCHED' | 'PARTIAL' | 'NOT_FOUND';

export interface EInvoiceDocument {
  id: string;
  invoiceNo: string;
  evrakSeri?: string | null;
  evrakSira?: number | null;
  eInvoiceUuid?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  customerTaxNo?: string | null;
  customerBalance?: number | null;
  issueDate?: string | null;
  sentAt?: string | null;
  subtotalAmount?: number | null;
  totalAmount?: number | null;
  currency: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  matchStatus: EInvoiceMatchStatus;
  matchError?: string | null;
  uploadedBy?: {
    id: string;
    name: string;
  };
  customer?: {
    id: string;
    name?: string;
    displayName?: string;
    mikroName?: string;
    mikroCariCode?: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ==================== ONLINE PAYMENT TYPES ====================

export type PaymentAmountType = 'TOTAL_BALANCE' | 'PAST_DUE' | 'CUSTOM';
export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED'
  | 'REVIEW_REQUIRED'
  | 'CANCELLED';

export interface PaymentAttempt {
  id: string;
  orderId: string;
  customerId: string;
  customerCode?: string | null;
  customerName: string;
  amountType: PaymentAmountType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  bankName: string;
  paymentLinkUrl?: string | null;
  linkExpiresAt?: string | null;
  lastVerifiedAt?: string | null;
  succeededAt?: string | null;
  failedAt?: string | null;
  reconciledAt?: string | null;
  reconciliationNote?: string | null;
  bankMessage?: string | null;
  bankReturnCode?: string | null;
  bankTransactionStatus?: string | null;
  requestedByName?: string | null;
  reconciledByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSummary {
  customer: { id: string; code?: string | null; name: string };
  balance: {
    total: number;
    pastDue: number;
    notDue: number;
    updatedAt: string;
    referenceDate?: string | null;
    source: string;
  };
  availability: {
    total: number;
    pastDue: number;
    reserved: number;
    successfulUnreconciled: number;
  };
  gateway: {
    configured: boolean;
    enabled: boolean;
    bankName: string;
    method: 'PAY_BY_LINK';
    hosted: true;
  };
  eligibility: {
    canCreate: boolean;
    balanceFresh: boolean;
    balanceAgeHours: number;
    maxBalanceAgeHours: number;
    reason: 'GATEWAY_DISABLED' | 'GATEWAY_NOT_CONFIGURED' | 'BALANCE_STALE' | 'NO_PAYABLE_BALANCE' | null;
  };
  limits: { min: number; max: number; currency: 'TRY' };
}

export interface Notification {
  id: string;
  category?: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreference {
  key: string;
  label: string;
  enabled: boolean;
}

// ==================== SETTINGS TYPES ====================

export interface Settings {
  id: string;
  calculationPeriodMonths: number;
  includedWarehouses: string[];
  minimumExcessThreshold: number;
  costCalculationMethod: 'LAST_ENTRY' | 'CURRENT_COST' | 'DYNAMIC';
  /** Kategori/urun kurali olmayan urunlere uygulanan varsayilan kar marji (0.15 = %15) */
  defaultProfitMargin?: number;
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
  heroBannerIntervalMs?: number;
  // Son satis fiyatini liste degisimine endeksleme (useLastPrices carilerde)
  lastPriceIndexationEnabled?: boolean;
  marginReportEmailEnabled?: boolean;
  marginReportEmailRecipients?: string[];
  marginReportEmailSubject?: string;
  marginReportEmailColumns?: string[];
  marginReportIncludedSectorCodes?: string[];
  marginAlertLowThreshold?: number;
  marginAlertHighThreshold?: number;
  marginEmailWorstLimit?: number;
  marginPersonalEmailEnabled?: boolean;
  marginViolationEscalationBusinessDays?: number;
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
  priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  useLastPrices?: boolean;
  lastPriceGuardType?: 'COST' | 'PRICE_LIST';
  lastPriceGuardInvoicedListNo?: number | null;
  lastPriceGuardWhiteListNo?: number | null;
  lastPriceCostBasis?: 'CURRENT_COST' | 'LAST_ENTRY';
  lastPriceMinCostPercent?: number;
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
  priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  useLastPrices?: boolean;
  lastPriceGuardType?: 'COST' | 'PRICE_LIST';
  lastPriceGuardInvoicedListNo?: number | null;
  lastPriceGuardWhiteListNo?: number | null;
  lastPriceCostBasis?: 'CURRENT_COST' | 'LAST_ENTRY';
  lastPriceMinCostPercent?: number;
}

export interface CustomerPriceListRule {
  id?: string;
  brandCode?: string | null;
  categoryId?: string | null;
  invoicedPriceListNo: number;
  whitePriceListNo: number;
}

export interface PriceRuleBrandTemplate {
  id: string;
  name: string;
  description?: string | null;
  brandCodes: string[];
  active: boolean;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
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
  period?: 'daily' | 'weekly' | 'monthly' | 'custom';
  periodRange?: {
    startAt: string;
    endAt: string;
  };
  sectorScope?: {
    mode: 'assigned' | 'self' | 'all';
    codes: string[];
  };
  summary?: {
    sales: {
      count: number;
      amount: number;
    };
    orders: {
      count: number;
      amount: number;
    };
    quotes: {
      count: number;
      amount: number;
    };
  };
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

// ==================== PRICE / MARGIN CONSISTENCY ====================

export type PriceMarginListStatus =
  | 'OK'
  | 'MISSING_COST'
  | 'MISSING_MARGIN'
  | 'MISSING_PRICE'
  | 'PRICE_MISMATCH'
  | 'DUPLICATE_PRICE';

export interface PriceMarginListCheck {
  listNo: number;
  costType: 'T' | 'P';
  marginNo: number;
  baseCost: number | null;
  margin: number | null;
  expectedPrice: number | null;
  actualPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceRowCount: number;
  differenceAmount: number | null;
  differencePercent: number | null;
  status: PriceMarginListStatus;
}

export interface PriceMarginConsistencyRow {
  productCode: string;
  productName: string;
  categoryCode: string | null;
  categoryName: string | null;
  brandCode: string | null;
  mainSupplierCode: string | null;
  mainSupplierName: string | null;
  costP: number | null;
  costT: number | null;
  margins: Array<number | null>;
  listChecks: PriceMarginListCheck[];
  issueTypes: PriceMarginListStatus[];
  problemListCount: number;
  maxDifferenceAmount: number;
  maxDifferencePercent: number;
  isCompliant: boolean;
}

export interface PriceMarginConsistencyReport {
  rows: PriceMarginConsistencyRow[];
  summary: {
    totalProducts: number;
    compliantProducts: number;
    problemProducts: number;
    priceMismatchProducts: number;
    missingMarginProducts: number;
    missingPriceProducts: number;
    missingCostProducts: number;
    duplicatePriceProducts: number;
    filteredProducts: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
  options: {
    categories: string[];
    brands: string[];
    suppliers: string[];
  };
  metadata: {
    generatedAt: string;
    stale: boolean;
    staleReason: string | null;
    cacheTtlSeconds: number;
    tolerance: number;
    source: 'MIKRO_LIVE';
  };
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

