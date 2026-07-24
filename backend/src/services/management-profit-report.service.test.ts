import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import config from '../config';
import managementProfitReportService from './management-profit-report.service';

const service = managementProfitReportService as any;

test('management report PIN and signed session guards reject tampering', async () => {
  const pinHash = await service.hashPin('123456');
  assert.equal(await service.verifyPin('123456', pinHash), true);
  assert.equal(await service.verifyPin('654321', pinHash), false);

  const token = service.signSession(
    { id: 'link-test', sessionVersion: 7 },
    'browser-a'
  );
  const decoded = service.decodeSession(token, 'browser-a');
  assert.equal(decoded?.linkId, 'link-test');
  assert.equal(decoded?.version, 7);
  assert.match(decoded?.period?.startDate || '', /^\d{4}-\d{2}-01$/);
  assert.equal(service.decodeSession(token, 'browser-b'), null);

  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(service.decodeSession(tampered, 'browser-a'), null);

  const [encoded] = token.split('.');
  const expiredPayload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8')
  );
  expiredPayload.expiresAt = Date.now() - 1;
  const expiredEncoded = Buffer.from(
    JSON.stringify(expiredPayload)
  ).toString('base64url');
  const expiredSignature = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(expiredEncoded)
    .digest('base64url');
  assert.equal(
    service.decodeSession(
      `${expiredEncoded}.${expiredSignature}`,
      'browser-a'
    ),
    null
  );
});

test('management report signed session keeps a valid custom period fixed', () => {
  const period = {
    preset: 'CUSTOM',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    label: '1 Ocak 2025 – 31 Aralık 2025',
    timeZone: 'Europe/Istanbul',
  };
  const token = service.signSession(
    { id: 'link-custom-period', sessionVersion: 3 },
    'browser-a',
    period
  );
  assert.deepEqual(service.decodeSession(token, 'browser-a')?.period, period);

  const invalidPeriodToken = service.signSession(
    { id: 'link-invalid-period', sessionVersion: 1 },
    'browser-a',
    {
      ...period,
      startDate: '2024-12-01',
    }
  );
  assert.equal(service.decodeSession(invalidPeriodToken, 'browser-a'), null);
});

test('PIN client throttle identity cannot be split by changing User-Agent', () => {
  const first = service.clientHash({
    ip: '203.0.113.10',
    userAgent: 'browser-a',
  });
  const second = service.clientHash({
    ip: '203.0.113.10',
    userAgent: 'browser-b',
  });
  const otherIp = service.clientHash({
    ip: '203.0.113.11',
    userAgent: 'browser-a',
  });
  assert.equal(first, second);
  assert.notEqual(first, otherIp);
});
