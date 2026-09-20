import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { seedDemoData } from "@/lib/seed-demo-data";

/**
 * One-time bootstrap endpoint for environments where the deploy platform
 * can reach Postgres but the operator's own machine/network can't (e.g.
 * this assistant's sandboxed session only has outbound HTTPS). Gated by
 * AUTH_SECRET, which is already required for the app to run at all, so no
 * extra secret needs provisioning. Safe to leave in place — it's
 * idempotent (upserts fixed demo rows) and does nothing without the token.
 */
function isAuthorized(request: Request): boolean {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (!secret || tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await seedDemoData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
