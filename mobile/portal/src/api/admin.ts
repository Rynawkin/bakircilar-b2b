import {
  Agreement,
  Campaign,
  CategoryWithPriceRules,
  CostUpdateAlert,
  CustomerType,
  Customer,
  CustomerContact,
  CustomerSubUser,
  DashboardStats,
  EInvoiceDocument,
  Exclusion,
  MarginComplianceRow,
  Notification,
  PriceHistoryChange,
  Product,
  Quote,
  QuoteLineItem,
  Order,
  SetPriceRuleRequest,
  Settings,
  StaffMember,
  SyncStatus,
  Task,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskLink,
  TaskTemplate,
  TaskView,
  VadeAssignment,
  VadeBalance,
  VadeClassification,
  VadeNote,
  VadeSyncLog,
} from '../types';
import { apiClient } from './client';

type SupplierPriceListOverrides = {
  excelSheetName?: string | null;
  excelHeaderRow?: number | null;
  excelCodeHeader?: string | null;
  excelNameHeader?: string | null;
  excelPriceHeader?: string | null;
  pdfPriceIndex?: number | null;
  pdfCodePattern?: string | null;
  pdfColumnRoles?: Record<string, string> | null;
};

const appendSupplierPriceListOverrides = (formData: FormData, overrides?: SupplierPriceListOverrides) => {
  if (!overrides) return;
  const appendValue = (key: string, value?: string | number | null) => {
    if (value === undefined || value === null || value === '') return;
    formData.append(key, String(value));
  };

  appendValue('excelSheetName', overrides.excelSheetName);
  appendValue('excelHeaderRow', overrides.excelHeaderRow);
  appendValue('excelCodeHeader', overrides.excelCodeHeader);
  appendValue('excelNameHeader', overrides.excelNameHeader);
  appendValue('excelPriceHeader', overrides.excelPriceHeader);
  appendValue('pdfPriceIndex', overrides.pdfPriceIndex);
  appendValue('pdfCodePattern', overrides.pdfCodePattern);
  if (overrides.pdfColumnRoles && Object.keys(overrides.pdfColumnRoles).length > 0) {
    formData.append('pdfColumnRoles', JSON.stringify(overrides.pdfColumnRoles));
  }
};

