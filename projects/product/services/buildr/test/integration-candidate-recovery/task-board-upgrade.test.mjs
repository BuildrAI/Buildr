import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Candidate-only owner: builtin replacement, migration, recovery, and rollback matrices.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildr = path.join(productRoot, 'bin', 'buildr.mjs');
const legacyPageContent = '<!doctype html><title>历史任务驾驶舱</title><p>原内容不得迁移或改写。</p>\n';

function runBuildr(args, options = {}) {
  const result = spawnSync(process.execPath, [buildr, ...args], {
    cwd: productRoot,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (!options.allowFailure) assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function skillSnapshot(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push({
        path: path.relative(directory, absolute).split(path.sep).join('/'),
        integrity: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`,
      });
    }
  };
  visit(directory);
  return { files, integrity: `sha256-${crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex')}` };
}

function renameCurrentSourceToLegacy(workspace) {
  const manifestFile = path.join(workspace, 'skills', 'manifest.yml');
  const currentDir = path.join(workspace, 'skills', 'buildr', 'task-board');
  const legacyDir = path.join(workspace, 'skills', 'buildr', 'task-cockpit');
  fs.renameSync(currentDir, legacyDir);
  fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, 'utf8')
    .replace('    provider: task-board\n', '    provider: task-cockpit\n')
    .replace('  - id: task-board\n', '  - id: task-cockpit\n')
    .replaceAll('buildr:skill:task-board', 'buildr:skill:task-cockpit')
    .replaceAll('package:workspace:buildr/task-board', 'package:workspace:buildr/task-cockpit')
    .replace('    path: buildr/task-board\n', '    path: buildr/task-cockpit\n')
    .replace('    runtimePath: task-board\n', '    runtimePath: task-cockpit\n'));

  const receiptFile = path.join(workspace, '.buildr', 'builtin-receipts.json');
  const receipts = fs.existsSync(receiptFile)
    ? JSON.parse(fs.readFileSync(receiptFile, 'utf8'))
    : { schemaVersion: 'buildr.builtin-receipts/v1', builtins: [] };
  const receipt = receipts.builtins.find((item) => item.type === 'skill' && item.id === 'task-board');
  if (receipt) {
    receipt.id = 'task-cockpit';
    receipt.target = 'skills/buildr/task-cockpit';
  } else {
    receipts.builtins.push({ type: 'skill', id: 'task-cockpit', target: 'skills/buildr/task-cockpit', ...skillSnapshot(legacyDir) });
  }
  writeJson(receiptFile, receipts);
}

function markLegacySourceUninstalled(workspace) {
  const manifestFile = path.join(workspace, 'skills', 'manifest.yml');
  const legacyDir = path.join(workspace, 'skills', 'buildr', 'task-cockpit');
  const receiptFile = path.join(workspace, '.buildr', 'builtin-receipts.json');
  const receipts = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  const receiptIndex = receipts.builtins.findIndex((item) => item.type === 'skill' && item.id === 'task-cockpit');
  if (receiptIndex >= 0) receipts.builtins.splice(receiptIndex, 1);
  fs.rmSync(legacyDir, { recursive: true, force: true });
  fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, 'utf8')
    .replace(/(  - id: task-cockpit[\s\S]*?    enabled:) true/, '$1 false')
    .replace(/(  - id: task-cockpit[\s\S]*?    state:) installed/, '$1 uninstalled'));
  writeJson(receiptFile, receipts);
}

function renameCurrentRuntimeToLegacy(workspace) {
  const skillsRoot = path.join(workspace, '.agents', 'skills');
  fs.renameSync(path.join(skillsRoot, 'task-board'), path.join(skillsRoot, 'task-cockpit'));
  const receiptsRoot = path.join(workspace, '.agents', 'buildr', 'skill-projection-receipts', 'codex');
  const currentReceipt = path.join(receiptsRoot, 'task-board.json');
  const legacyReceipt = path.join(receiptsRoot, 'task-cockpit.json');
  const receipt = JSON.parse(fs.readFileSync(currentReceipt, 'utf8'));
  receipt.skillId = 'task-cockpit';
  receipt.runtimePath = 'task-cockpit';
  writeJson(legacyReceipt, receipt);
  fs.rmSync(currentReceipt);
}

const fixtureBasesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-board-bases-'));

function createLegacyBase(name, { withRuntime = false } = {}) {
  const workspace = path.join(fixtureBasesRoot, name);
  runBuildr(['init', '--target', workspace, '--name', 'task-board-upgrade', '--profile', 'team']);
  if (withRuntime) runBuildr(['sync', 'codex', '--target', workspace]);
  renameCurrentSourceToLegacy(workspace);
  if (withRuntime) renameCurrentRuntimeToLegacy(workspace);
  const historicalPage = path.join(workspace, 'projects', 'demo', 'openspec', 'knowledge', 'task-cockpits', '2026-01-01-existing.html');
  fs.mkdirSync(path.dirname(historicalPage), { recursive: true });
  fs.writeFileSync(historicalPage, legacyPageContent);
  return workspace;
}

const sourceOnlyBase = createLegacyBase('source-only');
const withRuntimeBase = createLegacyBase('with-runtime', { withRuntime: true });
const sourceOnlyBaseDigest = treeDigest(sourceOnlyBase);
const withRuntimeBaseDigest = treeDigest(withRuntimeBase);
test.after(() => {
  assert.equal(treeDigest(sourceOnlyBase), sourceOnlyBaseDigest, 'source-only base must remain read-only');
  assert.equal(treeDigest(withRuntimeBase), withRuntimeBaseDigest, 'with-runtime base must remain read-only');
  fs.rmSync(fixtureBasesRoot, { recursive: true, force: true });
});

function createLegacyWorkspace(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-board-upgrade-'));
  const workspace = path.join(root, 'workspace');
  fs.cpSync(options.withRuntime ? withRuntimeBase : sourceOnlyBase, workspace, { recursive: true, preserveTimestamps: true });
  if (options.uninstalled) markLegacySourceUninstalled(workspace);
  const historicalPage = path.join(workspace, 'projects', 'demo', 'openspec', 'knowledge', 'task-cockpits', '2026-01-01-existing.html');
  return { root, workspace, historicalPage };
}

function treeDigest(root) {
  const hash = crypto.createHash('sha256');
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const file = path.join(directory, entry.name);
      hash.update(path.relative(root, file));
      if (entry.isDirectory()) visit(file);
      else hash.update(fs.readFileSync(file));
    }
  };
  visit(root);
  return hash.digest('hex');
}

