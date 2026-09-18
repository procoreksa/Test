import { auth } from "@/lib/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireOrgId(): Promise<string> {
  const session = await requireSession();
  return session.user.organizationId;
}
