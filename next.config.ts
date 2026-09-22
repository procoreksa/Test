import type { NextConfig } from "next";

/**
 * Hardening (docs/SECURITY-REVIEW.md, "Security headers"): only headers
 * that are safe to turn on unconditionally, with no app-specific tuning
 * and no risk of breaking a normal server-rendered Next.js page (no
 * inline-script/style restrictions, unlike a real Content-Security-Policy
 * would impose). A full CSP needs staged rollout against this app's actual
 * script/style sources first - see docs/SECURITY-REVIEW.md for that plan -
 * so it is deliberately not added here.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
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
