import type { CommunicationProvider, ProviderSendInput, ProviderSendResult } from "./types";

/**
 * Deterministic mock providers (Critical Principle 6: no real provider is
 * required to build and exercise the full send/retry/failure architecture).
 * Behavior is driven purely by a marker substring in the destination, so
 * unit/DB tests and a live manual test-send can force each of the three
 * scenarios a real provider can return, without any network access or
 * randomness in the failure path itself:
 *
 *  - destination contains "mockpermfail"  -> a permanent failure
 *  - destination contains "mockretryfail" -> a retryable failure
 *  - anything else                        -> success
 */
export const MOCK_PERMANENT_FAILURE_MARKER = "mockpermfail";
export const MOCK_RETRYABLE_FAILURE_MARKER = "mockretryfail";

function mockSend(providerName: string, input: ProviderSendInput): ProviderSendResult {
  if (input.destination.includes(MOCK_PERMANENT_FAILURE_MARKER)) {
    return {
      success: false,
      errorCode: "INVALID_RECIPIENT",
      errorMessage: `${providerName}: recipient rejected (mock permanent failure).`,
    };
  }
  if (input.destination.includes(MOCK_RETRYABLE_FAILURE_MARKER)) {
    return {
      success: false,
      errorCode: "PROVIDER_TIMEOUT",
      errorMessage: `${providerName}: provider timed out (mock retryable failure).`,
    };
  }
  return {
    success: true,
    providerMessageId: `${providerName}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export class MockEmailProvider implements CommunicationProvider {
  readonly name = "mock-email";
  readonly channel = "EMAIL" as const;

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    return mockSend(this.name, input);
  }
}

export class MockWhatsAppProvider implements CommunicationProvider {
  readonly name = "mock-whatsapp";
  readonly channel = "WHATSAPP" as const;

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    return mockSend(this.name, input);
  }
}
