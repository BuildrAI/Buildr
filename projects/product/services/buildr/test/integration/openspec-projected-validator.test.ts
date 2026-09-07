import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateProjectedOpenSpecTree } from '../../src/task/openspec/application/projected-validator.ts';

test('投射验证通过受管文件操作构造并清理临时Project', (t: any) => {
  const projectRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-projected-validator-test-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, 'openspec', 'specs', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'openspec', 'specs', 'demo', 'spec.md'), '# demo\n');
  const calls: any[] = [];
  const io: any = {
    ensureDirectory(target: any): any  { calls.push(['ensureDirectory', target]); fs.mkdirSync(target, { recursive: true }); },
    copyDirectory(source: any, target: any): any  { calls.push(['copyDirectory', source, target]); fs.cpSync(source, target, { recursive: true }); },
    atomicWriteFile(target: any, content: any): any  { calls.push(['atomicWriteFile', target]); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); },
    removePath(target: any): any  { calls.push(['removePath', target]); fs.rmSync(target, { recursive: true, force: true }); },
    existsFile(target: any): any  { return fs.existsSync(target) && fs.statSync(target).isFile(); },
  };
  const result: any = validateProjectedOpenSpecTree({
    projectRoot,
    delta: { hash: 'sha256-delta' },
    files: [{ path: 'openspec/specs/demo/spec.md', content: '# demo\nupdated\n', digest: 'sha256-expected' }],
    executable: process.execPath,
    collectBaselineTargets: (temporaryProject: any) => [{ project: temporaryProject }],
    includeBaselineTargets: true,
    io,
    spawn: (_executable: any, args: any) => ({ status: 0, stdout: args[0] === '--version' ? '1.6.0\n' : '', stderr: '' }),
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.version, '1.6.0');
  assert.equal(result.baselineTargets.length, 1);
  assert.deepEqual(calls.map(([name]: any) => name), ['ensureDirectory', 'copyDirectory', 'atomicWriteFile', 'removePath']);
  assert.equal(fs.existsSync(path.dirname(result.baselineTargets[0].project)), false);
});

test('严格验证失败时清理投射目录并返回结构化诊断', (t: any) => {
  const projectRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-projected-validator-failure-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, 'openspec'), { recursive: true });
  let removed: any = null;
  const io: any = {
    ensureDirectory: (target: any) => fs.mkdirSync(target, { recursive: true }),
    copyDirectory: (source: any, target: any) => fs.cpSync(source, target, { recursive: true }),
    atomicWriteFile(target: any, content: any): any  { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); },
    removePath(target: any): any  { removed = target; fs.rmSync(target, { recursive: true, force: true }); },
    existsFile: (target: any) => fs.existsSync(target),
  };
  const result: any = validateProjectedOpenSpecTree({
    projectRoot,
    delta: {},
    files: [],
    executable: process.execPath,
    collectBaselineTargets: () => [],
    io,
    spawn: (_executable: any, args: any) => args[0] === '--version'
      ? { status: 0, stdout: '1.6.0\n', stderr: '' }
      : { status: 1, stdout: '', stderr: 'invalid projected spec' },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'expected-tree-strict-validation-failed');
  assert.match(result.diagnostic.preview, /invalid projected spec/);
  assert.equal(fs.existsSync(removed), false);
});
