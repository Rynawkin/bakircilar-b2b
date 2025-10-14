import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://139.59.133.81:5000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const pathString = path.join('/');

  // Forward query parameters
  const searchParams = request.nextUrl.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';
  const url = `${BACKEND_URL}/api/${pathString}${queryString}`;

  // Get body if exists
  let body = undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
  }

  // Forward headers
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!key.startsWith('x-') && key !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
    });

    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Backend connection failed' },
      { status: 502 }
    );
  }
}
