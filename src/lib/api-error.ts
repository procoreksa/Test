import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { logError } from "@/lib/logging";

/**
 * The safe error shape every worker/protected-API route in this codebase
 * returns instead of a raw exception message (Critical Rule 4 / Prompt 23
 * Step 28-29). Before this, every worker route's catch block returned
 * `error instanceof Error ? error.message : String(error)` directly in the
 * JSON body - a real Prisma/Node error message can include internal
 * details (table/column names, file paths, occasionally connection-string
 * fragments) that must never reach an API response.
 *
 * The caller gets a stable, non-leaking `{ ok: false, error, correlationId }`
 * body; the real error (already redacted by logError()/logging.ts) is
 * written to the structured log under the same `correlationId`, so an
 * operator with log access can look it up without the response itself
 * ever carrying it.
 */
export function handleWorkerRouteError(event: string, error: unknown): NextResponse {
  const correlationId = randomUUID();
  logError(event, error, { correlationId });
  return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", correlationId }, { status: 500 });
}
