import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

test('默认文档检查发现 knowledge 中的失效链接，并接受修复后的目标', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-knowledge-docs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checker = path.join(root, 'services/buildr/test/verification/docs/quality.ts');
  fs.mkdirSync(path.dirname(checker), { recursive: true });
  fs.copyFileSync(path.join(serviceRoot, 'test/verification/docs/quality.ts'), checker);
  const docs = path.join(root, 'knowledge/docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'overview.md'), '# 示例\n\n[缺失目标](target.md)\n');
  const env = { ...process.env, BUILDR_CHANGED_PATHS_JSON: '[]' };
  const failed = spawnSync(process.execPath, [checker], { encoding: 'utf8', env });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /knowledge\/docs\/overview\.md: missing relative link: target\.md/);
  fs.writeFileSync(path.join(docs, 'target.md'), '# 实际目标\n');
  const passed = spawnSync(process.execPath, [checker], { encoding: 'utf8', env });
  assert.equal(passed.status, 0, passed.stderr);
});
