import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { logInfo } from './helpers/log';

export function middleware(request: NextRequest) {
  logInfo('Incoming request:', {
    method: request.method,
    url: request.url,
    pathname: request.nextUrl.pathname,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
