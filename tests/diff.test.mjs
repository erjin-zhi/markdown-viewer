import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDiff } from "../src/diff.js";
function verify(a, b) {
  const result = buildDiff(a, b);
  assert.equal(result.limited, false);
  assert.equal(result.rows.map(r => r.left?.value || "").join(""), a);
  assert.equal(result.rows.map(r => r.right?.value || "").join(""), b);
  return result;
}
test("identical and empty documents have no changes", () => {
  for (const a of ["", "# 标题\n\n正文\n", "no newline"]) {
    const result = verify(a, a);
    assert.equal(result.groups.length, 0);
    assert.equal(result.added + result.removed, 0);
  }
});
test("pure insertions and deletions align with empty counterparts", () => {
  const added = verify("A\nC\n", "A\nB\nC\n");
  assert.equal(added.added, 1);
  assert.equal(added.rows[1].left, null);
  const removed = verify("A\nB\nC\n", "A\nC\n");
  assert.equal(removed.removed, 1);
  assert.equal(removed.rows[1].right, null);
  verify("", "新增\n");
  verify("删除全部\n", "");
});
test("Chinese replacements highlight changed characters and keep line numbers", () => {
  const d = verify("# 文档\n苹果价格：10 元\n", "# 文档\n苹果价格：20 元\n");
  assert.equal(d.rows[1].left.kind, "modified");
  assert.equal(d.rows[1].right.number, 2);
  assert.deepEqual(d.rows[1].left.parts.filter(p => p.kind === "removed").map(p => p.text), ["1"]);
  assert.deepEqual(d.rows[1].right.parts.filter(p => p.kind === "added").map(p => p.text), ["2"]);
});
test("blank lines, trailing newline and repeated lines remain exact", () => {
  for (const [a, b] of [["a\n", "a"], ["a\n\n", "a\n"], ["x\nx\nx\n", "x\nnew\nx\n"], ["\n", ""], ["a\r\n", "a\n"]]) {
    const result = verify(a, b);
    assert.ok(result.groups.length > 0);
  }
});
test("large documents explicitly report comparison limit", () => {
  assert.equal(buildDiff("a".repeat(500001), "").limited, true);
  assert.equal(buildDiff("a\n".repeat(10001), "").limited, true);
});
