import path from "path";

/**
 * Path-traversal guard for the LOCAL_DEV adapter (Step 17). Pure function:
 * resolves `key` against `baseDir` and returns the absolute path only if
 * the result stays strictly inside `baseDir` - otherwise returns null. The
 * storage key is always machine-generated (generateStorageKey()) and never
 * user-supplied, but this check exists as defense in depth regardless,
 * since it is cheap and this is exactly the kind of boundary a future bug
 * elsewhere must not be able to break through.
 */
export function resolveWithinBaseDir(baseDir: string, key: string): string | null {
  if (key.length === 0 || key.includes("\0")) return null;
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, key);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolvedTarget;
}