export const adminApi = {
  // Settings
  getSettings: async () => {
    const response = await apiClient.get<Settings>('/admin/settings');
    return response.data;
  },
  updateSettings: async (data: Partial<Settings>) => {
    const response = await apiClient.put('/admin/settings', data);
    return response.data as { message: string; settings: Settings };
  },

  // Dashboard
  getDashboardStats: async () => {
    const response = await apiClient.get<DashboardStats>('/admin/dashboard/stats');
    return response.data;
  },

  // Quotes
  getQuotes: async (status?: string) => {
    const response = await apiClient.get<{ quotes: Quote[] }>('/admin/quotes', {
      params: status ? { status } : undefined,
    });
    return response.data;
  },
  getQuoteById: async (id: string) => {
    const response = await apiClient.get<{ quote: Quote }>(`/admin/quotes/${id}`);
    return response.data;
  },
  createQuote: async (data: any) => {
    const response = await apiClient.post('/admin/quotes', data);
    return response.data as { quote: Quote };
  },
  updateQuote: async (id: string, data: any) => {
    const response = await apiClient.put(`/admin/quotes/${id}`, data);
    return response.data as { quote: Quote };
  },
  syncQuote: async (id: string) => {
    const response = await apiClient.post(`/admin/quotes/${id}/sync`);
    return response.data as { quote: Quote; updated: boolean };
  },
  approveQuote: async (id: string, adminNote?: string) => {
    const response = await apiClient.post(`/admin/quotes/${id}/approve`, { adminNote });
    return response.data;
  },
  rejectQuote: async (id: string, adminNote: string) => {
    const response = await apiClient.post(`/admin/quotes/${id}/reject`, { adminNote });
    return response.data;
  },
  convertQuoteToOrder: async (
    id: string,
    payload: {
      selectedItemIds: string[];
      closeReasons?: Record<string, string>;
      closeUnselected?: boolean;
      warehouseNo: number;
      invoicedSeries?: string;
      invoicedSira?: number;
      whiteSeries?: string;
      whiteSira?: number;
      itemUpdates?: Array<{ id: string; quantity?: number; responsibilityCenter?: string; reserveQty?: number }>;
      documentNo?: string;
      documentDescription?: string;
    }
  ) => {
    const response = await apiClient.post(`/admin/quotes/${id}/convert-to-order`, payload);
    return response.data as { mikroOrderIds: string[]; closedCount: number; orderId: string; orderNumber: string };
  },
  getQuoteLineItems: async (params?: {
    status?: string;
    search?: string;
    closeReason?: string;
    minDays?: number;
    maxDays?: number;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/admin/quotes/line-items', { params });
    return response.data as { items: QuoteLineItem[]; total: number };
  },
  closeQuoteLineItems: async (items: Array<{ id: string; reason: string }>) => {
    const response = await apiClient.post('/admin/quotes/line-items/close', { items });
    return response.data as { closedCount: number; mikroClosedCount: number };
  },
  reopenQuoteLineItems: async (itemIds: string[]) => {
    const response = await apiClient.post('/admin/quotes/line-items/reopen', { itemIds });
    return response.data as { reopenedCount: number; mikroReopenCount: number };
  },
  getQuotePreferences: async () => {
    const response = await apiClient.get('/admin/quotes/preferences');
    return response.data as {
      preferences: {
        lastSalesCount: number;
        whatsappTemplate: string;
        responsibleCode?: string | null;
        columnWidths?: Record<string, number> | null;
        poolSort?: string | null;
        poolPriceListNo?: number | null;
        poolColorRules?: any[] | null;
      };
    };
  },
  updateQuotePreferences: async (data: {
    lastSalesCount?: number;
    whatsappTemplate?: string;
    responsibleCode?: string | null;
    columnWidths?: Record<string, number>;
    poolSort?: string | null;
    poolPriceListNo?: number | null;
    poolColorRules?: any[] | null;
  }) => {
    const response = await apiClient.put('/admin/quotes/preferences', data);
    return response.data as {
      preferences: {
        lastSalesCount: number;
        whatsappTemplate: string;
        responsibleCode?: string | null;
        columnWidths?: Record<string, number> | null;
        poolSort?: string | null;
        poolPriceListNo?: number | null;
        poolColorRules?: any[] | null;
      };
    };
  },
  getQuoteResponsibles: async () => {
    const response = await apiClient.get('/admin/quotes/responsibles');
    return response.data as { responsibles: Array<{ code: string; name: string; surname: string }> };
  },
  getCustomerPurchasedProducts: async (customerId: string, limit?: number) => {
    const response = await apiClient.get(`/admin/quotes/customer/${customerId}/purchased-products`, {
      params: limit ? { limit } : undefined,
    });
    return response.data as { customer: any; products: any[] };
  },
  getUsdSellingRate: async () => {
    const response = await apiClient.get('/admin/exchange/usd');
    return response.data as { currency: string; rate: number; fetchedAt: string; source: string };
  },

  // Orders
  getOrders: async () => {
    const response = await apiClient.get<{ orders: any[] }>('/admin/orders');
    return response.data;
  },
  getOrderById: async (id: string) => {
    const response = await apiClient.get<{ order: Order }>(`/admin/orders/${id}`);
    return response.data;
  },
  getPendingOrders: async () => {
    const response = await apiClient.get<{ orders: any[] }>('/admin/orders/pending');
    return response.data;
  },
  createManualOrder: async (payload: {
    customerId: string;
    items: Array<{
      productId?: string;
      productCode?: string;
      productName?: string;
      quantity: number;
      unitPrice: number;
      priceType?: 'INVOICED' | 'WHITE';
      vatZeroed?: boolean;
      manualVatRate?: number;
      lineDescription?: string;
      responsibilityCenter?: string;
      reserveQty?: number;
    }>;
    warehouseNo: number;
    description?: string;
    documentDescription?: string;
    documentNo?: string;
    invoicedSeries?: string;
    invoicedSira?: number;
    whiteSeries?: string;
    whiteSira?: number;
  }) => {
    const response = await apiClient.post('/admin/orders/manual', payload);
    return response.data as { message: string; mikroOrderIds: string[]; orderId: string; orderNumber: string };
  },
  approveOrder: async (id: string, adminNote?: string) => {
    const response = await apiClient.post(`/admin/orders/${id}/approve`, { adminNote });
    return response.data;
  },
  rejectOrder: async (id: string, adminNote: string) => {
    const response = await apiClient.post(`/admin/orders/${id}/reject`, { adminNote });
    return response.data;
  },
  approveOrderItems: async (id: string, data: { itemIds: string[]; adminNote?: string }) => {
    const response = await apiClient.post(`/admin/orders/${id}/approve-items`, data);
    return response.data as { message: string; mikroOrderIds: string[]; approvedCount: number };
  },
  rejectOrderItems: async (id: string, data: { itemIds: string[]; rejectionReason: string }) => {
    const response = await apiClient.post(`/admin/orders/${id}/reject-items`, data);
    return response.data as { message: string; rejectedCount: number };
  },

  // Order tracking
  getOrderTrackingSettings: async () => {
    const response = await apiClient.get('/admin/order-tracking/settings');
    return response.data as any;
  },
  updateOrderTrackingSettings: async (data: any) => {
    const response = await apiClient.put('/admin/order-tracking/settings', data);
    return response.data as any;
  },
  syncOrderTracking: async () => {
    const response = await apiClient.post('/admin/order-tracking/sync');
    return response.data as any;
  },
  sendOrderTrackingEmails: async () => {
    const response = await apiClient.post('/admin/order-tracking/send-emails');
    return response.data as any;
  },
  syncAndSendOrderTracking: async () => {
    const response = await apiClient.post('/admin/order-tracking/sync-and-send');
    return response.data as any;
  },
  getOrderTrackingPendingOrders: async () => {
    const response = await apiClient.get('/admin/order-tracking/pending-orders');
    return response.data as any[];
  },
  getOrderTrackingSummary: async () => {
    const response = await apiClient.get('/admin/order-tracking/summary');
    return response.data as any[];
  },
  getOrderTrackingSupplierSummary: async () => {
    const response = await apiClient.get('/admin/order-tracking/supplier-summary');
    return response.data as any[];
  },
  getOrderTrackingEmailLogs: async () => {
    const response = await apiClient.get('/admin/order-tracking/email-logs');
    return response.data as any[];
  },
  sendOrderTrackingEmailToCustomer: async (customerCode: string, emailOverride?: string) => {
    const response = await apiClient.post(`/admin/order-tracking/send-email/${customerCode}`, {
      emailOverride,
    });
    return response.data as any;
  },
  sendOrderTrackingTestEmail: async (email: string) => {
    const response = await apiClient.post('/admin/order-tracking/test-email', { email });
    return response.data as any;
  },
  sendOrderTrackingCustomerEmails: async () => {
    const response = await apiClient.post('/admin/order-tracking/send-customer-emails');
    return response.data as any;
  },
  sendOrderTrackingSupplierEmails: async () => {
    const response = await apiClient.post('/admin/order-tracking/send-supplier-emails');
    return response.data as any;
  },

  // Tasks
  getTaskPreferences: async () => {
    const response = await apiClient.get('/admin/tasks/preferences');
    return response.data as { preferences: { defaultView: TaskView; colorRules?: any[] | null } };
  },
  updateTaskPreferences: async (data: { defaultView?: TaskView; colorRules?: any[] | null }) => {
    const response = await apiClient.put('/admin/tasks/preferences', data);
    return response.data as { preferences: { defaultView: TaskView; colorRules?: any[] | null } };
  },
  getTaskAssignees: async () => {
    const response = await apiClient.get('/admin/tasks/assignees');
    return response.data as { assignees: Array<{ id: string; name: string; email?: string; role?: string }> };
  },
  getTasks: async (params?: {
    status?: string | string[];
    type?: string;
    priority?: string;
    assignedToId?: string;
    createdById?: string;
    customerId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get<{ tasks: Task[] }>('/admin/tasks', { params });
    return response.data;
  },
  getTaskById: async (id: string) => {
    const response = await apiClient.get<{ task: TaskDetail }>(`/admin/tasks/${id}`);
    return response.data;
  },
  createTask: async (data: {
    title?: string;
    description?: string | null;
    type?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    assignedToId?: string | null;
    customerId?: string | null;
    templateId?: string | null;
    links?: Array<{
      type: string;
      label?: string;
      referenceId?: string;
      referenceCode?: string;
      referenceUrl?: string;
    }>;
  }) => {
    const response = await apiClient.post('/admin/tasks', data);
    return response.data as { task: TaskDetail };
  },
  updateTask: async (id: string, data: {
    title?: string;
    description?: string | null;
    type?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    assignedToId?: string | null;
    customerId?: string | null;
  }) => {
    const response = await apiClient.put(`/admin/tasks/${id}`, data);
    return response.data as { task: TaskDetail };
  },
  addTaskComment: async (id: string, data: { body: string; visibility?: string }) => {
    const response = await apiClient.post(`/admin/tasks/${id}/comments`, data);
    return response.data as { comment: TaskComment };
  },
  addTaskAttachment: async (id: string, formData: FormData) => {
    const response = await apiClient.post(`/admin/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { attachment: TaskAttachment };
  },
  addTaskLink: async (id: string, data: {
    type: string;
    label?: string;
    referenceId?: string;
    referenceCode?: string;
    referenceUrl?: string;
  }) => {
    const response = await apiClient.post(`/admin/tasks/${id}/links`, data);
    return response.data as { link: TaskLink };
  },
  deleteTaskLink: async (id: string, linkId: string) => {
    const response = await apiClient.delete(`/admin/tasks/${id}/links/${linkId}`);
    return response.data as { success: boolean };
  },
  getTaskTemplates: async (activeOnly = true) => {
    const response = await apiClient.get('/admin/tasks/templates', {
      params: { activeOnly },
    });
    return response.data as { templates: TaskTemplate[] };
  },
  createTaskTemplate: async (data: {
    title: string;
    description?: string | null;
    type: string;
    priority?: string;
    defaultStatus?: string;
    isActive?: boolean;
  }) => {
    const response = await apiClient.post('/admin/tasks/templates', data);
    return response.data as { template: TaskTemplate };
  },
  updateTaskTemplate: async (id: string, data: {
    title?: string;
    description?: string | null;
    type?: string;
    priority?: string;
    defaultStatus?: string;
    isActive?: boolean;
  }) => {
    const response = await apiClient.put(`/admin/tasks/templates/${id}`, data);
    return response.data as { template: TaskTemplate };
  },

  // Customers
  getCustomers: async () => {
    const response = await apiClient.get<{ customers: Customer[] }>('/admin/customers');
    return response.data;
  },
  createCustomer: async (data: {
    email: string;
    password: string;
    name: string;
    customerType: CustomerType;
    mikroCariCode: string;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
    priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  }) => {
    const response = await apiClient.post('/admin/customers', data);
    return response.data as { message: string; customer: Customer };
  },
  updateCustomer: async (id: string, data: {
    email?: string;
    customerType?: string;
    active?: boolean;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
    priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  }) => {
    const response = await apiClient.put(`/admin/customers/${id}`, data);
    return response.data as { message: string; customer: Customer };
  },
  getCustomerContacts: async (customerId: string) => {
    const response = await apiClient.get(`/admin/customers/${customerId}/contacts`);
    return response.data as { contacts: CustomerContact[] };
  },
  createCustomerContact: async (customerId: string, data: { name: string; phone?: string; email?: string }) => {
    const response = await apiClient.post(`/admin/customers/${customerId}/contacts`, data);
    return response.data as { contact: CustomerContact };
  },
  updateCustomerContact: async (customerId: string, contactId: string, data: { name?: string; phone?: string; email?: string }) => {
    const response = await apiClient.put(`/admin/customers/${customerId}/contacts/${contactId}`, data);
    return response.data as { contact: CustomerContact };
  },
  deleteCustomerContact: async (customerId: string, contactId: string) => {
    const response = await apiClient.delete(`/admin/customers/${customerId}/contacts/${contactId}`);
    return response.data as { message: string };
  },
  getCustomerSubUsers: async (customerId: string) => {
    const response = await apiClient.get(`/admin/customers/${customerId}/sub-users`);
    return response.data as { subUsers: CustomerSubUser[] };
  },
  createCustomerSubUser: async (
    customerId: string,
    data: { name: string; email?: string; password?: string; active?: boolean; autoCredentials?: boolean }
  ) => {
    const response = await apiClient.post(`/admin/customers/${customerId}/sub-users`, data);
    return response.data as { subUser: CustomerSubUser; credentials?: { username: string; password: string } | null };
  },
  updateCustomerSubUser: async (
    subUserId: string,
    data: { name?: string; email?: string; password?: string; active?: boolean }
  ) => {
    const response = await apiClient.put(`/admin/customers/sub-users/${subUserId}`, data);
    return response.data as { subUser: CustomerSubUser };
  },

  // Agreements
  getAgreements: async (customerId: string, search?: string) => {
    const response = await apiClient.get('/admin/agreements', { params: { customerId, search } });
    return response.data as { agreements: Agreement[] };
  },
  upsertAgreement: async (data: {
    customerId: string;
    productId: string;
    priceInvoiced: number;
    priceWhite: number;
    minQuantity?: number;
    validFrom?: string;
    validTo?: string | null;
  }) => {
    const response = await apiClient.post('/admin/agreements', data);
    return response.data as { agreement: Agreement };
  },
  deleteAgreement: async (agreementId: string) => {
    const response = await apiClient.delete(`/admin/agreements/${agreementId}`);
    return response.data as { message: string };
  },
  importAgreements: async (data: { customerId: string; rows: Array<{ mikroCode: string; priceInvoiced: number; priceWhite: number; minQuantity?: number; validFrom?: string | null; validTo?: string | null; }> }) => {
    const response = await apiClient.post('/admin/agreements/import', data);
    return response.data as { imported: number; failed: number; results: Array<{ mikroCode: string; status: string; reason?: string }> };
  },

  // Products
  getProducts: async (params?: { search?: string; page?: number; limit?: number; hasStock?: boolean }) => {
    const response = await apiClient.get<{ products: Product[]; pagination: any; stats: any }>('/admin/products', { params });
    return response.data;
  },
  triggerSelectedImageSync: async (productIds: string[]) => {
    const response = await apiClient.post('/admin/products/image-sync', { productIds });
    return response.data as { message: string; syncLogId: string };
  },
  getProductComplements: async (productId: string) => {
    const response = await apiClient.get(`/admin/products/${productId}/complements`);
    return response.data as {
      mode: 'AUTO' | 'MANUAL';
      limit: number;
      complementGroupCode?: string | null;
      auto: Array<{
        productId: string;
        productCode: string;
        productName: string;
        imageUrl?: string | null;
        pairCount: number;
        rank: number;
      }>;
      manual: Array<{
        productId: string;
        productCode: string;
        productName: string;
        imageUrl?: string | null;
        sortOrder: number;
      }>;
    };
  },
  updateProductComplements: async (
    productId: string,
    data: {
      manualProductIds: string[];
      mode?: 'AUTO' | 'MANUAL';
      complementGroupCode?: string | null;
    }
  ) => {
    const response = await apiClient.put(`/admin/products/${productId}/complements`, data);
    return response.data as { mode: 'AUTO' | 'MANUAL'; manual: string[] };
  },
  syncProductComplements: async (params?: { months?: number; limit?: number }) => {
    const response = await apiClient.post('/admin/product-complements/sync', params || {});
    return response.data as { success: boolean; result: any };
  },
  getProductsByCodes: async (codes: string[]) => {
    const response = await apiClient.post('/admin/products/by-codes', { codes });
    return response.data as { products: any[]; total: number };
  },
  getComplementRecommendations: async (params: {
    productCodes: string[];
    excludeCodes?: string[];
    limit?: number;
  }) => {
    const response = await apiClient.post('/admin/recommendations/complements', params);
    return response.data as { success: boolean; products: any[]; total: number };
  },
  uploadProductImage: async (productId: string, formData: FormData) => {
    const response = await apiClient.post(`/admin/products/${productId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { success: boolean; imageUrl: string; message: string };
  },
  deleteProductImage: async (productId: string) => {
    const response = await apiClient.delete(`/admin/products/${productId}/image`);
    return response.data as { success: boolean; message: string };
  },

  // Categories & Pricing
  getCategories: async () => {
    const response = await apiClient.get('/admin/categories');
    return response.data as { categories: CategoryWithPriceRules[] };
  },
  setCategoryPriceRule: async (data: SetPriceRuleRequest) => {
    const response = await apiClient.post('/admin/categories/price-rule', data);
    return response.data as { message: string };
  },
  setBulkCategoryPriceRules: async (rules: Array<{ categoryId: string; customerType: string; profitMargin: number }>) => {
    const response = await apiClient.post('/admin/categories/bulk-price-rules', { rules });
    return response.data as { message: string; updatedRules: number; totalRules: number; affectedCategories: number; pricesUpdated: number; errors: string[] };
  },
  setProductPriceOverride: async (data: { productId: string; customerType: string; profitMargin: number }) => {
    const response = await apiClient.post('/admin/products/price-override', data);
    return response.data as { message: string };
  },

  // Campaigns
  getCampaigns: async () => {
    const response = await apiClient.get<Campaign[]>('/campaigns');
    return response.data;
  },
  createCampaign: async (data: Partial<Campaign>) => {
    const response = await apiClient.post('/campaigns', data);
    return response.data as Campaign;
  },
  updateCampaign: async (id: string, data: Partial<Campaign>) => {
    const response = await apiClient.put(`/campaigns/${id}`, data);
    return response.data as Campaign;
  },
  deleteCampaign: async (id: string) => {
    const response = await apiClient.delete(`/campaigns/${id}`);
    return response.data as { success: boolean };
  },

  // Exclusions
  getExclusions: async (activeOnly?: boolean) => {
    const response = await apiClient.get('/admin/exclusions', {
      params: activeOnly !== undefined ? { activeOnly } : undefined,
    });
    return response.data as { success: boolean; data: Exclusion[] };
  },
  createExclusion: async (data: { type: Exclusion['type']; value: string; description?: string }) => {
    const response = await apiClient.post('/admin/exclusions', data);
    return response.data as { success: boolean; data: Exclusion; message: string };
  },
  updateExclusion: async (id: string, data: { value?: string; description?: string; active?: boolean }) => {
    const response = await apiClient.put(`/admin/exclusions/${id}`, data);
    return response.data as { success: boolean; data: Exclusion; message: string };
  },
  deleteExclusion: async (id: string) => {
    const response = await apiClient.delete(`/admin/exclusions/${id}`);
    return response.data as { success: boolean; message: string };
  },

  // Staff
  getSectorCodes: async () => {
    const response = await apiClient.get('/admin/sector-codes');
    return response.data as { sectorCodes: string[] };
  },
  getStaffMembers: async () => {
    const response = await apiClient.get('/admin/staff');
    return response.data as { staff: StaffMember[] };
  },
  createStaffMember: async (data: { email: string; password: string; name: string; role: 'SALES_REP' | 'MANAGER'; assignedSectorCodes?: string[] }) => {
    const response = await apiClient.post('/admin/staff', data);
    return response.data as { message: string; staff: StaffMember };
  },
  updateStaffMember: async (id: string, data: { email?: string; name?: string; active?: boolean; assignedSectorCodes?: string[] }) => {
    const response = await apiClient.put(`/admin/staff/${id}`, data);
    return response.data as { message: string; staff: StaffMember };
  },

  // Role permissions
  getAllRolePermissions: async () => {
    const response = await apiClient.get('/role-permissions/all');
    return response.data as { permissions: Record<string, Record<string, boolean>>; availablePermissions: Record<string, string>; permissionDescriptions: Record<string, string> };
  },
  setRolePermission: async (role: string, permission: string, enabled: boolean) => {
    const response = await apiClient.put(`/role-permissions/${role}/${permission}`, { enabled });
    return response.data as { message: string };
  },
  resetRolePermissions: async (role: string) => {
    const response = await apiClient.post(`/role-permissions/${role}/reset`);
    return response.data as { message: string; count: number };
  },
  getMyPermissions: async () => {
    const response = await apiClient.get('/role-permissions/my-permissions');
    return response.data as { role: string; permissions: Record<string, boolean> };
  },

  // Notifications
  getNotifications: async (params?: { unreadOnly?: boolean; limit?: number; offset?: number }) => {
    const response = await apiClient.get('/admin/notifications', { params });
    return response.data as { notifications: Notification[]; unreadCount: number };
  },
  markNotificationsRead: async (ids: string[]) => {
    const response = await apiClient.post('/admin/notifications/read', { ids });
    return response.data as { updated: number };
  },
  markAllNotificationsRead: async () => {
    const response = await apiClient.post('/admin/notifications/read-all');
    return response.data as { updated: number };
  },
  registerPushToken: async (data: { token: string; platform?: string; appName?: string; deviceName?: string }) => {
    const response = await apiClient.post('/admin/notifications/push/register', data);
    return response.data as { success: boolean };
  },
  unregisterPushToken: async (token: string) => {
    const response = await apiClient.post('/admin/notifications/push/unregister', { token });
    return response.data as { success: boolean };
  },

  // Search
  searchStocks: async (params: { searchTerm?: string; limit?: number; offset?: number }) => {
    const response = await apiClient.get('/search/stocks', { params });
    return response.data as { success: boolean; data: any[]; total: number };
  },
  getStocksByCodes: async (codes: string[]) => {
    const response = await apiClient.post('/search/stocks/by-codes', { codes });
    return response.data as { success: boolean; data: any[]; total: number };
  },
  getStockColumns: async () => {
    const response = await apiClient.get('/search/stocks/columns');
    return response.data as { columns: string[] };
  },
  getStockUnits: async () => {
    const response = await apiClient.get('/search/stocks/units');
    return response.data as { units: string[] };
  },
  searchCustomers: async (params: { searchTerm?: string; limit?: number; offset?: number }) => {
    const response = await apiClient.get('/search/customers', { params });
    return response.data as { success: boolean; data: any[]; total: number };
  },
  getCustomerColumns: async () => {
    const response = await apiClient.get('/search/customers/columns');
    return response.data as { columns: string[] };
  },
  getSearchPreferences: async () => {
    const response = await apiClient.get('/search/preferences');
    return response.data as { preferences: { id: string; userId: string; stockColumns: string[]; customerColumns: string[]; createdAt: string; updatedAt: string } };
  },
  updateSearchPreferences: async (data: { stockColumns?: string[]; customerColumns?: string[] }) => {
    const response = await apiClient.put('/search/preferences', data);
    return response.data as { success: boolean; preferences: any };
  },

  // Cari hareket / Ekstre
  searchCariForEkstre: async (params: { searchTerm: string; limit?: number }) => {
    const response = await apiClient.get('/cari-hareket/search', { params });
    return response.data as { data: any[]; total: number };
  },
  getCariHareketFoyu: async (params: { cariKod: string; startDate?: string; endDate?: string }) => {
    const response = await apiClient.get('/cari-hareket/foyu', { params });
    return response.data as { data: any[]; opening?: { borc?: number; alacak?: number; bakiye?: number } };
  },
  getCariInfo: async (cariKod: string) => {
    const response = await apiClient.get(`/cari-hareket/info/${cariKod}`);
    return response.data as { data: any };
  },

  // Vade tracking
  getVadeBalances: async (params?: { search?: string; overdueOnly?: boolean; upcomingOnly?: boolean; sectorCode?: string; groupCode?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/vade/balances', { params });
    return response.data as { balances: VadeBalance[]; pagination: any; summary: { overdue: number; upcoming: number; total: number } };
  },
  getVadeFilters: async () => {
    const response = await apiClient.get('/admin/vade/filters');
    return response.data as { sectorCodes: string[]; groupCodes: string[] };
  },
  getVadeCustomer: async (customerId: string) => {
    const response = await apiClient.get(`/admin/vade/customers/${customerId}`);
    return response.data as { customer: any; notes: VadeNote[]; assignments: VadeAssignment[] };
  },
  getVadeNotes: async (params?: { customerId?: string; authorId?: string; tag?: string; startDate?: string; endDate?: string; reminderOnly?: boolean; reminderCompleted?: boolean; reminderFrom?: string; reminderTo?: string }) => {
    const response = await apiClient.get('/admin/vade/notes', { params });
    return response.data as { notes: VadeNote[] };
  },
  createVadeNote: async (data: { customerId: string; noteContent: string; promiseDate?: string | null; tags?: string[]; reminderDate?: string | null; reminderNote?: string | null; reminderCompleted?: boolean; balanceAtTime?: number | null }) => {
    const response = await apiClient.post('/admin/vade/notes', data);
    return response.data as { note: VadeNote };
  },
  updateVadeNote: async (noteId: string, data: { noteContent?: string; promiseDate?: string | null; tags?: string[]; reminderDate?: string | null; reminderNote?: string | null; reminderCompleted?: boolean; reminderSentAt?: string | null; balanceAtTime?: number | null }) => {
    const response = await apiClient.put(`/admin/vade/notes/${noteId}`, data);
    return response.data as { note: VadeNote };
  },
  upsertVadeClassification: async (data: { customerId: string; classification: string; customClassification?: string | null; riskScore?: number | null }) => {
    const response = await apiClient.post('/admin/vade/classification', data);
    return response.data as { classification: VadeClassification };
  },
  getVadeAssignments: async (params?: { staffId?: string; customerId?: string }) => {
    const response = await apiClient.get('/admin/vade/assignments', { params });
    return response.data as { assignments: VadeAssignment[] };
  },
  assignVadeCustomers: async (data: { staffId: string; customerIds: string[] }) => {
    const response = await apiClient.post('/admin/vade/assignments', data);
    return response.data as { created: number };
  },
  removeVadeAssignment: async (data: { staffId: string; customerId: string }) => {
    const response = await apiClient.delete('/admin/vade/assignments', { data });
    return response.data as { success: boolean };
  },
  importVadeBalances: async (rows: Array<{ mikroCariCode: string; pastDueBalance?: number; pastDueDate?: string | null; notDueBalance?: number; notDueDate?: string | null; totalBalance?: number; valor?: number; paymentTermLabel?: string | null; referenceDate?: string | null }>) => {
    const response = await apiClient.post('/admin/vade/import', { rows });
    return response.data as { imported: number; skipped: number };
  },
  triggerVadeSync: async () => {
    const response = await apiClient.post('/admin/vade/sync');
    return response.data as { success: boolean; syncLogId: string; error?: string };
  },
  getVadeSyncStatus: async (syncLogId: string) => {
    const response = await apiClient.get(`/admin/vade/sync/status/${syncLogId}`);
    return response.data as { log: VadeSyncLog };
  },

  // E-invoices
  getEInvoices: async (params?: { search?: string; invoicePrefix?: string; customerId?: string; customerCode?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/einvoices', { params });
    return response.data as { documents: EInvoiceDocument[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
  },
  uploadEInvoices: async (formData: FormData) => {
    const response = await apiClient.post('/admin/einvoices/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { uploaded: number; updated: number; failed: number; results: Array<{ invoiceNo: string; documentId?: string; status: string; message?: string }> };
  },
  downloadEInvoice: async (id: string) => {
    const response = await apiClient.get(`/admin/einvoices/${id}/download`, { responseType: 'blob' });
    return response.data as Blob;
  },

  // Reports
  getCostUpdateAlerts: async (params?: { dayDiff?: number; percentDiff?: number; category?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/reports/cost-update-alerts', { params });
    return response.data as { success: boolean; data: { products: CostUpdateAlert[]; summary: any; pagination: any; metadata: any } };
  },
  getMarginComplianceReport: async (params?: Record<string, any>) => {
    const response = await apiClient.get('/admin/reports/margin-compliance', { params });
    return response.data as { success: boolean; data: { data: MarginComplianceRow[]; summary: any; pagination: any; metadata: any } };
  },
  getPriceHistory: async (params?: Record<string, any>) => {
    const response = await apiClient.get('/admin/reports/price-history', { params });
    return response.data as { success: boolean; data: { changes: PriceHistoryChange[]; summary: any; pagination: any } };
  },
  getTopProducts: async (params?: { startDate?: string; endDate?: string; brand?: string; category?: string; minQuantity?: number; sortBy?: 'revenue' | 'profit' | 'margin' | 'quantity'; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/reports/top-products', { params });
    return response.data as { success: boolean; data: { products: any[]; summary: any; pagination: any } };
  },
  getTopCustomers: async (params?: { startDate?: string; endDate?: string; sector?: string; minOrderAmount?: number; sortBy?: 'revenue' | 'profit' | 'margin' | 'orderCount'; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/reports/top-customers', { params });
    return response.data as { success: boolean; data: { customers: any[]; summary: any; pagination: any } };
  },
  getProductCustomers: async (params: { productCode: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const { productCode, ...rest } = params;
    const response = await apiClient.get(`/admin/reports/product-customers/${productCode}`, { params: rest });
    return response.data as { success: boolean; data: { customers: any[]; summary: any; pagination: any } };
  },
  getPriceHistoryNew: async (params?: Record<string, any>) => {
    const response = await apiClient.get('/admin/reports/price-history-new', { params });
    return response.data as { success: boolean; data: any };
  },
  getProductPriceDetail: async (productCode: string) => {
    const response = await apiClient.get(`/admin/reports/product-price-detail/${productCode}`);
    return response.data as { success: boolean; data: any };
  },
  getPriceSummaryStats: async () => {
    const response = await apiClient.get('/admin/reports/price-summary-stats');
    return response.data as { success: boolean; data: any };
  },
  getComplementMissingReport: async (params: {
    mode: 'product' | 'customer';
    matchMode?: 'product' | 'category' | 'group';
    productCode?: string;
    customerCode?: string;
    sectorCode?: string;
    salesRepId?: string;
    periodMonths?: number;
    page?: number;
    limit?: number;
    minDocumentCount?: number;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('mode', params.mode);
    if (params.matchMode) queryParams.append('matchMode', params.matchMode);
    if (params.productCode) queryParams.append('productCode', params.productCode);
    if (params.customerCode) queryParams.append('customerCode', params.customerCode);
    if (params.sectorCode) queryParams.append('sectorCode', params.sectorCode);
    if (params.salesRepId) queryParams.append('salesRepId', params.salesRepId);
    if (params.periodMonths) queryParams.append('periodMonths', params.periodMonths.toString());
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.minDocumentCount) queryParams.append('minDocumentCount', params.minDocumentCount.toString());
    const response = await apiClient.get(`/admin/reports/complement-missing?${queryParams.toString()}`);
    return response.data as { success: boolean; data: any };
  },
  getCustomerActivityReport: async (params: {
    startDate?: string;
    endDate?: string;
    customerCode?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.customerCode) queryParams.append('customerCode', params.customerCode);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/reports/customer-activity?${queryParams.toString()}`);
    return response.data as { success: boolean; data: any };
  },
  getCustomerCartsReport: async (params: {
    search?: string;
    includeEmpty?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append('search', params.search);
    if (params.includeEmpty) queryParams.append('includeEmpty', '1');
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/reports/customer-carts?${queryParams.toString()}`);
    return response.data as { success: boolean; data: any };
  },
  getSupplierPriceListSuppliers: async () => {
    const response = await apiClient.get('/admin/supplier-price-lists/suppliers');
    return response.data as { suppliers: any[] };
  },
  createSupplierPriceListSupplier: async (data: {
    name: string;
    active?: boolean;
    discount1?: number | null;
    discount2?: number | null;
    discount3?: number | null;
    discount4?: number | null;
    discount5?: number | null;
    priceIsNet?: boolean;
    priceIncludesVat?: boolean;
    priceByColor?: boolean;
    defaultVatRate?: number | null;
    excelSheetName?: string | null;
    excelHeaderRow?: number | null;
    excelCodeHeader?: string | null;
    excelNameHeader?: string | null;
    excelPriceHeader?: string | null;
    pdfPriceIndex?: number | null;
    pdfCodePattern?: string | null;
    discountRules?: Array<{ keywords: string[]; discounts: number[] }>;
  }) => {
    const response = await apiClient.post('/admin/supplier-price-lists/suppliers', data);
    return response.data as { supplier: any };
  },
  updateSupplierPriceListSupplier: async (id: string, data: {
    name?: string;
    active?: boolean;
    discount1?: number | null;
    discount2?: number | null;
    discount3?: number | null;
    discount4?: number | null;
    discount5?: number | null;
    priceIsNet?: boolean;
    priceIncludesVat?: boolean;
    priceByColor?: boolean;
    defaultVatRate?: number | null;
    excelSheetName?: string | null;
    excelHeaderRow?: number | null;
    excelCodeHeader?: string | null;
    excelNameHeader?: string | null;
    excelPriceHeader?: string | null;
    pdfPriceIndex?: number | null;
    pdfCodePattern?: string | null;
    discountRules?: Array<{ keywords: string[]; discounts: number[] }>;
  }) => {
    const response = await apiClient.put(`/admin/supplier-price-lists/suppliers/${id}`, data);
    return response.data as { supplier: any };
  },
  previewSupplierPriceLists: async (params: {
    supplierId: string;
    files: Array<{ uri: string; name?: string; mimeType?: string }>;
    overrides?: SupplierPriceListOverrides;
  }) => {
    const formData = new FormData();
    formData.append('supplierId', params.supplierId);
    params.files.forEach((file) => {
      formData.append('files', {
        uri: file.uri,
        name: file.name || 'price-list',
        type: file.mimeType || 'application/octet-stream',
      } as any);
    });
    appendSupplierPriceListOverrides(formData, params.overrides);

    const response = await apiClient.post('/admin/supplier-price-lists/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { excel?: any; pdf?: any };
  },
  uploadSupplierPriceLists: async (params: {
    supplierId: string;
    files: Array<{ uri: string; name?: string; mimeType?: string }>;
    overrides?: SupplierPriceListOverrides;
  }) => {
    const formData = new FormData();
    formData.append('supplierId', params.supplierId);
    params.files.forEach((file) => {
      formData.append('files', {
        uri: file.uri,
        name: file.name || 'price-list',
        type: file.mimeType || 'application/octet-stream',
      } as any);
    });
    appendSupplierPriceListOverrides(formData, params.overrides);

    const response = await apiClient.post('/admin/supplier-price-lists/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { uploadId: string; summary: any };
  },
  getSupplierPriceListUploads: async (params: {
    supplierId?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.supplierId) queryParams.append('supplierId', params.supplierId);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/supplier-price-lists?${queryParams.toString()}`);
    return response.data as { uploads: any[]; pagination: any };
  },
  getSupplierPriceListUpload: async (id: string) => {
    const response = await apiClient.get(`/admin/supplier-price-lists/${id}`);
    return response.data as { upload: any };
  },
  getSupplierPriceListItems: async (params: {
    uploadId: string;
    status?: 'matched' | 'unmatched' | 'multiple' | 'suspicious';
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/supplier-price-lists/${params.uploadId}/items?${queryParams.toString()}`);
    return response.data as { items: any[]; pagination: any };
  },

  // Sync
  triggerSync: async () => {
    const response = await apiClient.post('/admin/sync');
    return response.data as { syncLogId: string };
  },
  triggerImageSync: async () => {
    const response = await apiClient.post('/admin/sync/images');
    return response.data as { syncLogId: string };
  },
  getSyncStatus: async (id: string) => {
    const response = await apiClient.get(`/admin/sync/status/${id}`);
    return response.data as SyncStatus;
  },
  triggerCariSync: async () => {
    const response = await apiClient.post('/admin/sync/cari');
    return response.data as { syncId: string };
  },
  getCariSyncStatus: async (id: string) => {
    const response = await apiClient.get(`/admin/sync/cari/status/${id}`);
    return response.data as SyncStatus;
  },
  getLatestCariSync: async () => {
    const response = await apiClient.get('/admin/sync/cari/latest');
    return response.data as SyncStatus | { message?: string };
  },
  triggerPriceSync: async () => {
    const response = await apiClient.post('/admin/price-sync');
    return response.data as { success: boolean; syncType?: string; recordsSynced?: number; error?: string };
  },
  getPriceSyncStatus: async () => {
    const response = await apiClient.get('/admin/price-sync/status');
    return response.data as { success: boolean; status: any };
  },
};
