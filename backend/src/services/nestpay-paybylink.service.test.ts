import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderStatusXml,
  buildPayByLinkXml,
  classifyNestpayResponse,
  parseNestpayResponse,
} from './nestpay-paybylink.service';

const settings = {
  configured: true,
  enabled: true,
  apiUrl: 'https://sanalpos2.ziraatbank.com.tr/fim/api',
  merchantId: 'merchant',
  terminalId: 'terminal',
  apiUsername: 'api-user',
  apiPassword: 'p<&word',
  okUrl: 'https://example.com/ok',
  failUrl: 'https://example.com/fail',
  callbackUrl: 'https://example.com/callback',
  origin: '',
  merchantIp: '',
  bankName: 'Ziraat Bankasi',
  merchantDisplayName: 'Bakircilar',
  expiryValue: 1,
  expiryUnit: 'D',
  minAmount: 1,
  maxAmount: 1_000_000,
  maxBalanceAgeHours: 96,
  requestTimeoutMs: 30_000,
} as const;

test('PayByLink XML uses hosted single-use non-editable payment fields', () => {
  const xml = buildPayByLinkXml({
    orderId: 'B2B-PAY-1',
    amount: 123.45,
    customerName: 'A & B <Ltd>',
    customerCode: '120.01',
    phone: '+90 (532) 000 00 00',
    email: 'test@example.com',
    description: 'Cari bakiye odemesi',
    okUrl: settings.okUrl,
    failUrl: settings.failUrl,
    callbackUrl: settings.callbackUrl,
  }, settings);
  assert.match(xml, /<PAYMENTLINKTYPE>SINGLE_LINK_PAYMENT<\/PAYMENTLINKTYPE>/);
  assert.match(xml, /<Ecom_Transaction_Type>Auth<\/Ecom_Transaction_Type>/);
  assert.match(xml, /<Ecom_Payment_Amount>123\.45<\/Ecom_Payment_Amount>/);
  assert.match(xml, /<PAYMENTLINKAMOUNT_EDITABLE>false<\/PAYMENTLINKAMOUNT_EDITABLE>/);
  assert.match(xml, /A &amp; B &lt;Ltd&gt;/);
  assert.doesNotMatch(xml, /<CardNumber>|<StoreKey>/);
});

test('order status XML escapes credentials and requests QUERY', () => {
  const xml = buildOrderStatusXml('ORDER<&1', settings);
  assert.match(xml, /<ORDERSTATUS>QUERY<\/ORDERSTATUS>/);
  assert.match(xml, /p&lt;&amp;word/);
  assert.match(xml, /ORDER&lt;&amp;1/);
});

test('response parser accepts only a Ziraat HTTPS payment URL', () => {
  const parsed = parseNestpayResponse('<PayResponse><Response>Approved</Response><Ecom_Transaction_ReturnCode>00</Ecom_Transaction_ReturnCode><PAYMENTLINKURL>https://sanalpos2.ziraatbank.com.tr/fim/pay-by-link?token=abc&amp;x=1</PAYMENTLINKURL></PayResponse>');
  assert.equal(parsed.paymentUrl, 'https://sanalpos2.ziraatbank.com.tr/fim/pay-by-link?token=abc&x=1');
  const unsafe = parseNestpayResponse('<PayResponse><Response>Approved</Response><URL>https://attacker.example/pay</URL></PayResponse>');
  assert.equal(unsafe.paymentUrl, null);
});

test('status classifier never treats redirect-like data alone as success', () => {
  assert.equal(classifyNestpayResponse({ response: 'Approved', returnCode: '00', transactionStatus: 'S' }), 'SUCCEEDED');
  assert.equal(classifyNestpayResponse({ response: 'Approved', returnCode: '00', transactionStatus: '' }), 'UNKNOWN');
  assert.equal(classifyNestpayResponse({ response: 'Approved', returnCode: '', transactionStatus: '' }), 'UNKNOWN');
  assert.equal(classifyNestpayResponse({ response: '', returnCode: '', transactionStatus: 'PN' }), 'PENDING');
  assert.equal(classifyNestpayResponse({ response: 'Error', returnCode: '99', transactionStatus: 'D' }), 'FAILED');
});

test('order-status payload fields are parsed from documented Extra tags', () => {
  const parsed = parseNestpayResponse('<CC5Response><Response>Approved</Response><ProcReturnCode>00</ProcReturnCode><OrderId>B2B1</OrderId><Extra><TRANS_STAT>S</TRANS_STAT><TRANS_ID>T1</TRANS_ID><AUTH_CODE>A1</AUTH_CODE><HOST_REF_NUM>H1</HOST_REF_NUM></Extra></CC5Response>');
  assert.equal(parsed.state, 'SUCCEEDED');
  assert.equal(parsed.transactionId, 'T1');
  assert.equal(parsed.authCode, 'A1');
  assert.equal(parsed.hostReference, 'H1');
});
