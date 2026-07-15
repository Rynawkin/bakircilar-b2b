import { config } from '../config';

export type NestpayPaymentState = 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'UNKNOWN';

export type NestpayParsedResponse = {
  response: string;
  returnCode: string;
  errorCode: string;
  message: string;
  paymentUrl: string | null;
  transactionStatus: string;
  transactionId: string;
  authCode: string;
  hostReference: string;
  orderId: string;
  state: NestpayPaymentState;
};

export type PayByLinkInput = {
  orderId: string;
  amount: number;
  customerName: string;
  customerCode?: string | null;
  phone?: string | null;
  email?: string | null;
  description: string;
  okUrl: string;
  failUrl: string;
  callbackUrl: string;
};

export class NestpayGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly response?: NestpayParsedResponse
  ) {
    super(message);
    this.name = 'NestpayGatewayError';
  }
}

export const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const decodeXml = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const tagValue = (xml: string, name: string) => {
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const match = xml.match(pattern);
  if (!match) return '';
  return decodeXml(match[1].replace(/<[^>]+>/g, '').trim());
};

const firstTagValue = (xml: string, names: string[]) => {
  for (const name of names) {
    const value = tagValue(xml, name);
    if (value) return value;
  }
  return '';
};

const normalizePhone = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
};

const normalizeEmail = (value?: string | null) => {
  const email = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const safeBankUrl = (value: string) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (host !== 'sanalpos2.ziraatbank.com.tr' && !host.endsWith('.ziraatbank.com.tr')) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const extractPaymentUrl = (xml: string) => {
  const fromTag = firstTagValue(xml, [
    'PAYMENTLINKTOKEN',
    'PAYMENTLINK',
    'PAYMENTLINKURL',
    'PaymentLink',
    'PaymentLinkUrl',
    'PaymentUrl',
    'URL',
    'Url',
  ]);
  const safeFromTag = safeBankUrl(fromTag);
  if (safeFromTag) return safeFromTag;

  const candidates = decodeXml(xml).match(/https:\/\/[^\s<"']+/gi) || [];
  for (const candidate of candidates) {
    const safe = safeBankUrl(candidate);
    if (safe) return safe;
  }
  return null;
};

export const classifyNestpayResponse = (input: {
  response?: string;
  returnCode?: string;
  transactionStatus?: string;
}): NestpayPaymentState => {
  const response = String(input.response || '').trim().toUpperCase();
  const returnCode = String(input.returnCode || '').trim().toUpperCase();
  const transactionStatus = String(input.transactionStatus || '').trim().toUpperCase();

  if (['S', 'A', 'C'].includes(transactionStatus) && (returnCode === '00' || response === 'APPROVED')) {
    return 'SUCCEEDED';
  }
  if (transactionStatus === 'PN') return 'PENDING';
  if (['D', 'ERR', 'CNCL', 'V', 'R'].includes(transactionStatus)) return 'FAILED';
  if (response === 'ERROR' || (returnCode && returnCode !== '00')) return 'FAILED';
  return 'UNKNOWN';
};

export const parseNestpayResponse = (xml: string): NestpayParsedResponse => {
  const orderStatus = firstTagValue(xml, ['ORDERSTATUS', 'OrderStatus']);
  const orderStatusField = (name: string) => {
    const match = orderStatus.match(new RegExp(`(?:^|[\\t\\r\\n ])${name}:([^\\t\\r\\n ]+)`, 'i'));
    return match ? match[1].trim() : '';
  };
  const response = firstTagValue(xml, ['Response', 'Ecom_Transaction_Response']);
  const returnCode = firstTagValue(xml, ['ProcReturnCode', 'Ecom_Transaction_ReturnCode']);
  const errorCode = firstTagValue(xml, ['Ecom_Transaction_ErrorCode', 'ErrorCode']);
  const message = firstTagValue(xml, ['ErrMsg', 'Ecom_Transaction_ErrorText', 'ErrorMessage', 'Message']);
  const transactionStatus = firstTagValue(xml, ['TRANS_STAT', 'TransStat', 'TransactionStatus'])
    || orderStatusField('TRANS_STAT');
  return {
    response,
    returnCode,
    errorCode,
    message,
    paymentUrl: extractPaymentUrl(xml),
    transactionStatus,
    transactionId: firstTagValue(xml, ['TransId', 'TRANS_ID', 'TransactionId', 'Ecom_Transaction_ID'])
      || orderStatusField('TRANS_ID'),
    authCode: firstTagValue(xml, ['AuthCode', 'AUTH_CODE', 'Ecom_Transaction_AuthCode'])
      || orderStatusField('AUTH_CODE'),
    hostReference: firstTagValue(xml, ['HostRefNum', 'HOST_REF_NUM', 'HostReference', 'Ecom_Transaction_Reference'])
      || orderStatusField('HOST_REF_NUM'),
    orderId: firstTagValue(xml, ['OrderId', 'ORD_ID', 'Ecom_ConsumerOrderID'])
      || orderStatusField('ORD_ID'),
    state: classifyNestpayResponse({ response, returnCode, transactionStatus }),
  };
};

const tag = (name: string, value: unknown) => `<${name}>${escapeXml(value)}</${name}>`;

export const buildPayByLinkXml = (input: PayByLinkInput, settings = config.nestpay) => {
  const amountValue = Number(input.amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new NestpayGatewayError('Gecersiz odeme tutari.', 'INVALID_AMOUNT');
  }
  const amountText = amountValue.toFixed(2);
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const extra: string[] = [
    tag('PAYMENTLINKTYPE', 'SINGLE_LINK_PAYMENT'),
    tag('PAYMENTLINKEXPIRY', settings.expiryValue),
    tag('PAYMENTLINKEXPIRYUNIT', settings.expiryUnit),
    tag('PAYMENTLINKCALLBACKURL', input.callbackUrl),
    tag('PAYMENTLINKLANGUAGE', 'tr'),
    ...(phone ? [tag('PHONENUMBER', phone)] : []),
    ...(email ? [tag('EMAIL', email)] : []),
    tag('Ecom_ConsumerOrderID', input.orderId),
    tag('Ecom_Payment_Amount', amountText),
    tag('Ecom_Payment_CurrencyCode', '949'),
    tag('PAYMENTLINKFAILURL', input.failUrl),
    tag('PAYMENTLINKOKURL', input.okUrl),
    tag('PAYMENTLINKAMOUNT_EDITABLE', 'false'),
    tag('PAYMENTLINKADDRESS_EDITABLE', 'false'),
    tag('PAYMENTLINKCUSTOMERNAMEEDITABLE', 'false'),
    tag('PAYMENTLINKCUSTOMEREMAILEDITABLE', 'false'),
    tag('PAYMENTLINKCUSTOMERPHONEEDITABLE', 'false'),
    tag('PAYMENTLINKITEMDESCRIPTIONEDITABLE', 'false'),
    tag('ORDER_BILLTO_POSTAL_NAME', input.customerName),
    tag('ORDER_BILLTO_POSTAL_COMPANY', input.customerName),
    ...(phone ? [tag('ORDER_BILLTO_PHONE', phone)] : []),
    ...(email ? [tag('ORDER_BILLTO_EMAIL', email)] : []),
    `<OrderItemList><OrderItem>${tag('ItemNumber', '1')}${tag('ProductCode', input.customerCode || 'CARI-ODEME')}${tag('Id', input.orderId)}${tag('Desc', input.description)}${tag('Qty', '1')}${tag('Price', amountText)}${tag('Total', amountText)}</OrderItem></OrderItemList>`,
    ...(settings.origin ? [tag('ORIGIN', settings.origin)] : []),
    ...(settings.merchantIp ? [tag('MERCHANT_IP', settings.merchantIp)] : []),
  ];

  // Banka tutari YALNIZ kok seviyedeki Ecom_Payment_Amount'tan okur; Ecom_ExtraFields icindeki
  // kopya okunmaz (CORE-2009 "sifir tutar" hatasi; canli eksiltme testleriyle dogrulandi, 2026-07-15).
  return `<?xml version="1.0" encoding="UTF-8"?><PayRequest>${tag('Ecom_Merchant_ID', settings.merchantId)}${tag('Ecom_Merchant_User_Name', settings.apiUsername)}${tag('Ecom_Merchant_User_Password', settings.apiPassword)}${tag('Ecom_Terminal_ID', settings.terminalId)}${tag('Ecom_Transaction_Type', 'Auth')}${tag('Ecom_Payment_Amount', amountText)}<Ecom_ExtraFields>${extra.join('')}</Ecom_ExtraFields></PayRequest>`;
};

export const buildOrderStatusXml = (orderId: string, settings = config.nestpay) => (
  `<?xml version="1.0" encoding="UTF-8"?><CC5Request>${tag('Name', settings.apiUsername)}${tag('Password', settings.apiPassword)}${tag('ClientId', settings.merchantId)}${tag('OrderId', orderId)}<Extra>${tag('ORDERSTATUS', 'QUERY')}</Extra></CC5Request>`
);

class NestpayPayByLinkService {
  isConfigured() {
    return config.nestpay.configured;
  }

  isEnabled() {
    return config.nestpay.enabled;
  }

  private async postXml(xml: string) {
    if (!config.nestpay.enabled) {
      throw new NestpayGatewayError(
        config.nestpay.configured
          ? 'Online odeme gecici olarak devre disi.'
          : 'Online odeme banka ayarlari tamamlanmadi.',
        'GATEWAY_DISABLED'
      );
    }

    let endpoint: URL;
    try {
      endpoint = new URL(config.nestpay.apiUrl);
    } catch {
      throw new NestpayGatewayError('Banka API adresi gecersiz.', 'GATEWAY_CONFIG_INVALID');
    }
    if (endpoint.protocol !== 'https:' || endpoint.hostname.toLowerCase() !== 'sanalpos2.ziraatbank.com.tr') {
      throw new NestpayGatewayError('Banka API adresi izin verilen Ziraat alan adi degil.', 'GATEWAY_CONFIG_INVALID');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.nestpay.requestTimeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          accept: 'application/xml, text/xml, */*',
        },
        body: xml,
        signal: controller.signal,
      });
      const body = await response.text();
      const parsed = parseNestpayResponse(body);
      if (!response.ok) {
        throw new NestpayGatewayError(
          parsed.message || 'Banka servisine ulasilamadi.',
          'GATEWAY_HTTP_ERROR',
          parsed
        );
      }
      return parsed;
    } catch (error: any) {
      if (error instanceof NestpayGatewayError) throw error;
      if (error?.name === 'AbortError') {
        throw new NestpayGatewayError('Banka yaniti zaman asimina ugradi.', 'GATEWAY_TIMEOUT');
      }
      throw new NestpayGatewayError('Banka servisine baglanilamadi.', 'GATEWAY_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }

  private assertAuthenticated(result: NestpayParsedResponse) {
    const message = `${result.message} ${result.errorCode}`.toLowerCase();
    if (message.includes('not authenticated') || message.includes('core-2201')) {
      throw new NestpayGatewayError(
        'Ziraat PayByLink API kullanicisinin islem yetkisi bulunmuyor. Banka panelinde API kullanicisi ve PayByLink yetkisi kontrol edilmeli.',
        'GATEWAY_AUTHORIZATION_REQUIRED',
        result
      );
    }
  }

  async createPaymentLink(input: PayByLinkInput) {
    const result = await this.postXml(buildPayByLinkXml(input));
    this.assertAuthenticated(result);
    if (!result.paymentUrl) {
      throw new NestpayGatewayError(
        result.message || 'Banka odeme baglantisi olusturmadi.',
        'PAYMENT_LINK_NOT_CREATED',
        result
      );
    }
    return result;
  }

  async queryOrderStatus(orderId: string) {
    const result = await this.postXml(buildOrderStatusXml(orderId));
    this.assertAuthenticated(result);
    return result;
  }
}

export default new NestpayPayByLinkService();
