"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/tenant-auth";

/** Step 57 - a generic failure message covers every rejection reason (unknown email, wrong password, INVITED/SUSPENDED/DISABLED) - src/lib/tenant-auth.ts's authorize() never distinguishes them either, so no email-enumeration signal exists anywhere in this path. */
export async function tenantLoginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/portal",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/portal/login?error=1");
    }
    throw error;
  }
}

export async function tenantLogoutAction() {
  await signOut({ redirectTo: "/portal/login" });
}
