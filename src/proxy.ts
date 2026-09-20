import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
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
