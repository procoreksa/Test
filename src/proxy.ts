import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  // The Tenant Portal (docs/TENANT-PORTAL.md) is a second, independent
  // security principal with its own auth instance (src/lib/tenant-auth.ts)
  // and its own protected-route boundary (requireTenantSession(), enforced
  // in src/app/portal/(portal)/layout.tsx). This internal-staff gate must
  // never touch /portal/* at all - checking `req.auth` (the INTERNAL
  // session only) against a tenant's request would incorrectly redirect
  // every tenant, including on the public /portal/login page itself, to
  // the internal /login page. Excluded here rather than via the matcher
  // below so the exclusion is explicit and easy to find next to the rest
  // of this gate's logic.
  if (req.nextUrl.pathname.startsWith("/portal")) {
    return NextResponse.next();
  }

  // Same reasoning as /portal above, for the Owner Portal's own independent
  // principal (src/lib/owner-auth.ts, src/app/owner-portal/(portal)/layout.tsx,
  // docs/OWNER-PORTAL.md) - an owner is neither an internal staff user nor a
  // tenant, and must never be checked against the internal session either.
  if (req.nextUrl.pathname.startsWith("/owner-portal")) {
    return NextResponse.next();
  }

  const isLoggedIn = Boolean(req.auth);
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Exclude API routes, Next internals, and any static file under /public
  // (anything with a file extension, e.g. /logo.jpg, /icon.jpg) — those
  // must be reachable unauthenticated, including by Next's own image
  // optimizer, which otherwise gets a login-page redirect instead of the
  // image and fails with "isn't a valid image".
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
