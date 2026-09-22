import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Minimal production health check (docs/PRODUCTION-DEPLOYMENT.md, "Health
 * check"). Deliberately unauthenticated (a load balancer/orchestrator must
 * be able to call it with no session) and deliberately minimal - it proves
 * the app process is up and can reach Postgres, nothing else. It never
 * returns the database host/version, credentials, schema details, or any
 * environment variable - only a plain ok/degraded status per check, so it
 * carries no information an attacker could use.
 */
export async function GET() {
  let databaseOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  const status = databaseOk ? "ok" : "degraded";
  return NextResponse.json({ status, database: databaseOk ? "ok" : "unreachable" }, { status: databaseOk ? 200 : 503 });
}
