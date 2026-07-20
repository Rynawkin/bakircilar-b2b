/**
 * Customer API
 */

import apiClient from './client';
import {
  Product,
  Category,
  Cart,
  AddToCartRequest,
  Order,
  OrderRequest,
  Quote,
  Task,
  TaskDetail,
  TaskView,
  TaskComment,
  TaskAttachment,
  Notification,
  NotificationPreference,
  EInvoiceDocument,
  PaymentAmountType,
  PaymentAttempt,
  PaymentSummary,
} from '@/types';

export type BannerPosition = 'HERO' | 'STRIP' | 'SIDE' | 'GRID' | 'CATALOG';

export interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null; // dar (mobil) ekran icin ayri gorsel; bos ise imageUrl kullanilir
  linkUrl?: string | null;
  productCode?: string | null;
  buttonText?: string | null;
  position: BannerPosition;
  sortOrder?: number;
  active?: boolean;
}

export interface CustomerFinancials {
  totalBalance: number;
  pastDueBalance: number;
  pastDueDate?: string | null;
  notDueBalance: number;
  notDueDate?: string | null;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
  /** Rapor bakiyesine henuz yansimamis basarili online odemeler (gosterimden dusuldu). */
  onlinePaymentDeduction?: number;
}

export interface CustomerListPagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GiftCampaignGift {
  id: string;
  productId: string;
  name: string;
  mikroCode?: string;
  imageUrl?: string | null;
  unit?: string | null;
  value?: number; // birim basi normal deger
  giftQuantity?: number; // bu urunden kac adet hediye edilir
  normalPrice?: number; // birim deger x giftQuantity (ustu cizili gosterilecek toplam)
}

export interface GiftCampaignActive {
  active: boolean;
  id?: string;
  title?: string;
  subtitle?: string | null;
  bannerImageUrl?: string | null;
  mobileBannerImageUrl?: string | null;
  buttonText?: string | null;
  threshold?: number;
  thresholdPriceType?: 'invoiced' | 'white';
  thresholdVatIncluded?: boolean;
  qualifyingScope?: { type: string; categoryIds: string[]; productIds: string[] };
  qualifyingTotal?: number;
  qualified?: boolean;
  remaining?: number;
  giftPickCount?: number;
  gifts?: GiftCampaignGift[];
  selectedGiftProductIds?: string[];
  validFrom?: string | null;
  validTo?: string | null;
  target?: { type: string };
}

export interface CollectionCard {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  href: string;
  sourceType: 'RULE' | 'MANUAL';
}

export interface CollectionDetail {
  collection: {
    id: string;
    title: string;
    subtitle?: string | null;
    imageUrl?: string | null;
    color?: string | null;
    sourceType: 'RULE' | 'MANUAL';
  };
  products: Product[];
  total?: number;
  hasMore?: boolean;
}

export type CustomerCatalogSort =
  | 'bestsellerValue'
  | 'lastPurchasedDesc'
  | 'lastPurchasedAsc'
  | 'nameAsc'
  | 'nameDesc'
  | 'priceAsc'
  | 'priceDesc'
  | 'stockAsc'
  | 'stockDesc'
  | 'discountDesc';

export type CustomerCatalogFilters = {
  sort?: CustomerCatalogSort;
  minPrice?: number;
  maxPrice?: number;
  minStock?: number;
  maxStock?: number;
  priceType?: 'invoiced' | 'white';
  stockStatus?: 'all' | 'in' | 'supply';
  onlyDiscount?: boolean;
  onlyAgreement?: boolean;
};

