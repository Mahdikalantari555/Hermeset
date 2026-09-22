const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const POSIX_ABSOLUTE_PATH = /^\//;
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

export function isMarkdownPath(path: string): boolean {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path !== path.trim() ||
    CONTROL_CHARACTER.test(path) ||
    POSIX_ABSOLUTE_PATH.test(path) ||
    WINDOWS_ABSOLUTE_PATH.test(path) ||
    path.includes("\\") ||
    path.includes("%") ||
    path.endsWith("/")
  ) {
    return false;
  }

  const segments = path.split("/");
  return (
    segments.length > 0 &&
    segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    ) &&
    path.toLowerCase().endsWith(".md")
  );
}

export function isWorkspaceListPath(path: string | undefined): boolean {
  return path === undefined || path === "" || path === ".";
}

export function assertMarkdownPath(path: string): void {
  if (!isMarkdownPath(path)) {
    throw new Error("Only relative .md workspace paths are allowed");
  }
}
