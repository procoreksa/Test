import type { CommunicationChannel } from "@prisma/client";

/**
 * The provider boundary. Business modules NEVER call this directly, and
 * NEVER call a vendor SDK (Resend, SendGrid, Twilio, WhatChimp, Meta Cloud
 * API, ...) directly either - only the queue processor
 * (src/lib/communications/processor.ts) calls a CommunicationProvider,
 * resolved via getProviderForChannel() (./factory.ts). This is the one
 * seam a real provider adapter is added behind in the future, without any
 * change to business-module code, the queue processor's control flow, or
 * this interface.
 */
export interface ProviderSendInput {
  /** Email address (EMAIL) or E.164 phone number (WHATSAPP). */
  destination: string;
  /** EMAIL only - undefined for channels with no subject line. */
  subject?: string;
  body: string;
  language: "en" | "ar";
}

export interface ProviderSendResult {
  success: boolean;
  /** The provider's own external message id - present on success, used for future webhook correlation. */
  providerMessageId?: string;
  /**
   * A normalized, provider-agnostic error code (see
   * src/lib/communications/retry.ts's classifyProviderError()) - never a
   * raw vendor SDK error object. Present only when success is false.
   */
  errorCode?: string;
  /** Sanitized - safe to persist and to display in the Communication Center UI, never a raw stack trace or vendor payload. */
  errorMessage?: string;
}

export interface CommunicationProvider {
  readonly name: string;
  readonly channel: CommunicationChannel;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}
