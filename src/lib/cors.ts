/**
 * CORS for the one endpoint the native app calls.
 *
 * Inside a Capacitor shell the page origin is not the API's origin — it is
 * `capacitor://localhost` on iOS and `http://localhost` on Android — so the
 * browser sends a preflight and blocks the POST unless we answer it.
 *
 * This is not an access control: anything can POST to a public endpoint with
 * curl, CORS only governs what *browsers* let scripts read cross-origin. The
 * allowlist is here to keep the surface tidy and explicit.
 */

const STATIC_ORIGINS = [
  'capacitor://localhost', // iOS shell
  'ionic://localhost', // older iOS shell
  'http://localhost', // Android shell
  'https://localhost', // Android shell, https scheme
  'http://localhost:5197', // Vite dev server for the mobile app
  'http://localhost:5195', // the web app itself
];

function allowed(origin: string | null): string | null {
  if (!origin) return null;
  if (STATIC_ORIGINS.includes(origin)) return origin;

  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (site && origin === site) return origin;

  // Vercel preview deployments of this project.
  if (/^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return origin;

  // Testing the native app on a real handset over the office wifi: the dev
  // server is reached at a LAN address. Never allowed in production.
  if (
    process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[\d.]+(?::\d+)?$/.test(origin)
  ) {
    return origin;
  }

  return null;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = allowed(request.headers.get('origin'));
  if (!origin) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Answer the preflight. */
export function preflight(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
