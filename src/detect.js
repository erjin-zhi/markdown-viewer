export const MAX_SOURCE_LENGTH = 3 * 1024 * 1024;

export function isMarkdownMime(value = "") {
  return /^(text\/(?:x-)?markdown|application\/(?:x-)?markdown)(?:\s*;|$)/i.test(value);
}

export function isMarkdownPath(value) {
  try {
    return /\.(?:md|markdown|mdown|mkdn)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export function looksLikeMarkdown(source) {
  // A plain log or JSON response must not become a document just because it has punctuation.
  const text = source.slice(0, 80_000);
  if (/^\s*[{[]/.test(text)) {
    try { JSON.parse(source); return false; } catch { /* Markdown may start with a link. */ }
  }
  const heading = /^ {0,3}#{1,6}\s+\S/m.test(text) || /^\S[^\n]*\n(?:={3,}|-{3,})\s*$/m.test(text);
  const fence = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]+?\n {0,3}(?:`{3,}|~{3,})\s*$/m.test(text);
  const list = /(?:^|\n)(?: {0,3}(?:[-+*]|\d+\.)\s+\S[^\n]*\n){2}/m.test(text);
  const table = /^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}:?\s*\|/m.test(text);
  return fence || table || (heading && (list || /\n\s*\n\S/.test(text)));
}

export function shouldPreview({ source, url, mime, responseMime, plainDocument, force = false }) {
  if (!plainDocument || source.length > MAX_SOURCE_LENGTH || !source.trim()) return false;
  if (force) return true;
  return isMarkdownMime(mime) || isMarkdownMime(responseMime) ||
    isMarkdownPath(url) || (mime === "text/plain" && looksLikeMarkdown(source));
}
