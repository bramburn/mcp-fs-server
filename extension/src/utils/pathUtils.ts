import * as os from "os";

/**
 * Normalizes a file path to a standard POSIX format (forward slashes).
 * This is crucial for consistent ID generation and ignore-pattern matching.
 */
export function normalizePath(filePath: string): string {
  if (!filePath) {
    return "";
  }

  // 1. Convert backslashes to forward slashes
  let normalized = filePath.replace(/\\/g, "/");

  // 2. Resolve relative paths to absolute if necessary (optional, context dependent)
  // normalized = path.resolve(normalized).replace(/\\/g, '/');

  // 3. On Windows, ensure drive letters are consistent (e.g., lowercased)
  // This helps prevent 'C:/Users' vs 'c:/Users' mismatches
  if (os.platform() === "win32") {
    normalized = normalized.replace(/^[a-zA-Z]:/, (match) =>
      match.toLowerCase()
    );
  }

  return normalized;
}

/**
 * Checks if a path is a child of a parent directory.
 * Both paths are normalized before comparison.
 */
export function isChildOf(childPath: string, parentPath: string): boolean {
  const normalizedChild = normalizePath(childPath);
  const normalizedParent = normalizePath(parentPath);

  return (
    normalizedChild.startsWith(normalizedParent) &&
    (normalizedChild.length === normalizedParent.length ||
      normalizedChild[normalizedParent.length] === "/")
  );
}
