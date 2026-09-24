/**
 * Next.js instrumentation hook (Prompt 23 Step 3/88) - `register()` runs
 * exactly once when a new server instance starts, and must complete
 * before the server accepts any request (Next.js 15+, stable, both
 * Node.js/Turbopack runtimes; see node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/instrumentation.md). This is the
 * correct boundary for production config validation: it never runs during
 * `prisma generate`/`next build`'s static analysis, and never runs under
 * `vitest` - only at actual server startup, in every runtime (`next dev`,
 * `next start`, and whatever process manager a hosting platform uses).
 *
 * Deliberately restricted to the Node.js runtime (never the Edge runtime,
 * which this app doesn't use for anything requiring env validation) - see
 * the Next.js docs' own `NEXT_RUNTIME` guard pattern.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || !process.env.NEXT_RUNTIME) {
    const { assertValidProductionEnvironment } = await import("@/lib/env-validation");
    assertValidProductionEnvironment();
  }
}
