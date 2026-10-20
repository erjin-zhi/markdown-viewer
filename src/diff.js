import { diffArrays, diffChars } from "diff";

const lines = text => text.match(/[^\n]*\n|[^\n]+$/g) || [];

// Keep every byte of each line, including its terminator, so EOF changes are visible too.
export function buildDiff(original, edited) {
  const left = lines(original), right = lines(edited);
  if (original.length + edited.length > 500_000 || left.length + right.length > 10_000) return { limited: true };
  const start = Date.now();
  const changes = diffArrays(left, right, { timeout: 120, maxEditLength: 2000 });
  if (!changes) return { limited: true };
  const rows = [], groups = [];
  let leftLine = 1, rightLine = 1, added = 0, removed = 0;
  const cell = (value, number, kind) => ({ value, number, kind, parts: [{ text: value.replace(/\n$/, ""), kind: "same" }] });
  for (let i = 0; i < changes.length;) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const value of change.value) rows.push({ left: cell(value, leftLine++, "same"), right: cell(value, rightLine++, "same") });
      i++;
      continue;
    }
    const deleted = [], inserted = [];
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      const item = changes[i++];
      (item.removed ? deleted : inserted).push(...item.value);
    }
    groups.push(rows.length);
    removed += deleted.length;
    added += inserted.length;
    for (let j = 0; j < Math.max(deleted.length, inserted.length); j++) {
      const a = j < deleted.length ? cell(deleted[j], leftLine++, "removed") : null;
      const b = j < inserted.length ? cell(inserted[j], rightLine++, "added") : null;
      if (a && b) {
        a.kind = b.kind = "modified";
        if (a.value.length + b.value.length < 4000 && Date.now() - start < 220) {
          const parts = diffChars(a.value.replace(/\n$/, ""), b.value.replace(/\n$/, ""), { timeout: 5, maxEditLength: 600 });
          if (parts) {
            a.parts = parts.filter(p => !p.added).map(p => ({ text: p.value, kind: p.removed ? "removed" : "same" }));
            b.parts = parts.filter(p => !p.removed).map(p => ({ text: p.value, kind: p.added ? "added" : "same" }));
          }
        }
      }
      rows.push({ left: a, right: b });
    }
  }
  return { rows, groups, added, removed, limited: false };
}
