import type { Prisma } from "@prisma/client";

/**
 * Step 55 - the handler contract. A handler is a pure-ish async function:
 * it receives validated context, does its own domain reads/writes (reusing
 * established domain logic - Critical Principle 5), and returns exactly one
 * of these four structured outcomes - never throws for an expected business
 * condition (an unexpected exception is still handled by the worker as a
 * RETRYABLE_FAILURE, but a handler that already knows "this is permanently
 * invalid" or "this is no longer eligible" should say so directly, not
 * throw).
 */
export type AutomationHandlerOutcome =
  | { kind: "COMPLETED" }
  | { kind: "SKIPPED"; reason: string }
  | { kind: "RETRYABLE_FAILURE"; errorCode: string; errorMessage: string }
  | { kind: "PERMANENT_FAILURE"; errorCode: string; errorMessage: string };

export interface AutomationHandlerContext {
  organizationId: string;
  jobId: string;
  jobKey: string;
  scheduledFor: Date;
  payloadVersion: number;
  payloadJson: Prisma.JsonValue;
}

export type AutomationHandler = (ctx: AutomationHandlerContext) => Promise<AutomationHandlerOutcome>;
