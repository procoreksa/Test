import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateProductionEnvironment } from "@/lib/env-validation";

/**
 * Public READINESS check (Prompt 23 - "readiness endpoint"). Answers "can
 * this instance actually serve real traffic right now?" - checked once
 * per orchestrator readiness probe (typically every few seconds), so
 * deliberately kept to cheap checks only, never a deep/expensive scan
 * (Step: "no expensive deep checks per request"):
 *
 *   1. Database reachable (`SELECT 1` - the same minimal check the old
 *      single /api/health endpoint used to do).
 *   2. Required production configuration valid - reuses the exact same
 *      validateProductionEnvironment() check src/instrumentation.ts uses
 *      at startup (Step 3), so a readiness probe also catches a
 *      misconfiguration introduced by a config change after the process
 *      already started (e.g. a secret rotated out from under a running
 *      instance) - outside production this check is always a no-op pass.
 *
 * Still coarse in its response: `status`/`timestamp` and a per-check
 * ok/fail flag only - never the actual missing variable names or database
 * error detail (that level of detail belongs to the protected operational
 * health endpoint, /api/ops/health, for an authenticated operator only).
 */
export async function GET() {
  let databaseOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  // Outside production this check is always a no-op pass (dev/test
  // environments are never expected to have DOCUMENT_S3_*/production-
  // grade secrets configured, and correctly run on LOCAL_DEV storage).
  const configOk = process.env.NODE_ENV !== "production" || validateProductionEnvironment().ok;
  const ready = databaseOk && configOk;

  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", timestamp: new Date().toISOString(), checks: { database: databaseOk, config: configOk } },
    { status: ready ? 200 : 503 }
  );
}
