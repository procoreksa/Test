import { timingSafeEqual } from "crypto";

/**
 * Centralized timing-safe string comparison (Prompt 23 Step 22/62). Every
 * worker-route/seed-route secret check in this codebase used to inline its
 * own `Buffer.from` + `timingSafeEqual` pair (automation route-auth.ts,
 * communications/process/route.ts, admin/seed/route.ts) - correct on its
 * own, but triplicated, and each copy had to independently remember to
 * guard against `timingSafeEqual`'s own hard requirement that both buffers
 * be equal length (it throws otherwise, rather than returning `false`).
 * This is now the single place that invariant lives.
 *
 * A length mismatch still short-circuits (returning `false` immediately
 * after a same-length dummy compare, so its own timing doesn't scale with
 * `a`'s length) - true constant-time comparison across *arbitrary* input
 * lengths is unnecessary here: these are opaque, fixed-shape server-issued
 * secrets, not a password field where response-time-by-length matters.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Dummy same-length compare so a length mismatch doesn't return
    // instantly while a length match takes the full comparison path.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Extracts a bearer token from the standard `Authorization: Bearer <token>`
 * header. Worker/seed routes deliberately read the secret from here now,
 * never from a `?token=` query-string parameter (Prompt 23 Step 21) - a
 * query string is trivially captured by access logs, browser history, and
 * `Referer` headers on any outbound link, none of which apply to a header
 * sent by a trusted server-to-server cron caller.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/.exec(header);
  return match ? match[1] : null;
}

/**
 * The single gate every protected worker/seed route in this codebase must
 * call: true only when the request carries a `Bearer` token that
 * timing-safe-equals the given secret AND that secret is itself non-empty
 * (Critical Rule 3 - fail closed: an unset/blank secret env var must never
 * be treated as "no secret required").
 */
export function isAuthorizedWorkerRequest(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const token = extractBearerToken(request) ?? "";
  return timingSafeEqualStrings(token, secret);
}
