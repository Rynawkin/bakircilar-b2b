export interface User {
  id: string;
  email: string;
  name: string;
  role: 'HEAD_ADMIN' | 'ADMIN' | 'MANAGER' | 'CUSTOMER' | 'DIVERSEY' | 'SALES_REP';
  customerType?: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
  mikroCariCode?: string;
  priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
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

export interface Product {
  id: string;
  name: string;
  mikroCode: string;
  imageUrl?: string | null;
  images?: string[];
  description?: string | null;
  recommendationNote?: string | null;
  unit?: string | null;
  unit2?: string | null;
  unit2Factor?: number | null;
  vatRate?: number;
  availableStock?: number;
  excessStock?: number;
  maxOrderQuantity?: number;
  pricingMode?: 'LIST' | 'EXCESS';
  warehouseStocks?: Record<string, number>;
  warehouseExcessStocks?: Record<string, number>;
  prices: {
    invoiced: number;
    white: number;
  };
  excessPrices?: {
    invoiced: number;
    white: number;
  };
  listPrices?: {
    invoiced?: number;
    white?: number;
  };
  isBundle?: boolean;
  bundleDiscountPercent?: number | null;
  bundleItemCount?: number;
  bundleContents?: Array<{
    mikroCode: string;
    name: string;
    quantity: number;
    unit?: string | null;
  }>;
  category?: {
    id: string;
    name: string;
  };
  agreement?: {
    priceInvoiced: number;
    priceWhite: number;
    minQuantity: number;
    validFrom: string;
    validTo?: string | null;
  };
}

export interface Category {
  id: string;
  name: string;
  mikroCode?: string | null;
  imageUrl?: string | null;
  count?: number;
}

export interface CustomerFinancials {
  totalBalance: number;
  pastDueBalance: number;
  pastDueDate?: string | null;
  notDueBalance: number;
  notDueDate?: string | null;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
}

export interface PersonalRecommendations {
  products: Product[];
  missingCategories: Array<{
    category: { id: string; name: string };
    products: Product[];
  }>;
}

export interface UnboughtCategory {
  id: string;
  name: string;
  mikroCode?: string | null;
  imageUrl?: string | null;
  count?: number;
}

export type BannerPosition = 'HERO' | 'STRIP' | 'SIDE' | 'GRID';

export interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  linkUrl?: string | null;
  productCode?: string | null;
  buttonText?: string | null;
  position: BannerPosition;
  sortOrder?: number;
  active?: boolean;
}

export interface CollectionCard {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  href?: string;
  sourceType?: 'RULE' | 'MANUAL';
}

export interface CollectionDetail {
  collection: CollectionCard;
  products: Product[];
}

export interface Order {
  id: string;
  orderNumber: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  totalAmount: number;
  createdAt: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  productName: string;
  mikroCode: string;
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  unitPrice: number;
  totalPrice: number;
}

export interface CartItem {
  id: string;
  product: {
    id: string;
    name: string;
    mikroCode: string;
    imageUrl?: string | null;
  };
  quantity: number;
  priceType: 'INVOICED' | 'WHITE';
  unitPrice: number;
  totalPrice: number;
  vatRate: number;
  lineNote?: string | null;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  totalVat: number;
  total: number;
}

export interface GiftCampaignGift {
  id: string;
  productId: string;
  name: string;
  mikroCode: string;
  imageUrl?: string | null;
  unit?: string | null;
  value: number;
  giftQuantity: number;
  normalPrice: number;
}

export interface ActiveGiftCampaign {
  active: boolean;
  id?: string;
  title?: string;
  subtitle?: string | null;
  bannerImageUrl?: string | null;
  mobileBannerImageUrl?: string | null;
  buttonText?: string | null;
  threshold?: number;
  thresholdPriceType?: 'white' | 'invoiced';
  thresholdVatIncluded?: boolean;
  qualifyingTotal?: number;
  qualified?: boolean;
  remaining?: number;
  giftPickCount?: number;
  gifts?: GiftCampaignGift[];
  selectedGiftProductIds?: string[];
  validFrom?: string | null;
  validTo?: string | null;
}

export interface RecommendationGroup {
  baseProduct: {
    id: string;
    name: string;
    mikroCode: string;
  };
  products: Product[];
}

export interface OrderRequest {
  id: string;
  status: 'PENDING' | 'CONVERTED' | 'REJECTED';
  createdAt: string;
  note?: string;
  requestedBy?: {
    id: string;
    name: string;
    email?: string | null;
  };
  items?: OrderRequestItem[];
}

export interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
  totalAmount: number;
  totalVat?: number;
  grandTotal?: number;
  validityDate?: string;
  note?: string;
  createdAt: string;
  items?: QuoteItem[];
}

export interface Notification {
  id: string;
  category?: string | null;
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

export interface Task {
  id: string;
  title: string;
  status: string;
  priority?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  customer?: {
    name?: string;
    mikroCariCode?: string;
  };
  assignedTo?: {
    id: string;
    name?: string;
  } | null;
}

export interface TaskDetail extends Task {
  description?: string | null;
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
  links?: Array<{
    id: string;
    type: string;
    label?: string | null;
    referenceCode?: string | null;
    referenceUrl?: string | null;
  }>;
}

export interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
  createdBy?: {
    name?: string;
  } | null;
}

export interface TaskAttachment {
  id: string;
  filename: string;
  url: string;
  createdAt: string;
}

export interface OrderRequestItem {
  id: string;
  product: {
    id: string;
    name: string;
    mikroCode: string;
    unit?: string | null;
    imageUrl?: string | null;
  };
  quantity: number;
  priceMode: 'LIST' | 'EXCESS';
  status: 'PENDING' | 'CONVERTED' | 'REJECTED';
  selectedPriceType?: 'INVOICED' | 'WHITE';
  previewUnitPriceInvoiced?: number;
  previewUnitPriceWhite?: number;
  previewTotalPriceInvoiced?: number;
  previewTotalPriceWhite?: number;
}

export interface QuoteItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceType: 'INVOICED' | 'WHITE';
  vatRate?: number;
}
