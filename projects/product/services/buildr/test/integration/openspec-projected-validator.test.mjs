import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateProjectedOpenSpecTree } from '../../src/task/openspec/application/projected-validator.ts';

test('投射验证通过受管文件操作构造并清理临时Project', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-projected-validator-test-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, 'openspec', 'specs', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'openspec', 'specs', 'demo', 'spec.md'), '# demo\n');
  const calls = [];
  const io = {
    ensureDirectory(target) { calls.push(['ensureDirectory', target]); fs.mkdirSync(target, { recursive: true }); },
    copyDirectory(source, target) { calls.push(['copyDirectory', source, target]); fs.cpSync(source, target, { recursive: true }); },
    atomicWriteFile(target, content) { calls.push(['atomicWriteFile', target]); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); },
    removePath(target) { calls.push(['removePath', target]); fs.rmSync(target, { recursive: true, force: true }); },
    existsFile(target) { return fs.existsSync(target) && fs.statSync(target).isFile(); },
  };
  const result = validateProjectedOpenSpecTree({
    projectRoot,
    delta: { hash: 'sha256-delta' },
    files: [{ path: 'openspec/specs/demo/spec.md', content: '# demo\nupdated\n', digest: 'sha256-expected' }],
    executable: process.execPath,
    collectBaselineTargets: (temporaryProject) => [{ project: temporaryProject }],
    includeBaselineTargets: true,
    io,
    spawn: (_executable, args) => ({ status: 0, stdout: args[0] === '--version' ? '1.6.0\n' : '', stderr: '' }),
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.version, '1.6.0');
  assert.equal(result.baselineTargets.length, 1);
  assert.deepEqual(calls.map(([name]) => name), ['ensureDirectory', 'copyDirectory', 'atomicWriteFile', 'removePath']);
  assert.equal(fs.existsSync(path.dirname(result.baselineTargets[0].project)), false);
});

test('严格验证失败时清理投射目录并返回结构化诊断', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-projected-validator-failure-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, 'openspec'), { recursive: true });
  let removed = null;
  const io = {
    ensureDirectory: (target) => fs.mkdirSync(target, { recursive: true }),
    copyDirectory: (source, target) => fs.cpSync(source, target, { recursive: true }),
    atomicWriteFile(target, content) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); },
    removePath(target) { removed = target; fs.rmSync(target, { recursive: true, force: true }); },
    existsFile: (target) => fs.existsSync(target),
  };
  const result = validateProjectedOpenSpecTree({
    projectRoot,
    delta: {},
    files: [],
    executable: process.execPath,
    collectBaselineTargets: () => [],
    io,
    spawn: (_executable, args) => args[0] === '--version'
      ? { status: 0, stdout: '1.6.0\n', stderr: '' }
      : { status: 1, stdout: '', stderr: 'invalid projected spec' },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'expected-tree-strict-validation-failed');
  assert.match(result.diagnostic.preview, /invalid projected spec/);
  assert.equal(fs.existsSync(removed), false);
});
