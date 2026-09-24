import type { CommunicationChannel } from "@prisma/client";
import type { CommunicationProvider } from "./types";
import { MockEmailProvider, MockWhatsAppProvider } from "./mock";

const mockEmailProvider = new MockEmailProvider();
const mockWhatsAppProvider = new MockWhatsAppProvider();

/**
 * Provider selection - the only place in the codebase that decides which
 * concrete provider handles a channel. Always the deterministic mock
 * unless a real provider is both configured (an API key/credential env var
 * present) AND explicitly enabled - neither exists in this environment, so
 * this always resolves to mock today (Critical Principle 6). Adding a real
 * adapter later means implementing CommunicationProvider and returning it
 * here when its env vars are present; no other file in this module changes.
 */
export function getProviderForChannel(channel: CommunicationChannel): CommunicationProvider {
  switch (channel) {
    case "EMAIL":
      return mockEmailProvider;
    case "WHATSAPP":
      return mockWhatsAppProvider;
    default: {
      const exhaustiveCheck: never = channel;
      throw new Error(`No provider configured for channel: ${exhaustiveCheck}`);
    }
  }
}
