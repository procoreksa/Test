import type { NextConfig } from "next";

/**
 * Content-Security-Policy (Prompt 23 hardening - carry-forward decision #4,
 * "SHOULD be resolved if compatible"). Inventoried against this app's
 * actual sources before writing this (see docs/PRODUCTION-SECURITY.md,
 * "Content-Security-Policy"): `next/font/google` self-hosts the Cairo font
 * at build time (no runtime request to fonts.googleapis.com - `font-src
 * 'self'` is sufficient), no third-party script/stylesheet/embed exists
 * anywhere in the codebase (confirmed by grep - no `next/script`, no
 * external `<link>`/`<script src>`, no analytics/CDN), and the only object
 * storage the app talks to (S3_COMPATIBLE) is a server-to-server call,
 * never a browser-loaded resource.
 *
 * **Known, deliberate limitation - documented per Critical Rule/Step 30's
 * "document any unsafe-inline/unsafe-eval limitation" instruction:**
 * `script-src`/`style-src` include `'unsafe-inline'` rather than a
 * nonce-based strict CSP. Next.js's App Router streams RSC payload chunks
 * via inline `<script>` tags injected progressively into the page (not
 * external files), and this app's chart library (Recharts) sets inline
 * `style=""` attributes extensively for tooltip/legend positioning -
 * both would break under a strict `'nonce-...' 'strict-dynamic'` policy.
 * Next's own nonce-based CSP additionally requires opting every page into
 * fully dynamic rendering (disabling static optimization app-wide), which
 * this hardening pass's own "do not deploy an overly-strict policy that
 * breaks runtime" constraint weighs against for a V1 pass. `'unsafe-eval'`
 * is added ONLY in development (React dev mode uses `eval` for
 * enhanced error stack reconstruction - never in a production build).
 * Even with `'unsafe-inline'` on those two directives, this CSP still
 * meaningfully restricts `object-src` (no plugins), `base-uri` (no
 * base-tag injection), `form-action` (no cross-origin form hijacking),
 * `frame-ancestors` (clickjacking, reinforcing `X-Frame-Options` below),
 * and blocks any accidental/injected reference to a genuinely third-party
 * script or stylesheet host.
 */
const isDev = process.env.NODE_ENV === "development";
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
];
if (!isDev) cspDirectives.push("upgrade-insecure-requests");
const contentSecurityPolicy = cspDirectives.join("; ");

/**
 * Hardening (docs/SECURITY-REVIEW.md, "Security headers"; CSP added in
 * Prompt 23 above). Safe to turn on unconditionally for a normal
 * server-rendered Next.js page.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
