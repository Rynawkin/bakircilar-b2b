/**
 * API Proxy Route
 * Forwards all /api/* requests to the backend server
 * This avoids CORS and Mixed Content issues on Vercel
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return proxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, 'DELETE');
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, 'PATCH');
}

async function proxyRequest(request: NextRequest, method: string) {
  const isProtectedManagementReport = request.nextUrl.pathname.startsWith(
    '/api/management-profit-report/'
  );
  try {
    // Get the path after /api/
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);

    // Remove 'api' from the beginning
    pathSegments.shift();
    const backendPath = pathSegments.join('/');
    const queryString = url.search;

    // Build backend URL
    const backendFullUrl = `${BACKEND_URL}/api/${backendPath}${queryString}`;

    // Forward headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      // Skip host header
      if (key.toLowerCase() !== 'host') {
        headers[key] = value;
      }
    });

    // Get body for POST/PUT/PATCH
    let body: string | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      body = await request.text();
    }

    // Make request to backend
    const response = await fetch(backendFullUrl, {
      method,
      headers,
      body,
      // Bank callbacks may return a 303 to the customer payment page. Following
      // it server-side would leave the browser on /api/... and return HTML as an
      // API body; preserve the redirect for the browser instead.
      redirect: 'manual',
    });

    // Get response body
    const responseBody = await response.text();

    // Forward response
    const responseHeaders: Record<string, string> = {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    };
    // Preserve privacy/security semantics from protected public reports.
    // These headers are intentionally allowlisted instead of forwarding every
    // backend response header through the public proxy.
    for (const headerName of [
      'Cache-Control',
      'Pragma',
      'Expires',
      'X-Robots-Tag',
      'Referrer-Policy',
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
    ]) {
      const value = response.headers.get(headerName);
      if (value) responseHeaders[headerName] = value;
    }
    const location = response.headers.get('Location');
    if (location) responseHeaders.Location = location;

    const proxiedResponse = new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
    const responseHeadersWithCookies = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = responseHeadersWithCookies.getSetCookie?.()
      || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie') as string] : []);
    setCookies.forEach((cookie) => proxiedResponse.headers.append('set-cookie', cookie));
    return proxiedResponse;
  } catch (error: any) {
    console.error('[Proxy] Error:', error.message);
    if (isProtectedManagementReport) {
      return NextResponse.json(
        { error: 'Rapor servisine şu anda ulaşılamıyor.' },
        {
          status: 502,
          headers: {
            'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
            'X-Robots-Tag': 'noindex, nofollow, noarchive',
            'Referrer-Policy': 'no-referrer',
            'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff',
          },
        }
      );
    }
    return NextResponse.json(
      { error: 'Proxy error', message: error.message },
      { status: 500 }
    );
  }
}
