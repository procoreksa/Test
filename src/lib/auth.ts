import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AuditAction } from "@/lib/audit";
import { shouldRevalidateSession, refreshSessionClaims } from "@/lib/auth-session-refresh";

/**
 * Writes a LOGIN/LOGIN_FAILED/LOGOUT row directly via `prisma`, deliberately
 * NOT importing anything (value-level) from src/lib/audit.ts here: that
 * module imports requireSession()/requirePermission() from src/lib/
 * session.ts, which itself imports `auth` from this file - a real circular
 * import. `AuditAction` above is a type-only import (erased at compile
 * time, so it can't participate in that cycle) for type safety on the
 * action string; the write itself is a plain, minimal Prisma call since a
 * login event carries no sensitive previousValues/newValues to redact in
 * the first place. See docs/AUDIT-AND-FINANCIAL-CONTROLS.md, "Login
 * security events", for why this stays a standalone helper instead of
 * reusing writeAuditLog().
 */
async function auditLoginEvent(params: {
  action: Extract<AuditAction, "LOGIN" | "LOGIN_FAILED" | "LOGOUT">;
  organizationId: string;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        userEmail: params.userEmail ?? null,
        userRole: params.userRole ?? null,
        action: params.action,
        entityType: "Session",
        entityId: params.userId ?? params.userEmail ?? "unknown",
        metadata: params.metadata as Prisma.InputJsonValue,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch {
    // Never let audit logging break authentication itself.
  }
}

function requestMetadata(request?: Request) {
  if (!request) return { ipAddress: null, userAgent: null };
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor ? forwardedFor.split(",")[0].trim() : null,
    userAgent: request.headers.get("user-agent"),
  };
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      organizationId: string;
      organizationName: string;
    };
  }
}

interface AppJwt {
  userId: string;
  role: string;
  organizationId: string;
  organizationName: string;
  /** Epoch ms this token's role/organization were last re-verified against the database - see src/lib/auth-session-refresh.ts. */
  verifiedAt?: number;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Needed on any host that sits behind its own reverse proxy (Render,
  // Railway, Netlify, a VPS behind Nginx...). Vercel auto-trusts via its
  // own VERCEL env var, but other platforms don't, so this is set
  // unconditionally to keep the app portable across hosts.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const { ipAddress, userAgent } = requestMetadata(request);
        if (!email || !password) return null;

        const normalizedEmail = email.toLowerCase().trim();
        const user = await prisma.user.findFirst({
          where: { email: normalizedEmail, isActive: true },
          include: { organization: true },
        });
        if (!user) {
          // No matching user (or a matching-but-deactivated account) - there's
          // no organization to attribute this to, so per docs/AUDIT-AND-
          // FINANCIAL-CONTROLS.md this attempt is intentionally not written
          // to AuditLog (organizationId is required there, unlike userId/
          // userEmail/userRole). Never log the attempted password either way.
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await auditLoginEvent({
            action: "LOGIN_FAILED",
            organizationId: user.organizationId,
            userId: user.id,
            userEmail: user.email,
            userRole: user.role,
            ipAddress,
            userAgent,
            metadata: { attemptedEmail: normalizedEmail },
          });
          return null;
        }

        await auditLoginEvent({
          action: "LOGIN",
          organizationId: user.organizationId,
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          ipAddress,
          userAgent,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const t = token as typeof token & AppJwt;
      if (user) {
        t.userId = user.id as string;
        t.role = (user as { role: string }).role;
        t.organizationId = (user as { organizationId: string }).organizationId;
        t.organizationName = (user as { organizationName: string }).organizationName;
        t.verifiedAt = Date.now();
        return t;
      }

      // Hardening (docs/SECURITY-REVIEW.md, "Stale session / authentication
      // boundaries"): periodically re-verify this token's role/organization
      // against the database so a deactivated user, a changed role, or a
      // renamed organization takes effect without waiting for the JWT's
      // full 30-day maxAge to expire. Bounded to once per
      // SESSION_REVALIDATE_INTERVAL_MS rather than every request.
      if (shouldRevalidateSession(t.verifiedAt)) {
        const fresh = await refreshSessionClaims(t.userId);
        if (!fresh) return null;
        t.role = fresh.role;
        t.organizationId = fresh.organizationId;
        t.organizationName = fresh.organizationName;
        t.verifiedAt = Date.now();
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as typeof token & AppJwt;
      session.user.id = t.userId;
      session.user.role = t.role;
      session.user.organizationId = t.organizationId;
      session.user.organizationName = t.organizationName;
      return session;
    },
  },
  events: {
    // JWT-strategy sessions only ever hand this event a `token` (never a
    // `session`), and only when a session actually existed to sign out of.
    async signOut(message) {
      const token = "token" in message ? (message.token as (Partial<AppJwt> & Record<string, unknown>) | null | undefined) : null;
      if (!token?.organizationId) return;
      await auditLoginEvent({
        action: "LOGOUT",
        organizationId: token.organizationId,
        userId: token.userId,
        userRole: token.role,
      });
    },
  },
});
