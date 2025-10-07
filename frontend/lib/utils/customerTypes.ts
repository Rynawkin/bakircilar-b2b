/**
 * Customer Type Display Names
 */

export const CUSTOMER_TYPE_NAMES: Record<string, string> = {
  BAYI: 'A Segment',
  PERAKENDE: 'B Segment',
  VIP: 'C Segment',
  OZEL: 'D Segment',
};

export const getCustomerTypeName = (type: string): string => {
  return CUSTOMER_TYPE_NAMES[type] || type;
};

export const CUSTOMER_TYPES = [
  { value: 'BAYI', label: 'A Segment' },
  { value: 'PERAKENDE', label: 'B Segment' },
  { value: 'VIP', label: 'C Segment' },
  { value: 'OZEL', label: 'D Segment' },
];
