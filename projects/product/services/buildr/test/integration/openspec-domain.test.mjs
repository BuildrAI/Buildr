import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { registerOpenSpecApplication } from '../../src/task/openspec/application/openspec-application.ts';

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

function treeSnapshot(root) {
  const result = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (entry.isDirectory()) visit(file);
      else result[relative] = fs.readFileSync(file).toString('base64');
    }
  };
  visit(root);
  return result;
}

function diagnosticRuntime(targetRoot) {
  const runtime = {
    assertInitializedBuildrWorkspace: () => {},
    assertName: () => {},
    assertNoUnknownOptions: () => {},
    positionalArgs: (args) => [args[0]],
    optionValue: (args, option, fallback = null) => {
      const index = args.indexOf(option);
      return index === -1 ? fallback : args[index + 1];
    },
    existsDirectory: (file) => fs.existsSync(file) && fs.statSync(file).isDirectory(),
    existsFile: (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
    readProjectsRegistryIfExists: () => ({ projects: { product: { source: { path: 'projects/product' } } } }),
    readComponentsManifestForWrite: () => ({ components: [{ id: 'openspec', state: 'installed' }] }),
    componentDefinitionFile: () => path.join(targetRoot, 'component.yml'),
    readComponentDefinition: () => ({ upstream: { version: '1.6.0' } }),
    runCommandsCheck: () => ({ commands: [{ id: 'openspec', status: 'ok', version: { current: '1.6.0' }, executablePath: process.execPath }] }),
  };
  return registerOpenSpecApplication(runtime, {
    projectQuery: {
      projectDetail: () => ({ project: { code: 'product', source: { type: 'workspace', path: 'projects/product' } } }),
    },
  });
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

test('converge help明确实际工作根且不自动选择其他worktree', () => {
  const buildr = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const result = spawnSync(process.execPath, [buildr, 'help', 'openspec', 'converge'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--target <actual-work-root>/);
  assert.match(result.stdout, /当前Workspace或matching Worktree真实根/);
  assert.match(result.stdout, /不会自动搜索或选择其他worktree/);
  assert.doesNotMatch(result.stdout, /--target <(?:dir|workspace)>/);
});

test('semantic readiness preflight help明确只读、失效与最终重检边界', () => {
  const buildr = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const result = spawnSync(process.execPath, [buildr, 'help', 'openspec', 'convergence', 'preflight'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--target <actual-work-root>/);
  assert.match(result.stdout, /不会写canonical、Receipt或archive/);
  assert.match(result.stdout, /ready会在delta、canonical、active Changes或executable变化后失效/);
  assert.match(result.stdout, /最终converge始终重新检查/);
});

test('canonical target看不到active Change时零写入并指向包含Change的实际工作根', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-execution-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const canonicalProject = path.join(root, 'canonical', 'projects', 'product');
  const executionProject = path.join(root, 'execution', 'projects', 'product');
  fs.mkdirSync(path.join(canonicalProject, 'openspec', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(canonicalProject, 'openspec', 'changes', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(canonicalProject, 'canonical-sentinel.txt'), 'unchanged\n');
  const executionChange = path.join(executionProject, 'openspec', 'changes', 'task-change');
  fs.mkdirSync(path.join(executionProject, 'openspec', 'specs'), { recursive: true });
  fs.mkdirSync(executionChange, { recursive: true });
  fs.writeFileSync(path.join(executionChange, '.openspec.yaml'), 'schema: spec-driven\n');

  const runtime = diagnosticRuntime(path.join(root, 'canonical'));
  const before = treeSnapshot(canonicalProject);
  assert.throws(
    () => runtime.openSpecContractContext([
      'task-change', '--project', 'product', '--target', path.join(root, 'canonical'),
    ], {
      usage: 'buildr openspec converge <change> --project <project> [--target <actual-work-root>] [--json]',
      allowArchived: true,
    }),
    (error) => {
      assert.equal(error.code, 'openspec.active_change_not_found');
      assert.match(error.message, /Active OpenSpec change not found in the provided --target/);
      assert.match(error.nextAction, /当前Workspace还是matching Worktree/);
      assert.match(error.nextAction, /不得复制Change或自动搜索其他worktree/);
      assert.match(error.usage, /--target <actual-work-root>/);
      return true;
    },
  );
  assert.deepEqual(treeSnapshot(canonicalProject), before);
  assert.equal(runtime.openSpecContractChangePath(executionProject, 'task-change'), executionChange);
});