function assertSyncStopsWithoutWrites(fixture) {
  const before = treeDigest(fixture.workspace);
  const result = runBuildr(['sync', 'codex', '--target', fixture.workspace], { allowFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /sync 暂停.*需要用户决策/s);
  assert.equal(treeDigest(fixture.workspace), before);
  assert.equal(fs.readFileSync(fixture.historicalPage, 'utf8'), legacyPageContent);
}

test('sync 原子替换官方 task-cockpit source 和 runtime，但不迁移历史 HTML', () => {
  const fixture = createLegacyWorkspace({ withRuntime: true });
  try {
    runBuildr(['sync', 'codex', '--target', fixture.workspace]);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-cockpit')), false);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-board', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(fixture.workspace, '.agents', 'skills', 'task-cockpit')), false);
    assert.equal(fs.existsSync(path.join(fixture.workspace, '.agents', 'skills', 'task-board', 'assets', 'task-board-template.html')), true);
    assert.equal(fs.readFileSync(fixture.historicalPage, 'utf8'), legacyPageContent);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'projects', 'demo', 'openspec', 'knowledge', 'task-boards', '2026-01-01-existing.html')), false);
    const receipts = JSON.parse(fs.readFileSync(path.join(fixture.workspace, '.buildr', 'builtin-receipts.json'), 'utf8'));
    assert.equal(receipts.builtins.some((item) => item.id === 'task-cockpit'), false);
    assert.equal(receipts.builtins.some((item) => item.id === 'task-board'), true);
    const converged = treeDigest(fixture.workspace);
    runBuildr(['sync', 'codex', '--target', fixture.workspace]);
    assert.equal(treeDigest(fixture.workspace), converged, 'repeat sync must be idempotent');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('新 workspace init 只创建 task-board source identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-board-init-'));
  const workspace = path.join(root, 'workspace');
  try {
    runBuildr(['init', '--target', workspace, '--name', 'task-board-init', '--profile', 'team']);
    const manifest = fs.readFileSync(path.join(workspace, 'skills', 'manifest.yml'), 'utf8');
    assert.match(manifest, /  - id: task-board/);
    assert.doesNotMatch(manifest, /  - id: task-cockpit/);
    assert.equal(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'task-board', 'assets', 'task-board-template.html')), true);
    assert.equal(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'task-cockpit')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('用户修改过 legacy Skill 时 sync 零写入并请求判断', () => {
  const fixture = createLegacyWorkspace();
  try {
    fs.appendFileSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-cockpit', 'SKILL.md'), '\n用户自定义内容\n');
    assertSyncStopsWithoutWrites(fixture);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('显式 restore 接管 Buildr-managed 未知 legacy 内容并由后续 sync 收敛 runtime', () => {
  const fixture = createLegacyWorkspace({ withRuntime: true });
  try {
    fs.appendFileSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-cockpit', 'SKILL.md'), '\n旧版官方内容不在当前 legacyIntegrities 中\n');
    assertSyncStopsWithoutWrites(fixture);

    const restored = runBuildr(['builtin', 'restore', 'task-board', '--target', fixture.workspace]);
    assert.match(restored.stdout, /已恢复 Buildr builtin：task-board/);
    assert.match(restored.stdout, /replacement: task-cockpit -> task-board/);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-cockpit')), false);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-board', 'SKILL.md')), true);
    assert.equal(fs.readFileSync(fixture.historicalPage, 'utf8'), legacyPageContent);

    const manifest = fs.readFileSync(path.join(fixture.workspace, 'skills', 'manifest.yml'), 'utf8');
    assert.match(manifest, /  - id: task-board/);
    assert.doesNotMatch(manifest, /  - id: task-cockpit/);
    const receipts = JSON.parse(fs.readFileSync(path.join(fixture.workspace, '.buildr', 'builtin-receipts.json'), 'utf8'));
    assert.equal(receipts.builtins.some((item) => item.id === 'task-cockpit'), false);
    assert.equal(receipts.builtins.some((item) => item.id === 'task-board'), true);

    runBuildr(['sync', 'codex', '--target', fixture.workspace]);
    assert.equal(fs.existsSync(path.join(fixture.workspace, '.agents', 'skills', 'task-cockpit')), false);
    assert.equal(fs.existsSync(path.join(fixture.workspace, '.agents', 'skills', 'task-board', 'SKILL.md')), true);
    assert.equal(fs.readFileSync(fixture.historicalPage, 'utf8'), legacyPageContent);

    const repeated = runBuildr(['builtin', 'restore', 'task-board', '--target', fixture.workspace]);
    assert.match(repeated.stdout, /已恢复 Buildr builtin：task-board/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('foreign replacement restore 在真实 CLI 边界零写入且不假报成功', () => {
  const fixture = createLegacyWorkspace();
  try {
    const workspace = fixture.workspace;
    const manifestFile = path.join(workspace, 'skills', 'manifest.yml');
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, 'utf8').replace(/(  - id: task-cockpit[\s\S]*?    source:) buildr/, '$1 external'));
    const before = treeDigest(workspace);
    const result = runBuildr(['builtin', 'restore', 'task-board', '--target', workspace], { allowFailure: true });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /must not combine path with source.*skills\/manifest\.yml/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /已恢复 Buildr builtin：task-board/);
    assert.equal(treeDigest(workspace), before);
    assert.equal(fs.readFileSync(fixture.historicalPage, 'utf8'), legacyPageContent);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('显式 replacement restore mutation 失败时回滚且不输出成功', () => {
  const fixture = createLegacyWorkspace({ withRuntime: true });
  try {
    fs.appendFileSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-cockpit', 'SKILL.md'), '\nunknown legacy\n');
    const before = treeDigest(fixture.workspace);
    const result = runBuildr(['builtin', 'restore', 'task-board', '--target', fixture.workspace], {
      allowFailure: true,
      env: { BUILDR_FAULT_AFTER_MUTATION_WRITE: '1' },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Injected Buildr mutation failure/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /已恢复 Buildr builtin：task-board/);
    assert.equal(treeDigest(fixture.workspace), before);
    assert.equal(fs.readFileSync(fixture.historicalPage, 'utf8'), legacyPageContent);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('legacy runtime 被修改时 preflight 零写入', () => {
  const fixture = createLegacyWorkspace({ withRuntime: true });
  try {
    fs.appendFileSync(path.join(fixture.workspace, '.agents', 'skills', 'task-cockpit', 'SKILL.md'), '\n用户 runtime 修改\n');
    assertSyncStopsWithoutWrites(fixture);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('replacement runtime 被占用时 preflight 零写入', () => {
  const fixture = createLegacyWorkspace({ withRuntime: true });
  try {
    const target = path.join(fixture.workspace, '.agents', 'skills', 'task-board');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'SKILL.md'), '用户已有的 runtime task-board\n');
    assertSyncStopsWithoutWrites(fixture);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('replacement source mutation 失败时回滚到完整 legacy 状态', () => {
  const fixture = createLegacyWorkspace({ withRuntime: true });
  try {
    const before = treeDigest(fixture.workspace);
    const result = runBuildr(['sync', 'codex', '--target', fixture.workspace], {
      allowFailure: true,
      env: { BUILDR_FAULT_AFTER_MUTATION_WRITE: '1' },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Injected Buildr mutation failure/);
    assert.equal(treeDigest(fixture.workspace), before);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-cockpit')), true);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-board')), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('最终 doctor 失败不假报迁移成功，修复后重复 sync 收敛', () => {
  const fixture = createLegacyWorkspace({ withRuntime: true });
  try {
    const projectsManifest = path.join(fixture.workspace, 'projects', 'manifest.yml');
    fs.writeFileSync(projectsManifest, [
      'schemaVersion: buildr.projects/v1',
      'projects:',
      '  missing-project:',
      '    title: Missing Project',
      '    description: Doctor failure fixture',
      '    path: projects/missing-project',
      '    repo:',
      '      kind: workspace',
      '',
    ].join('\n'));
    const first = runBuildr(['sync', 'codex', '--target', fixture.workspace], { allowFailure: true });
    assert.notEqual(first.status, 0);
    assert.match(`${first.stdout}${first.stderr}`, /sync 未完成：最终 doctor 未通过/);
    assert.doesNotMatch(`${first.stdout}${first.stderr}`, /doctor 通过/);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-board')), true);
    assert.equal(fs.existsSync(path.join(fixture.workspace, '.agents', 'skills', 'task-board')), true);
    fs.writeFileSync(projectsManifest, 'schemaVersion: buildr.projects/v1\nprojects: {}\n');
    runBuildr(['sync', 'codex', '--target', fixture.workspace]);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('显式卸载的 legacy Skill 迁移为 task-board 卸载状态且不重新安装', () => {
  const fixture = createLegacyWorkspace({ uninstalled: true });
  try {
    runBuildr(['sync', 'codex', '--target', fixture.workspace]);
    const manifest = fs.readFileSync(path.join(fixture.workspace, 'skills', 'manifest.yml'), 'utf8');
    assert.match(manifest, /  - id: task-board[\s\S]*?    enabled: false[\s\S]*?    state: uninstalled/);
    assert.doesNotMatch(manifest, /  - id: task-cockpit/);
    assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'task-board')), false);
    assert.equal(fs.readFileSync(fixture.historicalPage, 'utf8'), legacyPageContent);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
