"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/owner-auth";

/** A generic failure message covers every rejection reason (unknown email, wrong password, INVITED/SUSPENDED/DISABLED) - src/lib/owner-credentials.ts's verifyOwnerCredentials() never distinguishes them either, so no email-enumeration signal exists anywhere in this path. Mirrors src/lib/actions/portal/auth-actions.ts's own Tenant Portal precedent. */
export async function ownerLoginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/owner-portal",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/owner-portal/login?error=1");
    }
    throw error;
  }
}

export async function ownerLogoutAction() {
  await signOut({ redirectTo: "/owner-portal/login" });
}
