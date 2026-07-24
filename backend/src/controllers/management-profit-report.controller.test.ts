import assert from 'node:assert/strict';
import test from 'node:test';
import { NextFunction, Request, Response } from 'express';
import managementProfitReportService from '../services/management-profit-report.service';
import managementProfitReportController from './management-profit-report.controller';

test('public authorize forwards the requested period and creates the signed-session cookie', async () => {
  const period = {
    startDate: '2025-08-01',
    endDate: '2026-07-24',
  };
  const originalAuthorize = managementProfitReportService.authorize;
  const calls: unknown[][] = [];
  const cookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];
  let responseBody: unknown;
  let nextError: unknown;

  (managementProfitReportService as any).authorize = async (
    ...args: unknown[]
  ) => {
    calls.push(args);
    return {
      sessionToken: 'signed-custom-period-session',
      expiresInMs: 1234,
    };
  };

  const req = {
    body: {
      token: 'public-link-token',
      pin: '123456',
      period,
    },
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: () => 'test-browser',
  } as unknown as Request;
  const res = {
    set: () => undefined,
    cookie: (
      name: string,
      value: string,
      options: Record<string, unknown>
    ) => {
      cookies.push({ name, value, options });
    },
    json: (body: unknown) => {
      responseBody = body;
    },
  } as unknown as Response;
  const next: NextFunction = (error?: unknown) => {
    nextError = error;
  };

  try {
    await managementProfitReportController.authorize(req, res, next);
  } finally {
    (managementProfitReportService as any).authorize = originalAuthorize;
  }

  assert.equal(nextError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], 'public-link-token');
  assert.equal(calls[0]?.[1], '123456');
  assert.deepEqual(calls[0]?.[3], period);
  assert.deepEqual(responseBody, { success: true, expiresInMs: 1234 });
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.name, 'b2b_mpr_access');
  assert.equal(cookies[0]?.value, 'signed-custom-period-session');
  assert.equal(
    cookies[0]?.options.path,
    '/api/management-profit-report/public'
  );
  assert.equal(cookies[0]?.options.httpOnly, true);
});
