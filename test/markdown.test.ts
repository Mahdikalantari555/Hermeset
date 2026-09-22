import { describe, expect, it } from "vitest";
import {
  assertMarkdownPath,
  isMarkdownPath,
  isWorkspaceListPath,
} from "../src/markdown";

describe("Markdown workspace policy", () => {
  it.each(["notes.md", "Notes.MD", "projects/release/notes.md"])(
    "allows relative Markdown path %s",
    (path) => {
      expect(isMarkdownPath(path)).toBe(true);
      expect(() => assertMarkdownPath(path)).not.toThrow();
    },
  );

  it.each([
    "",
    "notes.txt",
    "/notes.md",
    "C:\\notes.md",
    "../notes.md",
    "notes/../../secret.md",
    "notes/./file.md",
    "notes/%2e%2e/secret.md",
    "notes.md/",
  ])("blocks unsafe path %s", (path) => {
    expect(isMarkdownPath(path)).toBe(false);
    expect(() => assertMarkdownPath(path)).toThrow(/relative \.md/);
  });

  it.each([undefined, "", "."])("allows list path %s", (path) => {
    expect(isWorkspaceListPath(path)).toBe(true);
  });

  it("blocks file paths from directory listing", () => {
    expect(isWorkspaceListPath("notes.md")).toBe(false);
  });
});
