import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public: shared video viewer, static assets, auth endpoints
  if (
    pathname === '/' ||
    pathname.startsWith('/v/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('studio_auth')?.value;
  if (ADMIN_PASSWORD && cookie === ADMIN_PASSWORD) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
