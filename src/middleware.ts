import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/auth'];

/**
 * Roles already looked up, keyed by the access token that proved them.
 *
 * Only ever consulted after `getUser()` has verified that same token, so it
 * cannot be used to get in; it only saves asking the database for a role that
 * has not had time to change. See lib/admin-guard for the same reasoning at
 * greater length — the two caches cannot be shared because middleware runs on
 * a different runtime from the routes.
 */
const TTL_MS = 15_000;
const roles = new Map<string, { at: number; role: string | null }>();

export async function middleware(request: NextRequest) {
  const { pathname: earlyPath } = request.nextUrl;

  // A CORS preflight carries no cookies and needs no session work — let the
  // route's own OPTIONS handler answer it.
  if (request.method === 'OPTIONS' && earlyPath.startsWith('/api')) {
    return NextResponse.next();
  }

  /*
   * API routes never redirect — they authenticate themselves and answer with
   * JSON, and this used to verify their token over the network first anyway,
   * adding a full round trip to Supabase to every single call before the route
   * had done anything. Their own client refreshes the session if it needs to,
   * so there is nothing left here for them.
   */
  if (earlyPath.startsWith('/api')) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes an expired session cookie. Must run before any auth check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Role decides which half of the app you are allowed in: admins live under
  // /admin, everyone else under the member routes. Nobody sees the other side.
  if (user) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const seen = token ? roles.get(token) : undefined;
    let role: string | null;

    if (seen && Date.now() - seen.at < TTL_MS) {
      role = seen.role;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      role = (profile?.role as string | null) ?? null;

      if (token) {
        if (roles.size > 500) roles.clear();
        roles.set(token, { at: Date.now(), role });
      }
    }

    const home = role === 'admin' ? '/admin' : '/';
    const inAdminArea = pathname.startsWith('/admin');
    const wrongArea = !isPublic && inAdminArea !== (home === '/admin');

    if ((isPublic && pathname !== '/auth/callback') || wrongArea) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // everything except static assets, images and the manifest
    '/((?!_next/static|_next/image|favicon.ico|img/|icons/|\\.well-known/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
