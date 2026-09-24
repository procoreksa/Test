import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

/**
 * Public LIVENESS check (Prompt 23 - "liveness-vs-readiness-vs-operational
 * health distinction"). Answers exactly one question: "is the Node
 * process up and able to handle an HTTP request at all?" - nothing more.
 * Deliberately does NOT touch the database or any other dependency (that
 * belongs to /api/health/ready below) - a liveness probe that depends on
 * an external service can cause an orchestrator to kill/restart a
 * perfectly healthy process during a transient DB blip, which is exactly
 * the failure mode liveness checks exist to avoid.
 *
 * Coarse and unauthenticated by design (a load balancer/orchestrator must
 * be able to call it with no session): only `status`/`timestamp`/
 * `version` - never a database host, credentials, schema detail, queue
 * count, or organization count (Critical Rule 4/Step "public health
 * endpoint review").
 */
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString(), version: packageJson.version });
}