export const customerApi = {
  // Banners (musteri - yalniz aktif)
  getBanners: async (position?: BannerPosition): Promise<{ banners: Banner[]; heroIntervalMs?: number }> => {
    const response = await apiClient.get('/banners', {
      params: position ? { position } : undefined,
    });
    return response.data;
  },

  // Cari bakiye + vadesi gecen ozeti (kayit yoksa financials: null)
  getFinancials: async (): Promise<{ financials: CustomerFinancials | null }> => {
    const response = await apiClient.get('/financials');
    return response.data;
  },

  // Products
  getProducts: async (params?: CustomerCatalogFilters & {
    categoryId?: string;
    categoryIds?: string[];
    brands?: string;
    search?: string;
    documentNo?: string;
    warehouse?: string;
    mode?: 'all' | 'discounted' | 'excess' | 'purchased' | 'agreements';
    featured?: boolean;
    limit?: number;
    offset?: number;
  }, options?: { signal?: AbortSignal }): Promise<{ products: Product[]; total?: number; hasMore?: boolean }> => {
    const response = await apiClient.get('/products', {
      params: {
        ...params,
        categoryIds: params?.categoryIds?.length ? params.categoryIds.join(',') : undefined,
      },
      signal: options?.signal,
    });
    return response.data;
  },

  // 0-sonuc arama kurtarma: tipo/es-anlam fuzzy oneri (trigram). SearchMiss da kaydeder.
  searchFallback: async (
    q: string,
    categoryId?: string
  ): Promise<{
    term: string;
    suggestions: Array<{
      id: string;
      name: string;
      mikroCode: string;
      imageUrl: string | null;
      categoryId: string | null;
      categoryName: string | null;
    }>;
  }> => {
    const response = await apiClient.get('/products/search-fallback', {
      params: { q, categoryId: categoryId || undefined },
    });
    return response.data;
  },

  getProductById: async (id: string, mode?: 'discounted' | 'excess'): Promise<Product> => {
    const response = await apiClient.get(`/products/${id}`, {
      params: mode ? { mode } : undefined,
    });
    return response.data;
  },
  getProductRecommendations: async (id: string): Promise<{ products: Product[] }> => {
    const response = await apiClient.get(`/products/${id}/recommendations`);
    return response.data;
  },

  // Esdeger urunler: ayni stok ailesindeki, stokta olan alternatifler
  getProductAlternatives: async (id: string): Promise<{ products: Product[] }> => {
    const response = await apiClient.get(`/products/${id}/alternatives`);
    return response.data;
  },

  // Stok alarmi: "stoga gelince haber ver"
  getStockAlert: async (id: string): Promise<{ active: boolean }> => {
    const response = await apiClient.get(`/products/${id}/stock-alert`);
    return response.data;
  },

  createStockAlert: async (id: string): Promise<{ active: boolean }> => {
    const response = await apiClient.post(`/products/${id}/stock-alert`);
    return response.data;
  },

  removeStockAlert: async (id: string): Promise<{ active: boolean }> => {
    const response = await apiClient.delete(`/products/${id}/stock-alert`);
    return response.data;
  },
  reportProductImageIssue: async (
    id: string,
    data?: { note?: string }
  ): Promise<{
    report: {
      id: string;
      productCode: string;
      productName: string;
      status: 'OPEN' | 'REVIEWED' | 'FIXED';
      createdAt: string;
    };
    alreadyReported: boolean;
  }> => {
    const response = await apiClient.post(`/products/${id}/report-image-issue`, data || {});
    return response.data;
  },

  getCartRecommendations: async (): Promise<{ groups: Array<{ baseProduct: { id: string; name: string; mikroCode: string }; products: Product[] }> }> => {
    const response = await apiClient.get('/recommendations/cart');
    return response.data;
  },

  getPersonalRecommendations: async (): Promise<{
    products: Product[];
    missingCategories: Array<{ category: { id: string; name: string }; products: Product[] }>;
  }> => {
    const response = await apiClient.get('/recommendations/personal');
    return response.data;
  },

  getActiveGiftCampaign: async (): Promise<GiftCampaignActive> => {
    const response = await apiClient.get('/gift-campaign/active');
    return response.data;
  },

  setGiftCartSelection: async (
    campaignId: string | null,
    productIds: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await apiClient.put('/gift-campaign/cart-selection', { campaignId, productIds });
    return response.data;
  },

  // Koleksiyonlar ("Sizin icin koleksiyonlar")
  getActiveCollections: async (): Promise<{ collections: CollectionCard[] }> => {
    const response = await apiClient.get('/collections/active');
    return response.data;
  },

  getCollection: async (
    id: string,
    params?: Pick<CustomerCatalogFilters, 'sort' | 'priceType'> & {
      search?: string;
      limit?: number;
      offset?: number;
    },
    options?: { signal?: AbortSignal }
  ): Promise<CollectionDetail> => {
    const response = await apiClient.get(`/collections/${id}`, { params, signal: options?.signal });
    return response.data;
  },

  // Categories
  getCategories: async (): Promise<{ categories: Category[] }> => {
    const response = await apiClient.get('/categories');
    return response.data;
  },

  // Musterinin hic alisveris yapmadigi ("henuz denemedigi") kategoriler
  getUnboughtCategories: async (): Promise<{
    categories: Array<{ id: string; name: string; mikroCode: string; imageUrl?: string | null }>;
  }> => {
    // NOT: customer route'lari /api altinda mount'lu (getCategories '/categories'),
    // dogru yol '/unbought-categories' — '/customer/...' 404 verir.
    const response = await apiClient.get('/unbought-categories');
    return response.data;
  },

  // Hic alinmayan kategorilerdeki urunler (cok-satan sirali) + sol ray icin denenmemis kategori listesi.
  // NOT: customer route'lari /api altinda mount'lu -> dogru yol '/unbought-category-products'.
  getUnboughtCategoryProducts: async (params?: CustomerCatalogFilters & {
    categoryId?: string;
    search?: string;
    warehouse?: string;
    offset?: number;
    limit?: number;
  }, options?: { signal?: AbortSignal }): Promise<{
    products: Product[];
    totalCount: number;
    total?: number;
    hasMore?: boolean;
    categories: Array<{ id: string; name: string; mikroCode?: string; imageUrl?: string; count?: number }>;
  }> => {
    const response = await apiClient.get('/unbought-category-products', { params, signal: options?.signal });
    return response.data;
  },

  // Marka filtre rayi icin: gorunur urunlerden distinct marka + sayac (opsiyonel categoryId/search baglami).
  getBrandFacets: async (params?: {
    categoryId?: string;
    search?: string;
  }): Promise<{ brands: Array<{ code: string; name: string; count: number }> }> => {
    const response = await apiClient.get('/brand-facets', { params });
    return response.data;
  },

  // Kategori facet'leri: mevcut arama/marka/depo baglamindaki SONUCLARDA gecen (kok) kategoriler.
  // Rail tum kategorileri degil, yalnizca sonuclarda bulunan kategorileri gostersin diye.
  getCategoryFacets: async (params?: {
    search?: string;
    brands?: string;
    warehouse?: string;
  }): Promise<{ categories: Array<{ id: string; name: string; count: number }> }> => {
    const response = await apiClient.get('/category-facets', { params });
    return response.data;
  },

  // Warehouses
  getWarehouses: async (): Promise<{ warehouses: string[] }> => {
    const response = await apiClient.get('/warehouses');
    return response.data;
  },

  // Cart
  getCart: async (): Promise<Cart> => {
    const response = await apiClient.get('/cart');
    return response.data;
  },

  addToCart: async (data: AddToCartRequest): Promise<{ message: string }> => {
    const response = await apiClient.post('/cart', data);
    return response.data;
  },

  updateCartItem: async (
    itemId: string,
    // quantity BAZ (ana) birim; 2. birim satirlarinda cagiran cevirip gonderir (float olabilir)
    data: { quantity?: number; lineNote?: string | null; selectedUnit?: string | null }
  ): Promise<{ message: string }> => {
    const response = await apiClient.put(`/cart/${itemId}`, data);
    return response.data;
  },

  removeFromCart: async (itemId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/cart/${itemId}`);
    return response.data;
  },

  // Orders
  createOrder: async (data?: {
    customerOrderNumber?: string;
    deliveryLocation?: string;
  }): Promise<{ orderId: string; orderNumber: string; message: string; skippedItems?: string[] }> => {
    const response = await apiClient.post('/orders', data);
    return response.data;
  },

  getOrders: async (params?: {
    status?: Order['status'];
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ orders: Order[]; pagination?: CustomerListPagination }> => {
    const response = await apiClient.get('/orders', { params });
    return response.data;
  },

  getOrderById: async (id: string): Promise<Order> => {
    const response = await apiClient.get(`/orders/${id}`);
    return response.data;
  },

  // Order Requests
  getOrderRequestPendingCount: async (): Promise<{ count: number }> => {
    const response = await apiClient.get('/order-requests/pending-count');
    return response.data;
  },
  // Anlasmali urunler menusunu sadece aktif anlasma varsa gostermek icin
  getAgreementsAvailability: async (): Promise<{ available: boolean }> => {
    const response = await apiClient.get('/agreements/available');
    return response.data;
  },
  getOrderRequests: async (): Promise<{ requests: OrderRequest[] }> => {
    const response = await apiClient.get('/order-requests');
    return response.data;
  },

  createOrderRequest: async (note?: string): Promise<{ request: OrderRequest }> => {
    const response = await apiClient.post('/order-requests', note ? { note } : undefined);
    return response.data;
  },

  convertOrderRequest: async (
    id: string,
    data: {
      items?: Array<{ id: string; priceType?: 'INVOICED' | 'WHITE'; quantity?: number }>;
      note?: string;
      customerOrderNumber?: string;
      deliveryLocation?: string;
    }
  ): Promise<{ orderId: string; orderNumber: string }> => {
    const response = await apiClient.post(`/order-requests/${id}/convert`, data);
    return response.data;
  },

  rejectOrderRequest: async (id: string, note?: string): Promise<{ status: string }> => {
    const response = await apiClient.post(`/order-requests/${id}/reject`, note ? { note } : undefined);
    return response.data;
  },

  // Quotes
  getQuotes: async (params?: {
    status?: Quote['status'];
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ quotes: Quote[]; pagination?: CustomerListPagination }> => {
    const response = await apiClient.get('/quotes', { params });
    return response.data;
  },

  getQuoteById: async (id: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.get(`/quotes/${id}`);
    return response.data;
  },

  acceptQuote: async (id: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.post(`/quotes/${id}/accept`);
    return response.data;
  },

  rejectQuote: async (id: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.post(`/quotes/${id}/reject`);
    return response.data;
  },

  // Tasks (customer)
  getTaskPreferences: async (): Promise<{ preferences: { defaultView: TaskView; colorRules?: any[] | null } }> => {
    const response = await apiClient.get('/tasks/preferences');
    return response.data;
  },

  updateTaskPreferences: async (data: { defaultView?: TaskView; colorRules?: any[] | null }): Promise<{ preferences: { defaultView: TaskView; colorRules?: any[] | null } }> => {
    const response = await apiClient.put('/tasks/preferences', data);
    return response.data;
  },

  getTasks: async (params?: {
    status?: string | string[];
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[] }> => {
    const response = await apiClient.get('/tasks', { params });
    return response.data;
  },

  getTaskById: async (id: string): Promise<{ task: TaskDetail }> => {
    const response = await apiClient.get(`/tasks/${id}`);
    return response.data;
  },

  createTask: async (data: {
    title: string;
    description?: string | null;
    type?: string;
    priority?: string;
  }): Promise<{ task: TaskDetail }> => {
    const response = await apiClient.post('/tasks', data);
    return response.data;
  },

  addTaskComment: async (id: string, data: { body: string }): Promise<{ comment: TaskComment }> => {
    const response = await apiClient.post(`/tasks/${id}/comments`, data);
    return response.data;
  },

  addTaskAttachment: async (id: string, formData: FormData): Promise<{ attachment: TaskAttachment }> => {
    const response = await apiClient.post(`/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Notifications
  getNotifications: async (params?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<{ notifications: Notification[]; unreadCount: number }> => {
    const response = await apiClient.get('/notifications', { params });
    return response.data;
  },

  markNotificationsRead: async (ids: string[]): Promise<{ updated: number }> => {
    const response = await apiClient.post('/notifications/read', { ids });
    return response.data;
  },

  markNotificationsReadAll: async (): Promise<{ updated: number }> => {
    const response = await apiClient.post('/notifications/read-all');
    return response.data;
  },

  // Ziraat Nestpay PayByLink (kart verisi banka sayfasinda girilir)
  getPaymentSummary: async (): Promise<PaymentSummary> => {
    const response = await apiClient.get('/payments/summary');
    return response.data;
  },

  getPaymentHistory: async (limit = 25): Promise<{ payments: PaymentAttempt[] }> => {
    const response = await apiClient.get('/payments/history', { params: { limit } });
    return response.data;
  },

  createPayByLink: async (data: {
    idempotencyKey: string;
    amountType: PaymentAmountType;
    customAmount?: number;
  }): Promise<{ payment: PaymentAttempt }> => {
    const response = await apiClient.post('/payments/nestpay/create', data);
    return response.data;
  },

  getPaymentStatus: async (id: string): Promise<{ payment: PaymentAttempt }> => {
    const response = await apiClient.get(`/payments/${id}/status`);
    return response.data;
  },

  getNotificationPreferences: async (): Promise<{ categories: NotificationPreference[] }> => {
    const response = await apiClient.get('/notifications/preferences');
    return response.data;
  },

  updateNotificationPreferences: async (preferences: Array<{ category: string; enabled: boolean }>): Promise<{ categories: NotificationPreference[] }> => {
    const response = await apiClient.put('/notifications/preferences', { preferences });
    return response.data;
  },

  getWebPushPublicKey: async (): Promise<{ publicKey: string | null }> => {
    const response = await apiClient.get('/notifications/push/vapid-public-key');
    return response.data;
  },

  registerWebPushSubscription: async (subscription: PushSubscriptionJSON): Promise<{ success: boolean; type?: string }> => {
    const response = await apiClient.post('/notifications/push/register', { subscription });
    return response.data;
  },

  sendTestWebPush: async (payload?: { title?: string; body?: string; linkUrl?: string }): Promise<{ success: boolean }> => {
    const response = await apiClient.post('/notifications/push/test', payload || {});
    return response.data;
  },

  // E-Invoices (customer)
  getInvoices: async (params?: {
    search?: string;
    invoicePrefix?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    documents: EInvoiceDocument[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> => {
    const response = await apiClient.get('/invoices', { params });
    return response.data;
  },

  downloadInvoice: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/invoices/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export default customerApi;




