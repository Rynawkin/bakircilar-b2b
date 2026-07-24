import apiClient from './client';

const REPORT_API_BASE = '/api/management-profit-report';

export type ManagementProfitSort =
  | 'TOTAL_DESC'
  | 'TOTAL_ASC'
  | 'LABEL_ASC'
  | 'LABEL_DESC';

export type ManagementProfitRowFieldId =
  | 'CUSTOMER_SECTOR_CODE'
  | 'GROUP_NAME'
  | 'CUSTOMER_NAME'
  | 'STOCK';

export interface ManagementProfitLayout {
  schemaVersion: 1;
  rowFields: ManagementProfitRowFieldId[];
  columnField: 'MONTH';
  valueField: 'SALES_AMOUNT';
  defaultExpandedDepth: number;
  sort: ManagementProfitSort;
  showGrandTotal: boolean;
}

export const DEFAULT_MANAGEMENT_PROFIT_LAYOUT: ManagementProfitLayout = {
  schemaVersion: 1,
  rowFields: [
    'CUSTOMER_SECTOR_CODE',
    'GROUP_NAME',
    'CUSTOMER_NAME',
    'STOCK',
  ],
  columnField: 'MONTH',
  valueField: 'SALES_AMOUNT',
  defaultExpandedDepth: 0,
  sort: 'LABEL_ASC',
  showGrandTotal: true,
};

export interface ManagementProfitField {
  id: string;
  label: string;
}

export interface ManagementProfitView {
  link: {
    name: string;
    canSaveLayout: boolean;
  };
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
  layout: ManagementProfitLayout;
  revision: number;
  fields: {
    rows: ManagementProfitField[];
    columns: ManagementProfitField[];
    values: ManagementProfitField[];
  };
  fixedOptions: {
    currency: 'MAIN';
    includeDeliveryNotes: true;
  };
}

export interface ManagementProfitPathSegment {
  field: ManagementProfitRowFieldId;
  value: string;
}

export type ManagementProfitPath = ManagementProfitPathSegment[];

export interface ManagementProfitNode {
  id: string;
  label: string;
  value: string;
  level: number;
  path: ManagementProfitPath;
  amounts: Record<string, number>;
  grandTotal: number;
  hasChildren: boolean;
}

export interface ManagementProfitMonth {
  key: string;
  label: string;
}

export interface ManagementProfitQueryResponse {
  nodes: ManagementProfitNode[];
  months: ManagementProfitMonth[];
  grandTotal: number;
}

export type ManagementProfitLinkStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED';
export type ManagementProfitEffectiveLinkStatus =
  | ManagementProfitLinkStatus
  | 'EXPIRED';

export interface ManagementProfitAdminLink {
  id: string;
  name: string;
  tokenHint: string;
  status: ManagementProfitLinkStatus;
  effectiveStatus?: ManagementProfitEffectiveLinkStatus;
  canSaveLayout: boolean;
  expiresAt?: string | null;
  viewCount: number;
  lastViewedAt?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagementProfitLinkInput {
  name: string;
  pin: string;
  canSaveLayout?: boolean;
  expiresAt?: string | null;
}

export interface ManagementProfitLinkUpdate {
  name?: string;
  pin?: string;
  status?: ManagementProfitLinkStatus;
  canSaveLayout?: boolean;
  expiresAt?: string | null;
}

export interface ManagementProfitLinkSecret {
  link: ManagementProfitAdminLink;
  rawToken: string;
  publicPath: string;
}

type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
  details?: {
    code?: string;
    reportAccessCode?: string;
    [key: string]: unknown;
  };
};

export class ManagementProfitReportApiError extends Error {
  status: number;
  code?: string;
  details?: ApiErrorPayload['details'];

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: ApiErrorPayload['details']
  ) {
    super(message);
    this.name = 'ManagementProfitReportApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const readErrorPayload = async (response: Response): Promise<ApiErrorPayload> => {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
};

const publicRequest = async <T>(
  path: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(`${REPORT_API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    const code =
      payload.code ||
      payload.details?.reportAccessCode ||
      payload.details?.code;
    throw new ManagementProfitReportApiError(
      payload.error || payload.message || 'Rapor isteği tamamlanamadı.',
      response.status,
      code,
      payload.details
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const unwrapSecretResponse = (
  payload:
    | ManagementProfitLinkSecret
    | (Partial<ManagementProfitLinkSecret> & ManagementProfitAdminLink)
): ManagementProfitLinkSecret => {
  const link = 'link' in payload && payload.link ? payload.link : payload;
  return {
    link: link as ManagementProfitAdminLink,
    rawToken: String(payload.rawToken || ''),
    publicPath: String(payload.publicPath || ''),
  };
};

export const managementProfitPublicApi = {
  access: (token: string, pin: string) =>
    publicRequest<{ success?: boolean }>('/public/access', {
      method: 'POST',
      body: JSON.stringify({ token, pin }),
    }),

  view: () => publicRequest<ManagementProfitView>('/public/view'),

  query: (layout: ManagementProfitLayout, path: ManagementProfitPath = []) =>
    publicRequest<ManagementProfitQueryResponse>('/public/query', {
      method: 'POST',
      body: JSON.stringify({ layout, path }),
    }),

  saveLayout: (
    layout: ManagementProfitLayout,
    expectedRevision: number
  ) =>
    publicRequest<{
      layout: ManagementProfitLayout;
      revision: number;
    }>('/public/layout', {
      method: 'PUT',
      body: JSON.stringify({ layout, expectedRevision }),
    }),

  logout: () =>
    publicRequest<{ success?: boolean }>('/public/logout', {
      method: 'POST',
    }),
};

export const managementProfitAdminApi = {
  listLinks: async (): Promise<{ links: ManagementProfitAdminLink[] }> => {
    const response = await apiClient.get('/management-profit-report/admin/links');
    return response.data;
  },

  createLink: async (
    input: ManagementProfitLinkInput
  ): Promise<ManagementProfitLinkSecret> => {
    const response = await apiClient.post(
      '/management-profit-report/admin/links',
      input
    );
    return unwrapSecretResponse(response.data);
  },

  updateLink: async (
    id: string,
    input: ManagementProfitLinkUpdate
  ): Promise<{ link: ManagementProfitAdminLink }> => {
    const response = await apiClient.patch(
      `/management-profit-report/admin/links/${encodeURIComponent(id)}`,
      input
    );
    return response.data?.link ? response.data : { link: response.data };
  },

  rotateLink: async (
    id: string
  ): Promise<ManagementProfitLinkSecret> => {
    const response = await apiClient.post(
      `/management-profit-report/admin/links/${encodeURIComponent(id)}/rotate`
    );
    return unwrapSecretResponse(response.data);
  },
};

export default managementProfitPublicApi;
