import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';

function deltaSpec(statement = '系统 MUST 保持可移植 identity。') {
  return `## ADDED Requirements\n\n### Requirement: Portable delta identity\n${statement}\n\n#### Scenario: works\n- **WHEN** delta 被解析\n- **THEN** identity MUST 可用\n`;
}

function changeRoot(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-openspec-delta-${prefix}-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'checkout', 'projects', 'product', 'openspec', 'changes', 'portable-delta');
}

function writeDelta(change, capability, content) {
  const file = path.join(change, 'specs', capability, 'spec.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test('OpenSpec deltaHash 不包含 checkout 绝对路径', (t) => {
  const first = changeRoot(t, 'first');
  const second = changeRoot(t, 'second');
  const normalized = deltaSpec();
  const firstFile = writeDelta(first, 'demo', normalized.replaceAll('\n', '\r\n').replace('identity。', 'identity。   '));
  const secondFile = writeDelta(second, 'demo', normalized);
  const runtime = createRuntime();

  const firstDelta = runtime.parseOpenSpecChangeDelta(first);
  const secondDelta = runtime.parseOpenSpecChangeDelta(second);

  assert.notEqual(firstFile, secondFile);
  assert.equal(path.isAbsolute(firstDelta.capabilities.get('demo').file), true);
  assert.equal(firstDelta.hash, secondDelta.hash);
});

test('OpenSpec deltaHash 在逻辑 delta 输入变化时改变', (t) => {
  const base = changeRoot(t, 'base');
  const changedContent = changeRoot(t, 'changed-content');
  const changedPath = changeRoot(t, 'changed-path');
  const runtime = createRuntime();

  writeDelta(base, 'demo', deltaSpec());
  writeDelta(changedContent, 'demo', deltaSpec('系统 MUST 使用另一条规范化语义。'));
  writeDelta(changedPath, 'other', deltaSpec());

  const baseHash = runtime.parseOpenSpecChangeDelta(base).hash;
  assert.notEqual(runtime.parseOpenSpecChangeDelta(changedContent).hash, baseHash);
  assert.notEqual(runtime.parseOpenSpecChangeDelta(changedPath).hash, baseHash);
});
