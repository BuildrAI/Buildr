import assert from 'node:assert/strict';
import test from 'node:test';
import { diffContentRows, inlineChangePairs, inlineSegments, parseUnifiedDiff, pairForSplit } from '../src/features/task/components/diff-text.ts';

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

test('补丁头不产生伪行号，删除和新增保留准确行号', () => {
  const { rows } = parseUnifiedDiff('diff --git a/x b/x\nindex a..b\n--- a/x\n+++ b/x\n@@ -8,2 +8,2 @@\n-old\n+new\n ctx\n');
  assert.ok(rows.slice(0, 4).every(row => row.kind === 'meta' && row.oldNo === null && row.newNo === null));
  assert.deepEqual(rows.filter(row => row.kind === 'del' || row.kind === 'add').map(row => [row.oldNo, row.newNo, row.text]), [[8, null, 'old'], [null, 8, 'new']]);
});

test('可视代码去掉补丁头，保留真实代码及原行号和原始补丁', () => {
  const parsed = parseUnifiedDiff('diff --git a/x b/x\nindex a..b\n--- a/x\n+++ b/x\n@@ -8,2 +8,2 @@\n-diff --git is source text\n+index is source text\n ctx\n\\ No newline at end of file\n');
  const original = structuredClone(parsed);
  const rows = diffContentRows(parsed.rows);
  assert.deepEqual(rows.map(row => [row.kind, row.oldNo, row.newNo, row.text]), [
    ['del', 8, null, 'diff --git is source text'], ['add', null, 8, 'index is source text'], ['ctx', 9, 9, 'ctx'],
  ]);
  assert.deepEqual(parsed, original);
  assert.ok(parsed.rows.some(row => row.kind === 'meta' && row.text.startsWith('\\ No newline')), '原始末尾换行提示仍可由阅读器单独展示');
});

test('省略提示隔开不连续区块，不把不同区块的删除与新增错误配对', () => {
  const parsed = parseUnifiedDiff('@@ -2 +2,0 @@\n-old\n@@ -12,0 +11 @@\n+new\n');
  const rows = diffContentRows(parsed.rows);
  assert.deepEqual(rows.map(row => row.text), ['old', '… 未显示的行 …', 'new']);
  const pairs = pairForSplit(rows);
  assert.deepEqual(pairs.map(pair => [pair.left?.oldNo ?? null, pair.right?.newNo ?? null]), [[2, null], [null, null], [null, 11]]);
  assert.ok(rows.every(row => !row.text.startsWith('@@')));
});

test('单侧空区块之后连续显示的代码不产生虚假省略提示', () => {
  const parsed = parseUnifiedDiff('@@ -2 +1,0 @@\n-old\n@@ -3 +2 @@\n context\n');
  const rows = diffContentRows(parsed.rows);
  assert.deepEqual(rows.map(row => row.kind), ['del', 'ctx']);
  assert.deepEqual([rows[1].oldNo, rows[1].newNo], [3, 2]);
});

const changedText = (segments, text) => segments.filter(segment => segment.changed).map(segment => text.slice(segment.start, segment.end)).join('');

test('行内差异只标出真正变化的片段，公用前后缀保持原样', () => {
  const { old, new: next } = inlineSegments('const value = readConfig(name, options);', 'const value = readConfig(name, extra, options);');
  assert.equal(changedText(old, 'const value = readConfig(name, options);'), '');
  assert.equal(changedText(next, 'const value = readConfig(name, extra, options);'), 'extra, ');
});

test('行内差异支持中文逐字变化，整行重写时词元全部标记、仅空格保持原样', () => {
  const { old, new: next } = inlineSegments('同意实施、开始或继续修改只授权实施范围内的持久修改。', '同意实施、开始或继续修改只授权实施范围内的临时修改。');
  assert.equal(changedText(old, '同意实施、开始或继续修改只授权实施范围内的持久修改。'), '持久');
  assert.equal(changedText(next, '同意实施、开始或继续修改只授权实施范围内的临时修改。'), '临时');
  const rewrite = inlineSegments('completely different old content', 'totally new line here');
  assert.ok(rewrite.old.filter(segment => !segment.changed).every(segment => /^\s+$/u.test('completely different old content'.slice(segment.start, segment.end))));
  assert.ok(rewrite.new.filter(segment => !segment.changed).every(segment => /^\s+$/u.test('totally new line here'.slice(segment.start, segment.end))));
});

test('行内配对跟随同一删除新增块的位置，超出部分行保持整行标记', () => {
  const { rows } = parseUnifiedDiff('@@ -1,2 +1,3 @@\n-old one\n-old two\n+new one\n+new two\n+new three\n ctx');
  const pairs = inlineChangePairs(rows);
  const indexes = [...pairs.entries()].sort((a, b) => a[0] - b[0]);
  assert.deepEqual(indexes, [[1, 3], [2, 4], [3, 1], [4, 2]]);
  assert.ok(!pairs.has(5), '第三个新增行没有配对删除行，保持整行新增色');
});
