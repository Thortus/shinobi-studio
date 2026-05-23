import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';

function sessionToken(password: string): string {
  return createHmac('sha256', password).update('studio-session-v1').digest('hex');
}

function isValidSession(cookie: string | undefined, password: string): boolean {
  if (!cookie) return false;
  try {
    const expected = Buffer.from(sessionToken(password));
    const actual = Buffer.from(cookie);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (
    pathname === '/' ||
    pathname.startsWith('/v/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|gif|avif|css|js|woff|woff2|ttf)$/)
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('studio_auth')?.value;
  if (ADMIN_PASSWORD && isValidSession(cookie, ADMIN_PASSWORD)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
