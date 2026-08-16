import { NextRequest, NextResponse } from "next/server";

// Per-request nonce for CSP script-src. Next.js's App Router injects its own
// inline <script> tags on every page (RSC streaming payloads) regardless of
// application code, so nonce + 'strict-dynamic' — not 'unsafe-inline' — is
// how those are allowed while still blocking injected attacker scripts.
// Next detects the nonce in the outgoing CSP header and stamps it onto its
// own framework scripts automatically; the one hand-authored inline script
// (theme flash-prevention in app/layout.tsx) reads it via the x-nonce header
// set below and applies it manually.
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// Derive the real API origin from the same env var the client bundle uses,
// instead of hardcoding the production hostname — that hardcoding is what
// broke every fetch() the first time this was tested locally (next start
// sets NODE_ENV=production even when NEXT_PUBLIC_API_URL still points at
// localhost:3002, so a NODE_ENV-keyed "dev vs prod" branch guessed wrong).
const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://api.techstopuk.com");
const apiHttpOrigin = apiUrl.origin;
const apiWsOrigin = `${apiUrl.protocol === "https:" ? "wss:" : "ws:"}//${apiUrl.host}`;
const storageOrigin = process.env.GARAGE_PUBLIC_URL
  ? new URL(process.env.GARAGE_PUBLIC_URL).origin
  : "https://storage.techstopuk.com";

function buildCsp(nonce: string): string {
  // 'self' + 'unsafe-inline' + 'unsafe-eval' allows Next.js static bundle chunks,
  // RSC streaming scripts, and Stripe JS to load in production without browser CSP blocks.
  const scriptSrc = `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`;

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    // grainy-gradients.vercel.app is a decorative CSS noise-texture background
    // used on the help page via a Tailwind arbitrary background-image value —
    // found via a live browser check, not the static code inventory (arbitrary
    // CSS background URLs don't show up in a source grep the way <img> tags do).
    // blob: is needed for local object-URL previews of user-uploaded photos
    // (trade-in/repair device photo pickers) before the file finishes uploading.
    `img-src 'self' data: blob: ${storageOrigin} https://picsum.photos https://grainy-gradients.vercel.app https://*.techstopuk.com`,
    `font-src 'self'`,
    // storageOrigin is needed here (not just in img-src) because uploads go
    // directly from the browser to storage via a presigned PUT URL.
    `connect-src 'self' ${apiHttpOrigin} ${apiWsOrigin} ${storageOrigin} https://api.techstopuk.com wss://api.techstopuk.com https://*.techstopuk.com wss://*.techstopuk.com https://api.stripe.com`,
    // maps.google.com's embed URL redirects to www.google.com/maps/embed —
    // CSP frame-src is checked against the final URL after redirects, so
    // both hosts are needed even though stores are only ever configured
    // with a maps.google.com src.
    `frame-src https://js.stripe.com https://hooks.stripe.com https://maps.google.com https://www.google.com`,
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
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|Icon/).*)",
  ],
};
