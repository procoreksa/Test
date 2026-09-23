import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { shouldRevalidateOwnerSession, refreshOwnerSessionClaims } from "@/lib/owner-session-refresh";
import { auditOwnerLoginEvent, requestMetadata, verifyOwnerCredentials } from "@/lib/owner-credentials";

/**
 * A third, fully independent NextAuth instance - the Owner Portal's own
 * (see docs/OWNER-PORTAL.md, "Principal separation"). An owner is neither
 * an internal staff user nor a tenant principal: this is deliberately its
 * own instance, not a `principalType: TENANT | OWNER` union bolted onto
 * src/lib/tenant-auth.ts for convenience. Its own JWT claim shape, its own
 * signing secret, and - critically - its own cookie name mean an internal
 * staff session, a tenant session, and an owner session are three
 * physically distinct artifacts that can all coexist in the same browser
 * without ever being confused for one another. Never import `auth`/
 * `signIn`/`signOut` from src/lib/auth.ts or src/lib/tenant-auth.ts into
 * any /owner-portal code path, and never import this module's exports
 * into any internal or tenant code path.
 */

declare module "next-auth" {
  interface Session {
    owner: {
      id: string;
      organizationId: string;
      ownerId: string;
      email: string;
    };
  }
}

interface OwnerJwt {
  principalType: "OWNER";
  ownerAccountId: string;
  organizationId: string;
  ownerId: string;
  email: string;
  verifiedAt?: number;
}

// Deliberately a distinct signing key from both the internal and tenant
// NextAuth instances - derived from AUTH_SECRET (so no third required env
// var exists yet) but never equal to either sibling secret, so a token
// from one instance can never be replayed against another even if a
// cookie name were somehow reused. A production deployment may set
// OWNER_AUTH_SECRET explicitly to use a wholly independent secret instead.
const OWNER_AUTH_SECRET = process.env.OWNER_AUTH_SECRET ?? `${process.env.AUTH_SECRET ?? ""}::owner-portal`;

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: OWNER_AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/owner-portal/login" },
  trustHost: true,
  basePath: "/api/owner-portal-auth",
  cookies: {
    // Distinct name from both the internal instance's default
    // (`authjs.session-token`) and the tenant instance's own
    // (`tenant-portal.session-token`) - this is the actual mechanism that
    // keeps all three sessions from ever colliding in the same browser,
    // not just a naming convention.
    sessionToken: {
      name: "owner-portal.session-token",
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
        // Deliberately NOT scoped by organizationId (an owner doesn't pick
        // an organization to log into) - emailNormalized is unique per
        // organization, but an owner portal login is a single global
        // email lookup, mirroring the tenant portal login's own pattern.
        const { ipAddress, userAgent } = requestMetadata(request);
        return verifyOwnerCredentials(email, password, { ipAddress, userAgent });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const t = token as typeof token & OwnerJwt;
      if (user) {
        t.principalType = "OWNER";
        t.ownerAccountId = user.id as string;
        t.organizationId = (user as { organizationId: string }).organizationId;
        t.ownerId = (user as { ownerId: string }).ownerId;
        t.email = (user as { email: string }).email;
        t.verifiedAt = Date.now();
        return t;
      }

      if (t.principalType !== "OWNER") return null;

      // Same staleness-bounding pattern as the internal/tenant sessions:
      // a suspended/disabled account loses access within
      // OWNER_SESSION_REVALIDATE_INTERVAL_MS, never waiting out the JWT's
      // full maxAge. Ownership itself is never cached here - see
      // src/lib/owner-session-refresh.ts's own doc comment.
      if (shouldRevalidateOwnerSession(t.verifiedAt)) {
        const fresh = await refreshOwnerSessionClaims(t.ownerAccountId);
        if (!fresh) return null;
        t.organizationId = fresh.organizationId;
        t.ownerId = fresh.ownerId;
        t.email = fresh.email;
        t.verifiedAt = Date.now();
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as typeof token & OwnerJwt;
      session.owner = { id: t.ownerAccountId, organizationId: t.organizationId, ownerId: t.ownerId, email: t.email };
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? (message.token as (Partial<OwnerJwt> & Record<string, unknown>) | null | undefined) : null;
      if (!token?.organizationId || !token.ownerAccountId) return;
      await auditOwnerLoginEvent({ action: "LOGOUT", organizationId: token.organizationId, ownerAccountId: token.ownerAccountId, email: token.email });
    },
  },
});
