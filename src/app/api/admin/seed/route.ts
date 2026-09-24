import { NextResponse } from "next/server";
import { isAuthorizedWorkerRequest } from "@/lib/security/worker-auth";
import { seedDemoData } from "@/lib/seed-demo-data";
import { handleWorkerRouteError } from "@/lib/api-error";
import { logSecurityEvent } from "@/lib/logging";

/**
 * One-time bootstrap endpoint for environments where the deploy platform
 * can reach Postgres but the operator's own machine/network can't.
 *
 * Hardening (Prompt 23 Step 87/89 - "seed/reset safety", "debug/test-route
 * audit"): this route used to reuse `AUTH_SECRET` (the session-signing
 * secret) as its own gate and accept `GET` - both directly violate this
 * phase's rules ("never reuse the user-auth secret as a worker secret",
 * "mutating endpoints must be POST-only, no GET execution"). It now:
 *   1. Requires its own dedicated `ADMIN_SEED_SECRET` - a leak of one
 *      secret (or of `AUTH_SECRET`) no longer compromises the other.
 *   2. Is `POST`-only.
 *   3. Fails closed in production: refuses to run at all when
 *      `NODE_ENV === "production"` unless an operator has also explicitly
 *      set `ALLOW_PRODUCTION_SEED=true` - a demo-data upsert endpoint has
 *      no legitimate reason to be reachable in a real production
 *      deployment holding real tenant data, and this default keeps it
 *      closed even if `ADMIN_SEED_SECRET` were ever guessed/leaked.
 * Still idempotent (upserts fixed demo rows) and still does nothing
 * without the secret.
 */
function isAuthorized(request: Request): boolean {
  return isAuthorizedWorkerRequest(request, process.env.ADMIN_SEED_SECRET);
}

function isAllowedInThisEnvironment(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_PRODUCTION_SEED === "true";
}

export async function POST(request: Request) {
  if (!isAllowedInThisEnvironment()) {
    logSecurityEvent("admin_seed.blocked_in_production");
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await seedDemoData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleWorkerRouteError("admin.seed.failed", error);
  }
}

// Explicitly no GET handler: a data-mutating (upserting) endpoint must
// never be reachable by a bare navigation/link/bot crawl (Step 24 -
// "mutating/executing endpoints POST-only, no GET execution").
