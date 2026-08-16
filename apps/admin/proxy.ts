import { NextRequest, NextResponse } from "next/server";

// See apps/web/proxy.ts for the full rationale — same nonce + CSP
// pattern, simplified: admin has no Stripe/Maps embeds and no hand-authored
// inline <script>, only Next's own framework-injected RSC streaming scripts,
// which pick up the nonce automatically from the CSP header.
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// Derive the real API origin from the same env var the client bundle uses —
// see apps/web/proxy.ts for why hardcoding the prod hostname is wrong.
const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://api.techstopuk.com");
const apiHttpOrigin = apiUrl.origin;
const apiWsOrigin = `${apiUrl.protocol === "https:" ? "wss:" : "ws:"}//${apiUrl.host}`;
const storageOrigin = process.env.GARAGE_PUBLIC_URL
  ? new URL(process.env.GARAGE_PUBLIC_URL).origin
  : "https://storage.techstopuk.com";

function buildCsp(nonce: string): string {
  const scriptSrc = `script-src 'self' 'unsafe-inline' 'unsafe-eval'`;

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    // blob: is needed for local object-URL previews of user-uploaded photos.
    `img-src 'self' data: blob: ${storageOrigin} https://*.techstopuk.com`,
    `font-src 'self'`,
    // storageOrigin is needed here (not just in img-src) because uploads go
    // directly from the browser to storage via a presigned PUT URL.
    `connect-src 'self' ${apiHttpOrigin} ${apiWsOrigin} ${storageOrigin} https://api.techstopuk.com wss://api.techstopuk.com https://*.techstopuk.com wss://*.techstopuk.com`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|Icon/).*)",
  ],
};
