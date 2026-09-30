import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUnifiedDiff, pairForSplit } from '../src/features/task/components/diff-text.ts';

test('统一差异按行号解析：hunk、上下文、删除、新增各归其位', () => {
  const text = [
    '@@ -2,3 +2,4 @@ fn run()',
    '  const a = 1;',
    '- old line',
    '+ new line',
    '+ another',
    '  trailing',
  ].join('\n');
  const { rows, totalAdd, totalDel } = parseUnifiedDiff(text);
  assert.equal(totalAdd, 2); assert.equal(totalDel, 1);
  const hunk = rows.find(row => row.kind === 'hunk');
  assert.ok(hunk);
  const added = rows.filter(row => row.kind === 'add');
  const deleted = rows.filter(row => row.kind === 'del');
  assert.equal(added.length, 2); assert.equal(deleted.length, 1);
  assert.equal(added[0].newNo, 3); assert.equal(deleted[0].oldNo, 3);
});

test('并排配对把连续删除与连续新增对齐，元信息与上下文双侧同现', () => {
  const { rows } = parseUnifiedDiff('--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n-b\n+c\n+d\n ctx');
  const pairs = pairForSplit(rows);
  const meta = pairs.filter(pair => pair.left?.kind === 'meta' || pair.right?.kind === 'meta');
  assert.equal(meta.length, 2);
  const delAdd = pairs.filter(pair => pair.left?.kind === 'del' || pair.right?.kind === 'add');
  assert.equal(delAdd.length, 2);
  assert.equal(delAdd[0].left.text, 'a'); assert.equal(delAdd[0].right.text, 'c');
  assert.equal(delAdd[1].left.text, 'b'); assert.equal(delAdd[1].right.text, 'd');
  const ctx = pairs.at(-1);
  assert.equal(ctx.left?.kind, 'ctx'); assert.equal(ctx.right?.kind, 'ctx');
});

test('未跟踪文件全文按新增行解析，行号从新文件侧起始', () => {
  const { rows, totalAdd } = parseUnifiedDiff('@@ -0,0 +1,3 @@\n+ one\n+ two\n+ three');
  assert.equal(totalAdd, 3);
  assert.equal(rows.at(-1).newNo, 3);
});
