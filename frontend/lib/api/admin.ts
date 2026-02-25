/**
 * Admin API
 */

import apiClient from './client';
import {
  Settings,
  SyncResponse,
  SyncStatus,
  Customer,
  CustomerContact,
  CreateCustomerRequest,
  PendingOrderForAdmin,
  Quote,
  QuoteHistory,
  QuoteLineItem,
  CategoryWithPriceRules,
  SetPriceRuleRequest,
  DashboardStats,
  Task,
  TaskDetail,
  TaskTemplate,
  TaskView,
  TaskComment,
  TaskAttachment,
  TaskLink,
  Notification,
  VadeBalance,
  VadeNote,
  VadeClassification,
  VadeAssignment,
  VadeSyncLog,
  EInvoiceDocument,
} from '@/types';

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
  getSettings: async (): Promise<Settings> => {
    const response = await apiClient.get('/admin/settings');
    return response.data;
  },

  updateSettings: async (data: Partial<Settings>): Promise<{ message: string; settings: Settings }> => {
    const response = await apiClient.put('/admin/settings', data);
    return response.data;
  },

  // Sync
  triggerSync: async (): Promise<SyncResponse> => {
    const response = await apiClient.post('/admin/sync');
    return response.data;
  },

  getSyncStatus: async (syncLogId: string): Promise<SyncStatus> => {
    const response = await apiClient.get(`/admin/sync/status/${syncLogId}`);
    return response.data;
  },

  triggerImageSync: async (): Promise<SyncResponse> => {
    const response = await apiClient.post('/admin/sync/images');
    return response.data;
  },

  triggerCariSync: async (): Promise<{ message: string; syncId: string }> => {
    const response = await apiClient.post('/admin/sync/cari');
    return response.data;
  },

  // Cari List
  getCariList: async (): Promise<{ cariList: Array<{
    code: string;
    name: string;
    city?: string;
    district?: string;
    phone?: string;
    isLocked: boolean;
    groupCode?: string;
    sectorCode?: string;
    paymentTerm?: number;
    paymentPlanNo?: number | null;
    paymentPlanCode?: string | null;
    paymentPlanName?: string | null;
    hasEInvoice: boolean;
    balance: number;
  }> }> => {
    const response = await apiClient.get('/admin/cari-list');
    return response.data;
  },

  // Bulk User Creation
  getAvailableCaris: async (): Promise<{
    caris: Array<{
      code: string;
      name: string;
      city?: string;
      district?: string;
      phone?: string;
      isLocked: boolean;
      groupCode?: string;
      sectorCode?: string;
      paymentTerm?: number;
      paymentPlanNo?: number | null;
      paymentPlanCode?: string | null;
      paymentPlanName?: string | null;
      hasEInvoice: boolean;
      balance: number;
    }>;
    totalAvailable: number;
    totalExisting: number;
  }> => {
    const response = await apiClient.get('/admin/caris/available');
    return response.data;
  },

  bulkCreateUsers: async (cariCodes: string[]): Promise<{
    success: boolean;
    message: string;
    results: {
      created: string[];
      skipped: string[];
      errors: Array<{ code: string; error: string }>;
    };
  }> => {
    const response = await apiClient.post('/admin/users/bulk-create', { cariCodes });
    return response.data;
  },

  // Products
  getProducts: async (params?: {
    search?: string;
    hasImage?: 'true' | 'false';
    hasStock?: 'true' | 'false';
    imageSyncStatus?: 'all' | 'SUCCESS' | 'SKIPPED' | 'FAILED';
    imageSyncErrorType?: string;
    categoryId?: string;
    priceListStatus?: 'all' | 'missing' | 'available';
    sortBy?: 'name' | 'mikroCode' | 'excessStock' | 'totalStock' | 'lastEntryDate' | 'currentCost' | 'imageSyncErrorType' | 'imageSyncUpdatedAt';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{ products: any[]; pagination: any; stats: any }> => {
    const response = await apiClient.get('/admin/products', { params });
    return response.data;
  },

  triggerSelectedImageSync: async (productIds: string[]): Promise<{ message: string; syncLogId: string }> => {
    const response = await apiClient.post('/admin/products/image-sync', { productIds });
    return response.data;
  },
  getProductComplements: async (productId: string): Promise<{
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
  }> => {
    const response = await apiClient.get(`/admin/products/${productId}/complements`);
    return response.data;
  },

  updateProductComplements: async (
    productId: string,
    data: {
      manualProductIds: string[];
      mode?: 'AUTO' | 'MANUAL';
      complementGroupCode?: string | null;
    }
  ): Promise<{ mode: 'AUTO' | 'MANUAL'; manual: string[] }> => {
    const response = await apiClient.put(`/admin/products/${productId}/complements`, data);
    return response.data;
  },

  syncProductComplements: async (params?: {
    months?: number;
    limit?: number;
  }): Promise<{ success: boolean; result: any }> => {
    const response = await apiClient.post('/admin/product-complements/sync', params || {});
    return response.data;
  },

  // Customers
  getCustomers: async (): Promise<{ customers: Customer[] }> => {
    const response = await apiClient.get('/admin/customers');
    return response.data;
  },

  createCustomer: async (data: CreateCustomerRequest): Promise<{ message: string; customer: Customer }> => {
    const response = await apiClient.post('/admin/customers', data);
    return response.data;
  },

  updateCustomer: async (id: string, data: {
    email?: string;
    customerType?: string;
    active?: boolean;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
    priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
    useLastPrices?: boolean;
    lastPriceGuardType?: 'COST' | 'PRICE_LIST';
    lastPriceGuardInvoicedListNo?: number | null;
    lastPriceGuardWhiteListNo?: number | null;
    lastPriceCostBasis?: 'CURRENT_COST' | 'LAST_ENTRY';
    lastPriceMinCostPercent?: number;
  }): Promise<{ message: string; customer: Customer }> => {
    const response = await apiClient.put(`/admin/customers/${id}`, data);
    return response.data;
  },

  getCustomerPriceListRules: async (customerId: string): Promise<{ rules: Array<{
    id: string;
    brandCode?: string | null;
    categoryId?: string | null;
    invoicedPriceListNo: number;
    whitePriceListNo: number;
  }> }> => {
    const response = await apiClient.get(`/admin/customers/${customerId}/price-list-rules`);
    return response.data;
  },

  updateCustomerPriceListRules: async (
    customerId: string,
    rules: Array<{
      brandCode?: string | null;
      categoryId?: string | null;
      invoicedPriceListNo: number;
      whitePriceListNo: number;
    }>
  ): Promise<{ rules: Array<any> }> => {
    const response = await apiClient.put(`/admin/customers/${customerId}/price-list-rules`, { rules });
    return response.data;
  },

  getBrands: async (search?: string): Promise<{ brands: string[] }> => {
    const response = await apiClient.get('/admin/brands', { params: search ? { search } : undefined });
    return response.data;
  },

  getCustomerContacts: async (customerId: string): Promise<{ contacts: CustomerContact[] }> => {
    const response = await apiClient.get(`/admin/customers/${customerId}/contacts`);
    return response.data;
  },

  createCustomerContact: async (
    customerId: string,
    data: { name: string; phone?: string; email?: string }
  ): Promise<{ contact: CustomerContact }> => {
    const response = await apiClient.post(`/admin/customers/${customerId}/contacts`, data);
    return response.data;
  },

  updateCustomerContact: async (
    customerId: string,
    contactId: string,
    data: { name?: string; phone?: string; email?: string }
  ): Promise<{ contact: CustomerContact }> => {
    const response = await apiClient.put(`/admin/customers/${customerId}/contacts/${contactId}`, data);
    return response.data;
  },

  deleteCustomerContact: async (
    customerId: string,
    contactId: string
  ): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/admin/customers/${customerId}/contacts/${contactId}`);
    return response.data;
  },

  getCustomerSubUsers: async (customerId: string): Promise<{
    subUsers: Array<{
      id: string;
      name: string;
      email?: string;
      active: boolean;
      createdAt: string;
    }>;
  }> => {
    const response = await apiClient.get(`/admin/customers/${customerId}/sub-users`);
    return response.data;
  },

  createCustomerSubUser: async (
    customerId: string,
    data: { name: string; email?: string; password?: string; active?: boolean; autoCredentials?: boolean }
  ): Promise<{
    subUser: { id: string; name: string; email?: string; active: boolean; createdAt: string };
    credentials?: { username: string; password: string } | null;
  }> => {
    const response = await apiClient.post(`/admin/customers/${customerId}/sub-users`, data);
    return response.data;
  },

  updateCustomerSubUser: async (
    subUserId: string,
    data: { name?: string; email?: string; password?: string; active?: boolean }
  ): Promise<{ subUser: { id: string; name: string; email?: string; active: boolean; createdAt: string } }> => {
    const response = await apiClient.put(`/admin/customers/sub-users/${subUserId}`, data);
    return response.data;
  },

  deleteCustomerSubUser: async (subUserId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/admin/customers/sub-users/${subUserId}`);
    return response.data;
  },

  resetCustomerSubUserPassword: async (subUserId: string): Promise<{ credentials: { username: string; password: string } }> => {
    const response = await apiClient.post(`/admin/customers/sub-users/${subUserId}/reset-password`);
    return response.data;
  },

  // Agreements
  getAgreements: async (customerId: string, search?: string): Promise<{ agreements: any[] }> => {
    const response = await apiClient.get('/admin/agreements', { params: { customerId, search } });
    return response.data;
  },

  upsertAgreement: async (data: {
    customerId: string;
    productId: string;
    priceInvoiced: number;
    priceWhite?: number | null;
    customerProductCode?: string | null;
    minQuantity?: number;
    validFrom?: string;
    validTo?: string | null;
  }): Promise<{ agreement: any }> => {
    const response = await apiClient.post('/admin/agreements', data);
    return response.data;
  },

  deleteAgreement: async (agreementId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/admin/agreements/${agreementId}`);
    return response.data;
  },
  deleteAgreements: async (data: { customerId: string; ids?: string[] }): Promise<{ deletedCount: number }> => {
    const response = await apiClient.post('/admin/agreements/bulk-delete', data);
    return response.data;
  },
  importAgreements: async (data: {
    customerId: string;
    rows: Array<{
      mikroCode: string;
      priceInvoiced: number;
      priceWhite?: number | null;
      customerProductCode?: string | null;
      minQuantity?: number;
      validFrom?: string | null;
      validTo?: string | null;
    }>;
  }): Promise<{ imported: number; failed: number; results: Array<{ mikroCode: string; status: string; reason?: string }> }> => {
    const response = await apiClient.post('/admin/agreements/import', data);
    return response.data;
  },

  // Orders
  getAllOrders: async (status?: string): Promise<{ orders: PendingOrderForAdmin[] }> => {
    const params = status ? { status } : {};
    const response = await apiClient.get('/admin/orders', { params });
    return response.data;
  },

  getPendingOrders: async (): Promise<{ orders: PendingOrderForAdmin[] }> => {
    const response = await apiClient.get('/admin/orders/pending');
    return response.data;
  },

  getOrderById: async (id: string): Promise<{ order: PendingOrderForAdmin }> => {
    const response = await apiClient.get(`/admin/orders/${id}`);
    return response.data;
  },

  updateOrder: async (
    id: string,
    payload: {
      items: Array<{
        productId?: string;
        productCode?: string;
        productName?: string;
        quantity: number;
        unitPrice: number;
        priceType?: 'INVOICED' | 'WHITE';
        lineNote?: string;
        responsibilityCenter?: string;
      }>;
      customerOrderNumber?: string;
      deliveryLocation?: string;
    }
  ): Promise<{ order: PendingOrderForAdmin }> => {
    const response = await apiClient.put(`/admin/orders/${id}`, payload);
    return response.data;
  },

  approveOrder: async (
    id: string,
    options?: { adminNote?: string; invoicedSeries?: string; whiteSeries?: string }
  ): Promise<{ message: string; mikroOrderIds: string[] }> => {
    const response = await apiClient.post(`/admin/orders/${id}/approve`, {
      adminNote: options?.adminNote,
      invoicedSeries: options?.invoicedSeries,
      whiteSeries: options?.whiteSeries,
    });
    return response.data;
  },

  rejectOrder: async (id: string, adminNote: string): Promise<{ message: string }> => {
    const response = await apiClient.post(`/admin/orders/${id}/reject`, { adminNote });
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
  }): Promise<{ message: string; mikroOrderIds: string[]; orderId: string; orderNumber: string }> => {
    const response = await apiClient.post('/admin/orders/manual', payload);
    return response.data;
  },

  // Warehouse Workflow (Depo Dokunmatik Akis)
  getWarehouseOverview: async (params?: {
    series?: string | string[];
    search?: string;
    status?: 'ALL' | 'PENDING' | 'PICKING' | 'READY_FOR_LOADING' | 'PARTIALLY_LOADED' | 'LOADED' | 'DISPATCHED';
  }): Promise<{
    series: Array<{
      series: string;
      total: number;
      pending: number;
      picking: number;
      ready: number;
      loaded: number;
      dispatched: number;
    }>;
    orders: Array<{
      mikroOrderNumber: string;
      orderSeries: string;
      orderSequence: number;
      customerCode: string;
      customerName: string;
      warehouseCode: string | null;
      orderDate: string;
      deliveryDate: string | null;
      itemCount: number;
      grandTotal: number;
      workflowStatus: 'PENDING' | 'PICKING' | 'READY_FOR_LOADING' | 'PARTIALLY_LOADED' | 'LOADED' | 'DISPATCHED';
      assignedPickerUserId: string | null;
      startedAt: string | null;
      loadedAt: string | null;
      dispatchedAt: string | null;
      mikroDeliveryNoteNo: string | null;
      coverage: {
        fullLines: number;
        partialLines: number;
        missingLines: number;
        coveredPercent: number;
      };
      coverageStatus: 'FULL' | 'PARTIAL' | 'NONE';
    }>;
  }> => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/overview', { params });
    return response.data;
  },

  syncWarehouseOrders: async (): Promise<{
    success: boolean;
    ordersCount: number;
    customersCount: number;
    message: string;
  }> => {
    const response = await apiClient.post('/order-tracking/admin/warehouse/sync');
    return response.data;
  },

  getWarehouseDispatchCatalog: async (): Promise<{
    drivers: Array<{ id: string; firstName: string; lastName: string; tcNo: string; note?: string | null; active: boolean }>;
    vehicles: Array<{ id: string; name: string; plate: string; note?: string | null; active: boolean }>;
  }> => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/dispatch-catalog');
    return response.data;
  },

  getWarehouseDispatchCatalogAdmin: async (): Promise<{
    drivers: Array<{ id: string; firstName: string; lastName: string; tcNo: string; note?: string | null; active: boolean }>;
    vehicles: Array<{ id: string; name: string; plate: string; note?: string | null; active: boolean }>;
  }> => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/dispatch-catalog/admin');
    return response.data;
  },

  createWarehouseDriver: async (data: {
    firstName: string;
    lastName: string;
    tcNo: string;
    note?: string;
    active?: boolean;
  }) => {
    const response = await apiClient.post('/order-tracking/admin/warehouse/dispatch-catalog/drivers', data);
    return response.data;
  },

  updateWarehouseDriver: async (
    driverId: string,
    data: { firstName?: string; lastName?: string; tcNo?: string; note?: string | null; active?: boolean }
  ) => {
    const response = await apiClient.patch(
      `/order-tracking/admin/warehouse/dispatch-catalog/drivers/${encodeURIComponent(driverId)}`,
      data
    );
    return response.data;
  },

  deleteWarehouseDriver: async (driverId: string) => {
    const response = await apiClient.delete(
      `/order-tracking/admin/warehouse/dispatch-catalog/drivers/${encodeURIComponent(driverId)}`
    );
    return response.data;
  },

  createWarehouseVehicle: async (data: { name: string; plate: string; note?: string; active?: boolean }) => {
    const response = await apiClient.post('/order-tracking/admin/warehouse/dispatch-catalog/vehicles', data);
    return response.data;
  },

  updateWarehouseVehicle: async (
    vehicleId: string,
    data: { name?: string; plate?: string; note?: string | null; active?: boolean }
  ) => {
    const response = await apiClient.patch(
      `/order-tracking/admin/warehouse/dispatch-catalog/vehicles/${encodeURIComponent(vehicleId)}`,
      data
    );
    return response.data;
  },

  deleteWarehouseVehicle: async (vehicleId: string) => {
    const response = await apiClient.delete(
      `/order-tracking/admin/warehouse/dispatch-catalog/vehicles/${encodeURIComponent(vehicleId)}`
    );
    return response.data;
  },

  getWarehouseOrderDetail: async (mikroOrderNumber: string): Promise<{
    order: {
      mikroOrderNumber: string;
      orderSeries: string;
      orderSequence: number;
      customerCode: string;
      customerName: string;
      documentNo?: string | null;
      orderNote?: string | null;
      warehouseCode: string | null;
      orderDate: string;
      deliveryDate: string | null;
      itemCount: number;
      grandTotal: number;
    };
    workflow: {
      id: string;
      status: 'PENDING' | 'PICKING' | 'READY_FOR_LOADING' | 'PARTIALLY_LOADED' | 'LOADED' | 'DISPATCHED';
      assignedPickerUserId: string | null;
      startedAt: string | null;
      loadingStartedAt: string | null;
      loadedAt: string | null;
      dispatchedAt: string | null;
      mikroDeliveryNoteNo: string | null;
      lastActionAt: string | null;
    } | null;
    coverage: {
      fullLines: number;
      partialLines: number;
      missingLines: number;
      coveredPercent: number;
    };
    coverageStatus: 'FULL' | 'PARTIAL' | 'NONE';
    lines: Array<{
      lineKey: string;
      rowNumber: number;
      productCode: string;
      productName: string;
      unit: string;
      unit2: string | null;
      unit2Factor: number | null;
      requestedQty: number;
      deliveredQty: number;
      remainingQty: number;
      pickedQty: number;
      extraQty: number;
      shortageQty: number;
      unitPrice: number;
      lineTotal: number;
      vat: number;
      stockAvailable: number;
      warehouseStocks: {
        merkez: number;
        topca: number;
      };
      stockCoverageStatus: 'FULL' | 'PARTIAL' | 'NONE';
      imageUrl: string | null;
      shelfCode: string | null;
      reservedQty: number;
      hasOwnReservation: boolean;
      hasOtherReservation: boolean;
      reservations: Array<{
        mikroOrderNumber: string;
        customerCode: string;
        customerName: string;
        orderDate: string;
        reservedQty: number;
        rowNumber: number | null;
        isCurrentOrder: boolean;
        matchesCurrentLine: boolean;
      }>;
      status: 'PENDING' | 'PICKED' | 'PARTIAL' | 'MISSING' | 'EXTRA';
    }>;
  }> => {
    const response = await apiClient.get(`/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}`);
    return response.data;
  },

  startWarehousePicking: async (mikroOrderNumber: string) => {
    const response = await apiClient.post(`/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/start`);
    return response.data;
  },

  updateWarehouseItem: async (
    mikroOrderNumber: string,
    lineKey: string,
    data: { pickedQty?: number; extraQty?: number; shelfCode?: string | null }
  ) => {
    const response = await apiClient.patch(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/items/${encodeURIComponent(lineKey)}`,
      data
    );
    return response.data;
  },

  reportWarehouseImageIssue: async (
    mikroOrderNumber: string,
    lineKey: string,
    data?: { note?: string }
  ): Promise<{
    report: {
      id: string;
      mikroOrderNumber: string;
      lineKey: string;
      productCode: string;
      productName: string;
      status: 'OPEN' | 'REVIEWED' | 'FIXED';
      createdAt: string;
    };
    alreadyReported: boolean;
  }> => {
    const response = await apiClient.post(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/items/${encodeURIComponent(lineKey)}/report-image-issue`,
      data || {}
    );
    return response.data;
  },

  getWarehouseImageIssues: async (params?: {
    status?: 'ALL' | 'OPEN' | 'REVIEWED' | 'FIXED';
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    reports: Array<{
      id: string;
      mikroOrderNumber: string;
      orderSeries: string | null;
      customerCode: string | null;
      customerName: string | null;
      lineKey: string;
      rowNumber: number | null;
      productCode: string;
      productName: string;
      productId: string | null;
      currentProductImageUrl: string | null;
      imageUrl: string | null;
      note: string | null;
      status: 'OPEN' | 'REVIEWED' | 'FIXED';
      reporterUserId: string | null;
      reporterName: string | null;
      reviewedByUserId: string | null;
      reviewedByName: string | null;
      reviewNote: string | null;
      reviewedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    summary: {
      total: number;
      open: number;
      reviewed: number;
      fixed: number;
    };
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      totalRecords: number;
    };
  }> => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/image-issues', { params });
    return response.data;
  },

  updateWarehouseImageIssue: async (
    reportId: string,
    data: { status: 'OPEN' | 'REVIEWED' | 'FIXED'; note?: string }
  ) => {
    const response = await apiClient.patch(
      `/order-tracking/admin/warehouse/image-issues/${encodeURIComponent(reportId)}`,
      data
    );
    return response.data;
  },

  markWarehouseLoaded: async (mikroOrderNumber: string) => {
    const response = await apiClient.post(`/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/loaded`);
    return response.data;
  },

  markWarehouseDispatched: async (
    mikroOrderNumber: string,
    data: {
      deliverySeries: string;
      transport: {
        driverFirstName: string;
        driverLastName: string;
        driverTcNo: string;
        vehicleName: string;
        vehiclePlate: string;
      };
    }
  ) => {
    const response = await apiClient.post(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/dispatched`,
      data
    );
    return response.data;
  },

  getWarehouseRetailProducts: async (params?: {
    search?: string;
    limit?: number;
    warehouseNo?: 1 | 6 | 0;
    onlyInStock?: boolean;
  }): Promise<{
    products: Array<{
      productCode: string;
      productName: string;
      unit: string;
      stockMerkez: number;
      stockTopca: number;
      stockTotal: number;
      stockSelected: number;
      perakende1: number;
      perakende2: number;
      perakende3: number;
      perakende4: number;
      perakende5: number;
      imageUrl: string | null;
    }>;
  }> => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/retail/products', { params });
    return response.data;
  },

  createWarehouseRetailSale: async (data: {
    paymentType: 'CASH' | 'CARD';
    priceLevel: 1 | 2 | 3 | 4 | 5;
    items: Array<{ productCode: string; quantity: number; unitPrice?: number }>;
  }): Promise<{
    invoiceNo: string;
    paymentType: 'CASH' | 'CARD';
    paymentLabel: string;
    customerCode: string;
    priceLevel: 1 | 2 | 3 | 4 | 5;
    totalAmount: number;
    lineCount: number;
    lines: Array<{
      productCode: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      unit: string;
    }>;
  }> => {
    const response = await apiClient.post('/order-tracking/admin/warehouse/retail/sales', data);
    return response.data;
  },

  // Quotes (Teklifler)
  getQuotePreferences: async (): Promise<{
    preferences: {
      lastSalesCount: number;
      whatsappTemplate: string;
      responsibleCode?: string | null;
      columnWidths?: Record<string, number> | null;
      poolSort?: string | null;
      poolPriceListNo?: number | null;
      poolColorRules?: any[] | null;
    };
  }> => {
    const response = await apiClient.get('/admin/quotes/preferences');
    return response.data;
  },

  updateQuotePreferences: async (data: {
    lastSalesCount?: number;
    whatsappTemplate?: string;
    responsibleCode?: string | null;
    columnWidths?: Record<string, number>;
    poolSort?: string | null;
    poolPriceListNo?: number | null;
    poolColorRules?: any[] | null;
  }): Promise<{
    preferences: {
      lastSalesCount: number;
      whatsappTemplate: string;
      responsibleCode?: string | null;
      columnWidths?: Record<string, number> | null;
      poolSort?: string | null;
      poolPriceListNo?: number | null;
      poolColorRules?: any[] | null;
    };
  }> => {
    const response = await apiClient.put('/admin/quotes/preferences', data);
    return response.data;
  },

  getQuoteResponsibles: async (): Promise<{
    responsibles: Array<{ code: string; name: string; surname: string }>;
  }> => {
    const response = await apiClient.get('/admin/quotes/responsibles');
    return response.data;
  },

  getCustomerPurchasedProducts: async (
    customerId: string,
    limit?: number
  ): Promise<{
    customer: any;
    products: any[];
  }> => {
    const response = await apiClient.get(`/admin/quotes/customer/${customerId}/purchased-products`, {
      params: limit ? { limit } : undefined,
    });
    return response.data;
  },

  getLastQuoteItems: async (payload: {
    customerId: string;
    productCodes: string[];
    limit?: number;
    excludeQuoteId?: string;
  }): Promise<{ lastQuotes: Record<string, any[]> }> => {
    const response = await apiClient.post('/admin/quotes/last-quotes', payload);
    return response.data;
  },

  getLastOrderItems: async (payload: {
    customerId?: string;
    customerCode?: string;
    productCodes: string[];
    limit?: number;
    excludeOrderId?: string;
  }): Promise<{ lastOrders: Record<string, any[]> }> => {
    const response = await apiClient.post('/admin/orders/last-orders', payload);
    return response.data;
  },

  createQuote: async (data: any): Promise<{ quote: Quote }> => {
    const response = await apiClient.post('/admin/quotes', data);
    return response.data;
  },

  updateQuote: async (id: string, data: any): Promise<{ quote: Quote }> => {
    const response = await apiClient.put(`/admin/quotes/${id}`, data);
    return response.data;
  },

  getQuotes: async (status?: string): Promise<{ quotes: Quote[] }> => {
    const response = await apiClient.get('/admin/quotes', { params: status ? { status } : undefined });
    return response.data;
  },

  getQuoteById: async (id: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.get(`/admin/quotes/${id}`);
    return response.data;
  },

  getQuoteHistory: async (id: string): Promise<{ history: QuoteHistory[] }> => {
    const response = await apiClient.get(`/admin/quotes/${id}/history`);
    return response.data;
  },

  getQuoteLineItems: async (params?: {
    status?: string;
    search?: string;
    closeReason?: string;
    minDays?: number;
    maxDays?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ items: QuoteLineItem[]; total: number }> => {
    const response = await apiClient.get('/admin/quotes/line-items', { params });
    return response.data;
  },

  closeQuoteLineItems: async (items: Array<{ id: string; reason: string }>): Promise<{ closedCount: number; mikroClosedCount: number }> => {
    const response = await apiClient.post('/admin/quotes/line-items/close', { items });
    return response.data;
  },

  reopenQuoteLineItems: async (itemIds: string[]): Promise<{ reopenedCount: number; mikroReopenCount: number }> => {
    const response = await apiClient.post('/admin/quotes/line-items/reopen', { itemIds });
    return response.data;
  },

  syncQuote: async (id: string): Promise<{ quote: Quote; updated: boolean }> => {
    const response = await apiClient.post(`/admin/quotes/${id}/sync`);
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
      documentNo?: string;
      documentDescription?: string;
      itemUpdates?: Array<{ id: string; quantity?: number; responsibilityCenter?: string; reserveQty?: number }>;
    }
  ): Promise<{ mikroOrderIds: string[]; closedCount: number; orderId: string; orderNumber: string }> => {
    const response = await apiClient.post(`/admin/quotes/${id}/convert-to-order`, payload);
    return response.data;
  },

  approveQuote: async (id: string, adminNote?: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.post(`/admin/quotes/${id}/approve`, { adminNote });
    return response.data;
  },

  rejectQuote: async (id: string, adminNote: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.post(`/admin/quotes/${id}/reject`, { adminNote });
    return response.data;
  },

  getUsdSellingRate: async (): Promise<{ currency: string; rate: number; fetchedAt: string; source: string }> => {
    const response = await apiClient.get('/admin/exchange/usd');
    return response.data;
  },

  // Tasks
  getTaskPreferences: async (): Promise<{ preferences: { defaultView: TaskView; colorRules?: any[] | null } }> => {
    const response = await apiClient.get('/admin/tasks/preferences');
    return response.data;
  },

  updateTaskPreferences: async (data: { defaultView?: TaskView; colorRules?: any[] | null }): Promise<{ preferences: { defaultView: TaskView; colorRules?: any[] | null } }> => {
    const response = await apiClient.put('/admin/tasks/preferences', data);
    return response.data;
  },

  getTaskAssignees: async (): Promise<{ assignees: Array<{ id: string; name: string; email?: string; role?: string }> }> => {
    const response = await apiClient.get('/admin/tasks/assignees');
    return response.data;
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
  }): Promise<{ tasks: Task[] }> => {
    const response = await apiClient.get('/admin/tasks', { params });
    return response.data;
  },

  getTaskById: async (id: string): Promise<{ task: TaskDetail }> => {
    const response = await apiClient.get(`/admin/tasks/${id}`);
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
  }): Promise<{ task: TaskDetail }> => {
    const response = await apiClient.post('/admin/tasks', data);
    return response.data;
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
  }): Promise<{ task: TaskDetail }> => {
    const response = await apiClient.put(`/admin/tasks/${id}`, data);
    return response.data;
  },

  addTaskComment: async (id: string, data: { body: string; visibility?: string }): Promise<{ comment: TaskComment }> => {
    const response = await apiClient.post(`/admin/tasks/${id}/comments`, data);
    return response.data;
  },

  addTaskAttachment: async (id: string, formData: FormData): Promise<{ attachment: TaskAttachment }> => {
    const response = await apiClient.post(`/admin/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Notifications
  getNotifications: async (params?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<{ notifications: Notification[]; unreadCount: number }> => {
    const response = await apiClient.get('/admin/notifications', { params });
    return response.data;
  },

  markNotificationsRead: async (ids: string[]): Promise<{ updated: number }> => {
    const response = await apiClient.post('/admin/notifications/read', { ids });
    return response.data;
  },

  markNotificationsReadAll: async (): Promise<{ updated: number }> => {
    const response = await apiClient.post('/admin/notifications/read-all');
    return response.data;
  },

  // Vade Tracking
  getVadeBalances: async (params?: {
    search?: string;
    page?: number;
    limit?: number;
    overdueOnly?: boolean;
    upcomingOnly?: boolean;
    sectorCode?: string;
    groupCode?: string;
    minBalance?: number;
    maxBalance?: number;
    hasNotes?: boolean;
    notesKeyword?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    export?: boolean;
  }): Promise<{
    balances: VadeBalance[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    summary: { overdue: number; upcoming: number; total: number };
  }> => {
    const response = await apiClient.get('/admin/vade/balances', { params });
    return response.data;
  },

  getVadeFilters: async (): Promise<{ sectorCodes: string[]; groupCodes: string[] }> => {
    const response = await apiClient.get('/admin/vade/filters');
    return response.data;
  },

  getVadeCustomer: async (customerId: string): Promise<{
    customer: any;
    notes: VadeNote[];
    assignments: VadeAssignment[];
  }> => {
    const response = await apiClient.get(`/admin/vade/customers/${customerId}`);
    return response.data;
  },

  getVadeNotes: async (params?: {
    customerId?: string;
    authorId?: string;
    tag?: string;
    startDate?: string;
    endDate?: string;
    reminderOnly?: boolean;
    reminderCompleted?: boolean;
    reminderFrom?: string;
    reminderTo?: string;
  }): Promise<{ notes: VadeNote[] }> => {
    const response = await apiClient.get('/admin/vade/notes', { params });
    return response.data;
  },

  createVadeNote: async (data: {
    customerId: string;
    noteContent: string;
    promiseDate?: string | null;
    tags?: string[];
    reminderDate?: string | null;
    reminderNote?: string | null;
    reminderCompleted?: boolean;
    balanceAtTime?: number | null;
  }): Promise<{ note: VadeNote }> => {
    const response = await apiClient.post('/admin/vade/notes', data);
    return response.data;
  },

  updateVadeNote: async (noteId: string, data: {
    noteContent?: string;
    promiseDate?: string | null;
    tags?: string[];
    reminderDate?: string | null;
    reminderNote?: string | null;
    reminderCompleted?: boolean;
    reminderSentAt?: string | null;
    balanceAtTime?: number | null;
  }): Promise<{ note: VadeNote }> => {
    const response = await apiClient.put(`/admin/vade/notes/${noteId}`, data);
    return response.data;
  },

  upsertVadeClassification: async (data: {
    customerId: string;
    classification: string;
    customClassification?: string | null;
    riskScore?: number | null;
  }): Promise<{ classification: VadeClassification }> => {
    const response = await apiClient.post('/admin/vade/classification', data);
    return response.data;
  },

  getVadeAssignments: async (params?: { staffId?: string; customerId?: string }): Promise<{ assignments: VadeAssignment[] }> => {
    const response = await apiClient.get('/admin/vade/assignments', { params });
    return response.data;
  },

  assignVadeCustomers: async (data: { staffId: string; customerIds: string[] }): Promise<{ created: number }> => {
    const response = await apiClient.post('/admin/vade/assignments', data);
    return response.data;
  },

  removeVadeAssignment: async (data: { staffId: string; customerId: string }): Promise<{ success: boolean }> => {
    const response = await apiClient.delete('/admin/vade/assignments', { data });
    return response.data;
  },

  importVadeBalances: async (rows: Array<{
    mikroCariCode: string;
    pastDueBalance?: number;
    pastDueDate?: string | null;
    notDueBalance?: number;
    notDueDate?: string | null;
    totalBalance?: number;
    valor?: number;
    paymentTermLabel?: string | null;
    referenceDate?: string | null;
  }>): Promise<{ imported: number; skipped: number }> => {
    const response = await apiClient.post('/admin/vade/import', { rows });
    return response.data;
  },

  triggerVadeSync: async (): Promise<{ success: boolean; syncLogId: string; error?: string }> => {
    const response = await apiClient.post('/admin/vade/sync');
    return response.data;
  },

  getVadeSyncStatus: async (syncLogId: string): Promise<{ log: VadeSyncLog }> => {
    const response = await apiClient.get(`/admin/vade/sync/status/${syncLogId}`);
    return response.data;
  },

  // E-Invoice
  getEInvoices: async (params?: {
    search?: string;
    invoicePrefix?: string;
    customerId?: string;
    customerCode?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    documents: EInvoiceDocument[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> => {
    const response = await apiClient.get('/admin/einvoices', { params });
    return response.data;
  },

  uploadEInvoices: async (formData: FormData): Promise<{
    uploaded: number;
    updated: number;
    failed: number;
    results: Array<{ invoiceNo: string; documentId?: string; status: string; message?: string }>;
  }> => {
    const response = await apiClient.post('/admin/einvoices/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  downloadEInvoice: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/admin/einvoices/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  downloadEInvoices: async (ids: string[]): Promise<Blob> => {
    const response = await apiClient.post('/admin/einvoices/bulk-download', { ids }, {
      responseType: 'blob',
    });
    return response.data;
  },

  addTaskLink: async (id: string, data: {
    type: string;
    label?: string;
    referenceId?: string;
    referenceCode?: string;
    referenceUrl?: string;
  }): Promise<{ link: TaskLink }> => {
    const response = await apiClient.post(`/admin/tasks/${id}/links`, data);
    return response.data;
  },

  deleteTaskLink: async (id: string, linkId: string): Promise<{ success: boolean }> => {
    const response = await apiClient.delete(`/admin/tasks/${id}/links/${linkId}`);
    return response.data;
  },

  getTaskTemplates: async (activeOnly = true): Promise<{ templates: TaskTemplate[] }> => {
    const response = await apiClient.get('/admin/tasks/templates', {
      params: { activeOnly },
    });
    return response.data;
  },

  createTaskTemplate: async (data: {
    title: string;
    description?: string | null;
    type: string;
    priority?: string;
    defaultStatus?: string;
    isActive?: boolean;
  }): Promise<{ template: TaskTemplate }> => {
    const response = await apiClient.post('/admin/tasks/templates', data);
    return response.data;
  },

  updateTaskTemplate: async (id: string, data: {
    title?: string;
    description?: string | null;
    type?: string;
    priority?: string;
    defaultStatus?: string;
    isActive?: boolean;
  }): Promise<{ template: TaskTemplate }> => {
    const response = await apiClient.put(`/admin/tasks/templates/${id}`, data);
    return response.data;
  },

  // Categories & Pricing
  getCategories: async (): Promise<{ categories: CategoryWithPriceRules[] }> => {
    const response = await apiClient.get('/admin/categories');
    return response.data;
  },

  setCategoryPriceRule: async (data: SetPriceRuleRequest): Promise<{ message: string }> => {
    const response = await apiClient.post('/admin/categories/price-rule', data);
    return response.data;
  },

  setBulkCategoryPriceRules: async (rules: Array<{
    categoryId: string;
    customerType: string;
    profitMargin: number;
  }>): Promise<{
    message: string;
    updatedRules: number;
    totalRules: number;
    affectedCategories: number;
    pricesUpdated: number;
    errors: string[];
  }> => {
    const response = await apiClient.post('/admin/categories/bulk-price-rules', { rules });
    return response.data;
  },

  setProductPriceOverride: async (data: {
    productId: string;
    customerType: string;
    profitMargin: number;
  }): Promise<{ message: string }> => {
    const response = await apiClient.post('/admin/products/price-override', data);
    return response.data;
  },

  // Dashboard
  getDashboardStats: async (params?: {
    period?: 'daily' | 'weekly' | 'monthly' | 'custom';
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardStats> => {
    const response = await apiClient.get('/admin/dashboard/stats', { params });
    return response.data;
  },

  getOperationsCommandCenter: async (params?: {
    series?: string[];
    orderLimit?: number;
    customerLimit?: number;
  }): Promise<{ success: boolean; data: any }> => {
    const queryParams = new URLSearchParams();
    if (params?.series && params.series.length > 0) queryParams.append('series', params.series.join(','));
    if (params?.orderLimit) queryParams.append('orderLimit', String(params.orderLimit));
    if (params?.customerLimit) queryParams.append('customerLimit', String(params.customerLimit));

    const path = queryParams.toString()
      ? `/admin/operations/command-center?${queryParams.toString()}`
      : '/admin/operations/command-center';
    const response = await apiClient.get(path);
    return response.data;
  },

  // Product Images
  uploadProductImage: async (productId: string, formData: FormData): Promise<{ success: boolean; imageUrl: string; imageChecksum?: string | null; imageSyncUpdatedAt?: string | null; message: string }> => {
    const response = await apiClient.post(`/admin/products/${productId}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  deleteProductImage: async (productId: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/admin/products/${productId}/image`);
    return response.data;
  },

  // Quote Item Images
  uploadQuoteItemImage: async (formData: FormData): Promise<{ imageUrl: string; message?: string }> => {
    const response = await apiClient.post('/admin/quotes/items/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Staff Management
  getSectorCodes: async (): Promise<{ sectorCodes: string[] }> => {
    const response = await apiClient.get('/admin/sector-codes');
    return response.data;
  },

  getStaffMembers: async (): Promise<{ staff: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    assignedSectorCodes: string[];
    active: boolean;
    createdAt: string;
  }> }> => {
    const response = await apiClient.get('/admin/staff');
    return response.data;
  },

  createStaffMember: async (data: {
    email: string;
    password: string;
    name: string;
    role: 'SALES_REP' | 'MANAGER' | 'DEPOCU';
    assignedSectorCodes?: string[];
  }): Promise<{ message: string; staff: any }> => {
    const response = await apiClient.post('/admin/staff', data);
    return response.data;
  },

  updateStaffMember: async (id: string, data: {
    email?: string;
    name?: string;
    active?: boolean;
    assignedSectorCodes?: string[];
  }): Promise<{ message: string; staff: any }> => {
    const response = await apiClient.put(`/admin/staff/${id}`, data);
    return response.data;
  },

  // Reports
  getCostUpdateAlerts: async (params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    dayDiff?: string;
    percentDiff?: string;
  }): Promise<{
    success: boolean;
    data: {
      products: any[];
      summary: any;
      pagination: any;
      metadata: {
        lastSyncAt: string | null;
        syncType: string | null;
      };
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    if (params.dayDiff) queryParams.append('dayDiff', params.dayDiff);
    if (params.percentDiff) queryParams.append('percentDiff', params.percentDiff);

    const response = await apiClient.get(`/admin/reports/cost-update-alerts?${queryParams.toString()}`);
    return response.data;
  },

  getReportCategories: async (): Promise<{ success: boolean; data: { categories: string[] } }> => {
    const response = await apiClient.get('/admin/reports/categories');
    return response.data;
  },

  getMarginComplianceReport: async (params: {
    startDate?: string;
    endDate?: string;
    includeCompleted?: number;
    customerType?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    success: boolean;
    data: {
      data: any[];
      summary: {
        totalRecords: number;
        totalDocuments: number;
        totalRevenue: number;
        totalProfit: number;
        entryProfit: number;
        avgMargin: number;
        highMarginCount: number;
        lowMarginCount: number;
        negativeMarginCount: number;
        orderSummary: {
          totalRecords: number;
          totalDocuments: number;
          totalRevenue: number;
          totalProfit: number;
          entryProfit: number;
          avgMargin: number;
          negativeLines: number;
          negativeDocuments: number;
        };
        salesSummary: {
          totalRecords: number;
          totalDocuments: number;
          totalRevenue: number;
          totalProfit: number;
          entryProfit: number;
          avgMargin: number;
          negativeLines: number;
          negativeDocuments: number;
        };
        salespersonSummary: Array<{
          sectorCode: string;
          orderSummary: {
            totalRecords: number;
            totalDocuments: number;
            totalRevenue: number;
            totalProfit: number;
            entryProfit: number;
            avgMargin: number;
            negativeLines: number;
            negativeDocuments: number;
          };
          salesSummary: {
            totalRecords: number;
            totalDocuments: number;
            totalRevenue: number;
            totalProfit: number;
            entryProfit: number;
            avgMargin: number;
            negativeLines: number;
            negativeDocuments: number;
          };
        }>;
      };
      pagination: any;
      metadata: {
        reportDate: string;
        startDate: string;
        endDate: string;
        includeCompleted: number;
      };
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.includeCompleted !== undefined) queryParams.append('includeCompleted', params.includeCompleted.toString());
    if (params.customerType) queryParams.append('customerType', params.customerType);
    if (params.category) queryParams.append('category', params.category);
    if (params.status) queryParams.append('status', params.status);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response = await apiClient.get(`/admin/reports/margin-compliance?${queryParams.toString()}`);
    return response.data;
  },


  syncMarginComplianceReport: async (params: {
    reportDate: string;
    includeCompleted?: number;
  }): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    const response = await apiClient.post('/admin/reports/margin-compliance/sync', params);
    return response.data;
  },

  sendMarginComplianceReportEmail: async (params: {
    reportDate: string;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> => {
    const response = await apiClient.post('/admin/reports/margin-compliance/email', params);
    return response.data;
  },

  getPriceHistory: async (params: {
    startDate?: string;
    endDate?: string;
    productCode?: string;
    productName?: string;
    category?: string;
    priceListNo?: number;
    consistencyStatus?: 'all' | 'consistent' | 'inconsistent';
    changeDirection?: 'increase' | 'decrease' | 'mixed' | 'all';
    minChangePercent?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    success: boolean;
    data: {
      changes: Array<{
        productCode: string;
        productName: string;
        category: string;
        changeDate: string;
        priceChanges: Array<{
          listNo: number;
          listName: string;
          oldPrice: number;
          newPrice: number;
          changeAmount: number;
          changePercent: number;
        }>;
        isConsistent: boolean;
        updatedListsCount: number;
        missingLists: number[];
        avgChangePercent: number;
        changeDirection: 'increase' | 'decrease' | 'mixed';
      }>;
      summary: {
        totalChanges: number;
        consistentChanges: number;
        inconsistentChanges: number;
        inconsistencyRate: number;
        avgIncreasePercent: number;
        avgDecreasePercent: number;
        topIncreases: Array<{ product: string; percent: number }>;
        topDecreases: Array<{ product: string; percent: number }>;
        last30DaysChanges: number;
        last7DaysChanges: number;
      };
      pagination: {
        page: number;
        limit: number;
        totalPages: number;
        totalRecords: number;
      };
      metadata: {
        dataSource: string;
      };
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.productCode) queryParams.append('productCode', params.productCode);
    if (params.productName) queryParams.append('productName', params.productName);
    if (params.category) queryParams.append('category', params.category);
    if (params.priceListNo) queryParams.append('priceListNo', params.priceListNo.toString());
    if (params.consistencyStatus) queryParams.append('consistencyStatus', params.consistencyStatus);
    if (params.changeDirection) queryParams.append('changeDirection', params.changeDirection);
    if (params.minChangePercent !== undefined) queryParams.append('minChangePercent', params.minChangePercent.toString());
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response = await apiClient.get(`/admin/reports/price-history?${queryParams.toString()}`);
    return response.data;
  },

  getTopProducts: async (params?: {
    startDate?: string;
    endDate?: string;
    brand?: string;
    category?: string;
    minQuantity?: number;
    sortBy?: 'revenue' | 'profit' | 'margin' | 'quantity';
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: {
      products: Array<{
        productCode: string;
        productName: string;
        brand: string;
        category: string;
        quantity: number;
        revenue: number;
        cost: number;
        profit: number;
        profitMargin: number;
        avgPrice: number;
        customerCount: number;
      }>;
      summary: {
        totalRevenue: number;
        totalProfit: number;
        avgProfitMargin: number;
        totalProducts: number;
      };
      pagination: {
        page: number;
        limit: number;
        totalPages: number;
        totalRecords: number;
      };
    };
  }> => {
    const response = await apiClient.get('/admin/reports/top-products', { params });
    return response.data;
  },

  getTopCustomers: async (params?: {
    startDate?: string;
    endDate?: string;
    sector?: string;
    minOrderAmount?: number;
    sortBy?: 'revenue' | 'profit' | 'margin' | 'orderCount';
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: {
      customers: Array<{
        customerCode: string;
        customerName: string;
        sector: string;
        orderCount: number;
        revenue: number;
        cost: number;
        profit: number;
        profitMargin: number;
        avgOrderAmount: number;
        topCategory: string;
        lastOrderDate: string;
      }>;
      summary: {
        totalRevenue: number;
        totalProfit: number;
        avgProfitMargin: number;
        totalCustomers: number;
      };
      pagination: {
        page: number;
        limit: number;
        totalPages: number;
        totalRecords: number;
      };
    };
  }> => {
    const response = await apiClient.get('/admin/reports/top-customers', { params });
    return response.data;
  },

  getProductCustomers: async (params: {
    productCode: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: {
      customers: Array<{
        customerCode: string;
        customerName: string;
        sectorCode: string;
        orderCount: number;
        totalQuantity: number;
        totalRevenue: number;
        totalCost: number;
        totalProfit: number;
        profitMargin: number;
        lastOrderDate: string;
      }>;
      summary: {
        totalCustomers: number;
        totalQuantity: number;
        totalRevenue: number;
        totalProfit: number;
        avgProfitMargin: number;
      };
      pagination: {
        page: number;
        limit: number;
        totalPages: number;
        totalRecords: number;
      };
    };
  }> => {
    const { productCode, ...rest } = params;
    const response = await apiClient.get(`/admin/reports/product-customers/${productCode}`, { params: rest });
    return response.data;
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
  }): Promise<{
    success: boolean;
    data: {
      rows: Array<{
        customerCode?: string;
        customerName?: string;
        productCode?: string;
        productName?: string;
        documentCount?: number;
        missingComplements: Array<{
          productCode: string;
          productName: string;
          estimatedQuantity?: number | null;
          unitPrice?: number | null;
          estimatedRevenue?: number | null;
        }>;
        missingCount: number;
      }>;
      summary: {
        totalRows: number;
        totalMissing: number;
      };
      pagination: {
        page: number;
        limit: number;
        totalPages: number;
        totalRecords: number;
      };
      metadata: {
        mode: 'product' | 'customer';
        matchMode: 'product' | 'category' | 'group';
        periodMonths: number;
        startDate: string;
        endDate: string;
        baseProduct?: { productCode: string; productName: string };
        customer?: { customerCode: string; customerName: string | null };
        sectorCode?: string | null;
        salesRep?: { id: string; name: string | null; email: string | null; assignedSectorCodes: string[] };
        minDocumentCount?: number | null;
      };
    };
  }> => {
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
    return response.data;
  },

  downloadComplementMissingExport: async (params: {
    mode: 'product' | 'customer';
    matchMode?: 'product' | 'category' | 'group';
    productCode?: string;
    customerCode?: string;
    sectorCode?: string;
    salesRepId?: string;
    periodMonths?: number;
    minDocumentCount?: number;
  }): Promise<Blob> => {
    const queryParams = new URLSearchParams();
    queryParams.append('mode', params.mode);
    if (params.matchMode) queryParams.append('matchMode', params.matchMode);
    if (params.productCode) queryParams.append('productCode', params.productCode);
    if (params.customerCode) queryParams.append('customerCode', params.customerCode);
    if (params.sectorCode) queryParams.append('sectorCode', params.sectorCode);
    if (params.salesRepId) queryParams.append('salesRepId', params.salesRepId);
    if (params.periodMonths) queryParams.append('periodMonths', params.periodMonths.toString());
    if (params.minDocumentCount) queryParams.append('minDocumentCount', params.minDocumentCount.toString());
    const response = await apiClient.get(`/admin/reports/complement-missing/export?${queryParams.toString()}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  getCustomerActivityReport: async (params: {
    startDate?: string;
    endDate?: string;
    customerCode?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ success: boolean; data: any }> => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.customerCode) queryParams.append('customerCode', params.customerCode);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());

    const response = await apiClient.get(`/admin/reports/customer-activity?${queryParams.toString()}`);
    return response.data;
  },

  getStaffActivityReport: async (params: {
    startDate?: string;
    endDate?: string;
    role?: string;
    userId?: string;
    route?: string;
    page?: number;
    limit?: number;
  }): Promise<{ success: boolean; data: any }> => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.role) queryParams.append('role', params.role);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.route) queryParams.append('route', params.route);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());

    const response = await apiClient.get(`/admin/reports/staff-activity?${queryParams.toString()}`);
    return response.data;
  },

  getUcarerDepotReport: async (params?: {
    depot?: 'MERKEZ' | 'TOPCA';
    limit?: number;
    all?: boolean;
  }): Promise<{ success: boolean; data: { depot: 'MERKEZ' | 'TOPCA'; rows: any[]; columns: string[]; total: number; limited: boolean } }> => {
    const queryParams = new URLSearchParams();
    if (params?.depot) queryParams.append('depot', params.depot);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.all) queryParams.append('all', '1');
    const response = await apiClient.get(`/admin/reports/ucarer-depo?${queryParams.toString()}`);
    return response.data;
  },

  runUcarerMinMaxReport: async (): Promise<{ success: boolean; data: { rows: any[]; columns: string[]; total: number } }> => {
    const response = await apiClient.post('/admin/reports/ucarer-minmax/run');
    return response.data;
  },

  getProductFamilies: async (): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      name: string;
      code?: string | null;
      note?: string | null;
      active: boolean;
      items: Array<{
        id: string;
        productCode: string;
        productName?: string | null;
        priority: number;
        active: boolean;
      }>;
    }>;
  }> => {
    const response = await apiClient.get('/admin/reports/product-families');
    return response.data;
  },

  createProductFamily: async (payload: {
    name: string;
    code?: string | null;
    note?: string | null;
    active?: boolean;
    productCodes: string[];
  }): Promise<{ success: boolean; data: { id: string } }> => {
    const response = await apiClient.post('/admin/reports/product-families', payload);
    return response.data;
  },

  updateProductFamily: async (
    id: string,
    payload: {
      name: string;
      code?: string | null;
      note?: string | null;
      active?: boolean;
      productCodes: string[];
    }
  ): Promise<{ success: boolean; data: { id: string } }> => {
    const response = await apiClient.put(`/admin/reports/product-families/${id}`, payload);
    return response.data;
  },

  deleteProductFamily: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/admin/reports/product-families/${id}`);
    return response.data;
  },


  getCustomerCartsReport: async (params: {
    search?: string;
    includeEmpty?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ success: boolean; data: { carts: any[]; pagination: any } }> => {
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append('search', params.search);
    if (params.includeEmpty) queryParams.append('includeEmpty', '1');
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());

    const response = await apiClient.get(`/admin/reports/customer-carts?${queryParams.toString()}`);
    return response.data;
  },

  getProductsByCodes: async (codes: string[]): Promise<{ products: any[]; total: number }> => {
    const response = await apiClient.post('/admin/products/by-codes', { codes });
    return response.data;
  },

  getComplementRecommendations: async (params: {
    productCodes: string[];
    excludeCodes?: string[];
    limit?: number;
  }): Promise<{ success: boolean; products: any[]; total: number }> => {
    const response = await apiClient.post('/admin/recommendations/complements', params);
    return response.data;
  },

  // Exclusions
  getExclusions: async (activeOnly?: boolean): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      type: 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';
      value: string;
      description?: string;
      active: boolean;
      createdAt: string;
    }>;
  }> => {
    const response = await apiClient.get('/admin/exclusions', {
      params: activeOnly !== undefined ? { activeOnly } : undefined
    });
    return response.data;
  },

  createExclusion: async (data: {
    type: 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';
    value: string;
    description?: string;
  }): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> => {
    const response = await apiClient.post('/admin/exclusions', data);
    return response.data;
  },

  updateExclusion: async (id: string, data: {
    value?: string;
    description?: string;
    active?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> => {
    const response = await apiClient.put(`/admin/exclusions/${id}`, data);
    return response.data;
  },

  deleteExclusion: async (id: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    const response = await apiClient.delete(`/admin/exclusions/${id}`);
    return response.data;
  },

  // Search - Stok ve Cari arama
  searchStocks: async (params: {
    searchTerm?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    data: any[];
    total: number;
  }> => {
    const response = await apiClient.get('/search/stocks', { params });
    return response.data;
  },

  getStocksByCodes: async (codes: string[]): Promise<{
    success: boolean;
    data: any[];
    total: number;
  }> => {
    const response = await apiClient.post('/search/stocks/by-codes', { codes });
    return response.data;
  },

  getStockColumns: async (): Promise<{
    columns: string[];
  }> => {
    const response = await apiClient.get('/search/stocks/columns');
    return response.data;
  },

  getStockUnits: async (): Promise<{
    units: string[];
  }> => {
    const response = await apiClient.get('/search/stocks/units');
    return response.data;
  },

  searchCustomers: async (params: {
    searchTerm?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    data: any[];
    total: number;
  }> => {
    const response = await apiClient.get('/search/customers', { params });
    return response.data;
  },

  getCustomerColumns: async (): Promise<{
    columns: string[];
  }> => {
    const response = await apiClient.get('/search/customers/columns');
    return response.data;
  },

  getSearchPreferences: async (): Promise<{
    preferences: {
      id: string;
      userId: string;
      stockColumns: string[];
      customerColumns: string[];
      createdAt: string;
      updatedAt: string;
    };
  }> => {
    const response = await apiClient.get('/search/preferences');
    return response.data;
  },

  updateSearchPreferences: async (data: {
    stockColumns?: string[];
    customerColumns?: string[];
  }): Promise<{
    success: boolean;
    preferences: any;
  }> => {
    const response = await apiClient.put('/search/preferences', data);
    return response.data;
  },

  // Cari Hareket / Ekstre
  searchCariForEkstre: async (params: {
    searchTerm?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: any[];
    total: number;
  }> => {
    const response = await apiClient.get('/cari-hareket/search', { params });
    return response.data;
  },

  getCariInfo: async (cariKod: string): Promise<{
    success: boolean;
    data: any;
  }> => {
    const response = await apiClient.get(`/cari-hareket/info/${cariKod}`);
    return response.data;
  },

  getCariHareketFoyu: async (params: {
    cariKod: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    success: boolean;
    data: any[];
    opening?: { borc: number; alacak: number; bakiye: number };
  }> => {
    const response = await apiClient.get('/cari-hareket/foyu', { params });
    return response.data;
  },

  // Role Permissions (HEAD_ADMIN only)
  getAllRolePermissions: async (): Promise<{
    permissions: Record<string, Record<string, boolean>>;
    availablePermissions: Record<string, string>;
    permissionDescriptions: Record<string, string>;
  }> => {
    const response = await apiClient.get('/role-permissions/all');
    return response.data;
  },

  setRolePermission: async (
    role: string,
    permission: string,
    enabled: boolean
  ): Promise<{ message: string }> => {
    const response = await apiClient.put(`/role-permissions/${role}/${permission}`, { enabled });
    return response.data;
  },

  resetRolePermissions: async (role: string): Promise<{ message: string; count: number }> => {
    const response = await apiClient.post(`/role-permissions/${role}/reset`);
    return response.data;
  },

  getMyPermissions: async (): Promise<{
    role: string;
    permissions: Record<string, boolean>;
  }> => {
    const response = await apiClient.get('/role-permissions/my-permissions');
    return response.data;
  },

  // Supplier price lists
  getSupplierPriceListSuppliers: async (): Promise<{ suppliers: any[] }> => {
    const response = await apiClient.get('/admin/supplier-price-lists/suppliers');
    return response.data;
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
  }): Promise<{ supplier: any }> => {
    const response = await apiClient.post('/admin/supplier-price-lists/suppliers', data);
    return response.data;
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
  }): Promise<{ supplier: any }> => {
    const response = await apiClient.put(`/admin/supplier-price-lists/suppliers/${id}`, data);
    return response.data;
  },

  previewSupplierPriceLists: async (params: {
    supplierId: string;
    files: File[];
    overrides?: SupplierPriceListOverrides;
  }): Promise<{ excel?: any; pdf?: any }> => {
    const formData = new FormData();
    formData.append('supplierId', params.supplierId);
    params.files.forEach((file) => formData.append('files', file));
    appendSupplierPriceListOverrides(formData, params.overrides);

    const response = await apiClient.post('/admin/supplier-price-lists/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  uploadSupplierPriceLists: async (params: {
    supplierId: string;
    files: File[];
    overrides?: SupplierPriceListOverrides;
  }): Promise<{ uploadId: string; summary: any }> => {
    const formData = new FormData();
    formData.append('supplierId', params.supplierId);
    params.files.forEach((file) => formData.append('files', file));
    appendSupplierPriceListOverrides(formData, params.overrides);

    const response = await apiClient.post('/admin/supplier-price-lists/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getSupplierPriceListUploads: async (params: {
    supplierId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ uploads: any[]; pagination: any }> => {
    const queryParams = new URLSearchParams();
    if (params.supplierId) queryParams.append('supplierId', params.supplierId);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/supplier-price-lists?${queryParams.toString()}`);
    return response.data;
  },

  getSupplierPriceListUpload: async (id: string): Promise<{ upload: any }> => {
    const response = await apiClient.get(`/admin/supplier-price-lists/${id}`);
    return response.data;
  },

  getSupplierPriceListItems: async (params: {
    uploadId: string;
    status?: 'matched' | 'unmatched' | 'multiple' | 'suspicious';
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; pagination: any }> => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/supplier-price-lists/${params.uploadId}/items?${queryParams.toString()}`);
    return response.data;
  },

  downloadSupplierPriceListExport: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/admin/supplier-price-lists/${id}/export`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export default adminApi;
