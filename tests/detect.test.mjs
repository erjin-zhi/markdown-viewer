import { test } from "node:test";
import assert from "node:assert/strict";
import { isMarkdownMime, isMarkdownPath, looksLikeMarkdown, shouldPreview, MAX_SOURCE_LENGTH } from "../src/detect.js";

test("recognizes Markdown MIME variants and paths with queries", () => {
  for (const mime of ["text/markdown; charset=utf-8", "TEXT/X-MARKDOWN", "application/markdown"]) assert.ok(isMarkdownMime(mime));
  for (const mime of ["text/html", "application/json", "text/markdown-unsupported"]) assert.equal(isMarkdownMime(mime), false);
  assert.ok(isMarkdownPath("https://example.test/README.MD?raw=true#intro"));
  assert.equal(isMarkdownPath("https://example.test/?name=readme.md"), false);
});
test("conservative plain text detection", () => {
  assert.ok(looksLikeMarkdown("# Title\n\nParagraph."));
  assert.ok(looksLikeMarkdown("```json\n{\"ok\":true}\n```\n"));
  assert.ok(looksLikeMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |"));
  assert.equal(looksLikeMarkdown("2026-10-20 INFO request completed\nstatus=200"), false);
  assert.equal(looksLikeMarkdown('{"title":"# test","body":"hello"}'), false);
  assert.equal(looksLikeMarkdown("# a shell comment\nexit 0"), false);
});
test("does not override HTML or JSON even with .md extension or manual trigger", () => {
  const base = { source: "# Title\n\nbody", url: "https://example.test/foo.md", mime: "text/html", plainDocument: false };
  assert.equal(shouldPreview(base), false);
  assert.equal(shouldPreview({ ...base, force: true }), false);
});
test("MIME metadata allows Markdown containing only a plain paragraph", () => {
  assert.ok(shouldPreview({ source: "Hello world", url: "https://example.test/api", mime: "text/plain", responseMime: "text/markdown", plainDocument: true }));
});
test("manual preview handles plain text, but refuses empty and oversized inputs", () => {
  const base = { source: "A plain paragraph", url: "https://example.test/api", mime: "text/plain", plainDocument: true };
  assert.equal(shouldPreview(base), false);
  assert.ok(shouldPreview({ ...base, force: true }));
  assert.equal(shouldPreview({ ...base, source: "", force: true }), false);
  assert.equal(shouldPreview({ ...base, source: "a".repeat(MAX_SOURCE_LENGTH + 1), force: true }), false);
});
