import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { documentationLinkProblem } from '../verification/docs/quality.ts';

test('文档质量接受合法任务稳定引用，拒绝非法任务编码且不依赖本地Task文件', () => {
  const file = '/repository/change/brief.md';
  for (const reference of ['@task/audit-foundation-boundaries', '@task/a', '@task/task_1.v2', ' <@task/task-1> ']) {
    assert.equal(documentationLinkProblem(file, reference, '/repository'), null, reference);
  }
  for (const reference of ['@task/', '@task/../other', '@task/Task', '@task/a/', '@task/a-', '@task/a#section', '@task/a?mode=1', '@task/a%2fb']) {
    assert.match(documentationLinkProblem(file, reference, '/repository')!, /invalid task reference/u, reference);
  }
});

test('任务引用不放宽普通相对文档的存在性和工作库边界', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-docs-quality-'));
  try {
    const file = path.join(root, 'brief.md');
    fs.writeFileSync(path.join(root, 'existing.md'), '# Existing\n');
    assert.equal(documentationLinkProblem(file, 'existing.md#section', root), null);
    assert.match(documentationLinkProblem(file, 'missing.md#section', root)!, /missing relative link/u);
    assert.match(documentationLinkProblem(file, '../outside.md', root)!, /link escapes repository root/u);
    for (const link of ['https://example.invalid/document', 'mailto:reader@example.invalid', '#heading']) {
      assert.equal(documentationLinkProblem(file, link, root), null);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
