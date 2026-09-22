import { vi } from "vitest";

/**
 * Real DB tests call actual server actions outside of a Next.js request
 * (there is no incoming HTTP request/render pass in a vitest run), so
 * Next's request-scoped APIs (`cookies()`, `revalidatePath()`) throw
 * "called outside a request scope" if left real. Every action under test
 * calls at least one of these unconditionally (getLocale() for bilingual
 * error messages, revalidatePath() after a successful mutation) - none of
 * that is part of what these tests verify (authorization, cross-tenant
 * isolation, financial math), so both are stubbed out here rather than
 * mocked per test file.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));
