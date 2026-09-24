import { promises as fs } from "fs";
import path from "path";
import type { DocumentStorageProvider } from "./types";
import { resolveWithinBaseDir } from "./local-dev-path";

/**
 * Development-only storage adapter (Step 17). Explicitly NOT for
 * production use:
 *   - Files live outside any public static directory (default
 *     `<project root>/var/document-storage`, well outside `public/` and
 *     never a Next.js-served static path) - the only way to read one is
 *     through the authorized `/api/documents/[id]/download` route, which
 *     calls this adapter's getObject() after re-authorizing the request.
 *   - Keys are the same random, unpredictable values generateStorageKey()
 *     produces everywhere else - never a user-supplied path.
 *   - Every path is re-validated through resolveWithinBaseDir() before any
 *     filesystem call, so a corrupted/malicious key can never escape the
 *     base directory.
 *   - Bounded names: the key length itself is already bounded by
 *     generateStorageKey(); this adapter adds no further filename
 *     transformation of its own.
 * This adapter has no concept of "signed URLs" - LOCAL_DEV documents are
 * always streamed through the authorized server route directly (Step 68),
 * never via any URL scheme.
 */
export class LocalDevStorageProvider implements DocumentStorageProvider {
  readonly kind = "LOCAL_DEV" as const;
  readonly isConfigured = true; // always usable - it's the zero-config development fallback
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir ?? process.env.DOCUMENT_LOCAL_STORAGE_DIR ?? path.join(process.cwd(), "var", "document-storage"));
  }

  private resolve(key: string): string {
    const resolved = resolveWithinBaseDir(this.baseDir, key);
    if (!resolved) throw new Error(`Refusing to access storage key outside the LOCAL_DEV base directory: ${key}`);
    return resolved;
  }

  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    const filePath = this.resolve(params.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, params.body, { mode: 0o600 });
  }

  async getObject(params: { key: string }): Promise<Buffer | null> {
    const filePath = this.resolve(params.key);
    try {
      return await fs.readFile(filePath);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async exists(params: { key: string }): Promise<boolean> {
    const filePath = this.resolve(params.key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(params: { key: string }): Promise<void> {
    const filePath = this.resolve(params.key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "ENOENT";
}
