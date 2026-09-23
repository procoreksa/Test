import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { shouldRevalidateTenantSession, refreshTenantSessionClaims } from "@/lib/tenant-session-refresh";
import { auditTenantLoginEvent, requestMetadata, verifyTenantCredentials } from "@/lib/tenant-credentials";

/**
 * A second, fully independent NextAuth instance for the Tenant Portal (see
 * docs/TENANT-PORTAL.md, "Principal separation"). This is deliberate, not
 * an oversight: reusing src/lib/auth.ts's `auth()` would force a tenant's
 * identity through the internal JWT shape (`role: UserRole`), which every
 * internal call site (`getCurrentUserRole()`, `can()`) trusts implicitly to
 * be an internal role. A separate instance, with its own JWT claim shape,
 * its own signing secret, and - critically - its own cookie name means an
 * internal staff session and a tenant session are two physically distinct
 * artifacts that can coexist in the same browser without ever being
 * confused for one another (Step 72). Never import `auth`/`signIn`/
 * `signOut` from src/lib/auth.ts into any /portal code path, and never
 * import this module's exports into any internal code path.
 */

declare module "next-auth" {
  interface Session {
    tenant: {
      id: string;
      organizationId: string;
      renterId: string;
      email: string;
    };
  }
}

interface TenantJwt {
  principalType: "TENANT";
  tenantAccountId: string;
  organizationId: string;
  renterId: string;
  email: string;
  verifiedAt?: number;
}

// Deliberately a distinct signing key from the internal NextAuth instance -
// derived from AUTH_SECRET (so no second required env var exists yet) but
// never equal to it, so a token from one instance can never be replayed
// against the other even if a cookie name were somehow reused. A
// production deployment may set TENANT_AUTH_SECRET explicitly to use a
// wholly independent secret instead.
const TENANT_AUTH_SECRET = process.env.TENANT_AUTH_SECRET ?? `${process.env.AUTH_SECRET ?? ""}::tenant-portal`;

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: TENANT_AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/portal/login" },
  trustHost: true,
  basePath: "/api/portal-auth",
  cookies: {
    // Distinct name from the internal instance's default
    // (`authjs.session-token`) - this is the actual mechanism that keeps
    // the two sessions from ever colliding in the same browser (Step 72),
    // not just a naming convention.
    sessionToken: {
      name: "tenant-portal.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        // Deliberately NOT scoped by organizationId (a tenant doesn't pick
        // an organization to log into) - emailNormalized is unique per
        // organization, but a tenant portal login is a single global
        // email lookup, same as the internal login form's own
        // `findFirst({ email })` pattern before it narrows by org.
        const { ipAddress, userAgent } = requestMetadata(request);
        return verifyTenantCredentials(email, password, { ipAddress, userAgent });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const t = token as typeof token & TenantJwt;
      if (user) {
        t.principalType = "TENANT";
        t.tenantAccountId = user.id as string;
        t.organizationId = (user as { organizationId: string }).organizationId;
        t.renterId = (user as { renterId: string }).renterId;
        t.email = (user as { email: string }).email;
        t.verifiedAt = Date.now();
        return t;
      }

      if (t.principalType !== "TENANT") return null;

      // Same staleness-bounding pattern as the internal session (Step 7):
      // a suspended/disabled account loses access within
      // TENANT_SESSION_REVALIDATE_INTERVAL_MS, never waiting out the JWT's
      // full maxAge.
      if (shouldRevalidateTenantSession(t.verifiedAt)) {
        const fresh = await refreshTenantSessionClaims(t.tenantAccountId);
        if (!fresh) return null;
        t.organizationId = fresh.organizationId;
        t.renterId = fresh.renterId;
        t.email = fresh.email;
        t.verifiedAt = Date.now();
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as typeof token & TenantJwt;
      session.tenant = { id: t.tenantAccountId, organizationId: t.organizationId, renterId: t.renterId, email: t.email };
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? (message.token as (Partial<TenantJwt> & Record<string, unknown>) | null | undefined) : null;
      if (!token?.organizationId || !token.tenantAccountId) return;
      await auditTenantLoginEvent({ action: "LOGOUT", organizationId: token.organizationId, tenantAccountId: token.tenantAccountId, email: token.email });
    },
  },
});
