/**
 * Minimal ambient type declaration for `s3rver` (dev/test-only dependency,
 * used exclusively by src/lib/documents/providers/s3-compatible.test.ts to
 * exercise the real S3-compatible storage adapter against a local,
 * in-process S3-compatible HTTP server - see that file's own doc comment).
 * No official `@types/s3rver` package exists on npm.
 */
declare module "s3rver" {
  interface S3rverOptions {
    address?: string;
    port?: number;
    silent?: boolean;
    directory?: string;
    resetOnClose?: boolean;
    allowMismatchedSignatures?: boolean;
    vhostBuckets?: boolean;
    configureBuckets?: Array<{ name: string; configs: Array<string | Buffer> }>;
  }

  class S3rver {
    constructor(options?: S3rverOptions);
    run(): Promise<{ address: string; port: number }>;
    close(callback: (err?: unknown) => void): void;
  }

  export = S3rver;
}
