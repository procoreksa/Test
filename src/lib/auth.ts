import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findFirst({
          where: { email: email.toLowerCase().trim(), isActive: true },
          include: { organization: true },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

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
});
