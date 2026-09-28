import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { applySkillRenderPlan, buildSkillContent, buildSkillRenderPlan } from '../../src/modules/agent-assets/infrastructure/runtime/skills/render-plan.ts';
import { buildEffectiveSkillInventory } from '../../src/modules/agent-assets/infrastructure/runtime/skills/inventory.ts';
import {
  historicalSkillProjectionOwnershipReceiptTarget,
  legacySkillProjectionOwnershipReceiptTarget,
  listSkillProjectionOwnershipReceipts,
  parseSkillProjectionReceipt,
  renderSkillProjectionReceipt,
  runtimeFileMatches,
  skillProjectionOwnershipReceiptTarget,
} from '../../src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts';
import { createRuntimePlan, getRuntimeAdapter, REQUIRED_RENDER_CAPABILITIES } from '../../src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts';
import { reconcileRuntimePlan } from '../../src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts';
import { registerDomainsComponents } from '../../src/modules/agent-assets/application/components.ts';
import { createBuiltinLifecycle } from '../../src/modules/agent-assets/application/package-maintenance/builtin-lifecycle.ts';
import { createWorkspaceMutation } from '../../src/infrastructure/filesystem/workspace-mutation.ts';

function put(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-shared-skill-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'skills', 'team', 'demo');
  put(path.join(sourceDir, 'SKILL.md'), '---\nname: demo\ndescription: demo\n---\n\n# Demo\n');
  put(path.join(sourceDir, 'assets', 'bytes.bin'), Buffer.from([0, 255, 3]));
  put(path.join(sourceDir, 'scripts', 'run.sh'), '#!/bin/sh\necho demo\n');
  fs.chmodSync(path.join(sourceDir, 'scripts', 'run.sh'), 0o744);
  const skill: any = {
    id: 'demo', sourceDir, sourceFile: path.join(sourceDir, 'SKILL.md'), origin: 'workspace', declaredScope: '.',
    runtimePath: 'demo', legacyRuntimePaths: ['team/demo'], assetIdentity: 'workspace:fixture:skill:demo', sourceIdentity: 'workspace:skills/team/demo', workspaceId: 'fixture',
  };
  return { root, skill };
}

function legacyProjection(root: string, skill: any, { owner = 'codex', runtimePath = 'team/demo', legacy = false, destination = 'workspace', v1 = false }: any = {}) {
  const plan = buildSkillRenderPlan(root, root, [skill], 'codex', { destination });
  const receiptWrite = plan.writes.find((item: any) => item.kind === 'skill-projection-receipt');
  const receipt = parseSkillProjectionReceipt(receiptWrite.content);
  const targetDir = path.join(root, '.agents', 'skills', ...runtimePath.split('/'));
  for (const write of plan.writes.filter((item: any) => item.kind !== 'skill-projection-receipt')) {
    const file = path.join(targetDir, ...write.skillRelativePath.split('/'));
    put(file, Buffer.from(write.content, write.contentEncoding === 'base64' ? 'base64' : 'utf8'));
    if (write.mode === 0o100) fs.chmodSync(file, 0o744);
  }
  let previous: any = { ...receipt, adapterId: owner, agent: owner, runtimePath };
  if (v1) previous = { schemaVersion: 'buildr.runtime-skill-projection/v1', adapterId: owner, runtimePath, sources: receipt.sources, files: receipt.files, integrity: receipt.integrity };
  const receiptFile = legacy ? legacySkillProjectionOwnershipReceiptTarget(root, '.agents', owner, runtimePath) : historicalSkillProjectionOwnershipReceiptTarget(root, destination, owner, runtimePath);
  put(receiptFile, renderSkillProjectionReceipt(previous));
  return { targetDir, receiptFile, receipt: previous };
}

function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) result[path.relative(root, file)] = `link:${fs.readlinkSync(file)}`;
      else if (entry.isDirectory()) visit(file);
      else result[path.relative(root, file)] = `${fs.statSync(file).mode & 0o777}:${fs.readFileSync(file).toString('base64')}`;
    }
  }
  visit(root);
  return result;
}

function cleanupApplication(declarations: any[]) {
  const collectFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collectFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  const existsFile = (file: string) => fs.existsSync(file) && fs.lstatSync(file).isFile();
  const existsDirectory = (file: string) => fs.existsSync(file) && fs.lstatSync(file).isDirectory();
  return registerDomainsComponents({
    readSkillsManifestForWrite: () => declarations,
    listManagedDirectories: (directory: string) => existsDirectory(directory) ? fs.readdirSync(directory).filter((name) => existsDirectory(path.join(directory, name))) : [],
    collectFiles, existsFile, existsDirectory,
    toPosixRelative: (root: string, file: string) => path.relative(root, file).split(path.sep).join('/'),
  } as any);
}

function applyRemovals(root: string, removals: any[]) {
  return reconcileRuntimePlan(createRuntimePlan({
    adapterId: 'agents-standard', targetRoot: root, scope: '.', writes: [],
    removals: removals.map((item) => ({ ...item, targetFile: item.path })),
    capabilityEvidence: REQUIRED_RENDER_CAPABILITIES.map((capability) => ({ capability, supported: true })),
  }));
}

for (const owner of ['codex', 'cursor', 'trae']) {
  for (const legacy of [false, true]) {
    test(`${owner} ${legacy ? 'runtime-root' : 'canonical'} ownership and nested paths migrate together`, (t: any) => {
      const { root, skill } = fixture(t);
      const old = legacyProjection(root, skill, { owner, legacy });
      const plan = buildSkillRenderPlan(root, root, [skill], 'dsh');
      assert.ok(plan.removals.some((item: any) => item.targetFile === old.receiptFile && item.removeLast));
      applySkillRenderPlan(plan, root);
      assert.equal(fs.existsSync(old.receiptFile), false);
      assert.equal(fs.existsSync(old.targetDir), false);
      const canonical = skillProjectionOwnershipReceiptTarget(root, 'workspace', 'dsh', 'demo');
      const receipt = parseSkillProjectionReceipt(fs.readFileSync(canonical, 'utf8'));
      assert.equal(receipt.adapterId, 'agents-standard');
      assert.equal(receipt.agent, 'agents-standard');
      for (const file of receipt.files) assert.equal(runtimeFileMatches(path.join(root, '.agents', 'skills', 'demo', file.path), file.integrity, file.executable), true);
      const before = snapshot(root);
      for (const runtime of ['codex', 'dsh', 'cursor', 'trae', 'new-brand']) applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], runtime), root);
      assert.deepEqual(snapshot(root), before, 'switching runtime must not rewrite or fork ownership');
      assert.equal(listSkillProjectionOwnershipReceipts({ targetRoot: root, runtimeRoot: '.agents', destination: 'workspace', adapterId: 'cursor' }).length, 1);
    });
  }
}

test('v1 migration uses a declared legacy path and full live inventory proof', (t: any) => {
  const { root, skill } = fixture(t);
  const old = legacyProjection(root, skill, { v1: true, legacy: true });
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'dsh'), root);
  assert.equal(fs.existsSync(old.receiptFile), false);
  assert.equal(fs.existsSync(path.join(root, '.agents', 'skills', 'demo', 'SKILL.md')), true);
});

for (const kind of ['skill-edit', 'companion-edit', 'extra-file', 'destination', 'symlink', 'conflicting-owner']) {
  test(`migration preserves all files with zero writes on ${kind}`, (t: any) => {
    const { root, skill } = fixture(t);
    const old = legacyProjection(root, skill);
    if (kind === 'skill-edit') fs.appendFileSync(path.join(old.targetDir, 'SKILL.md'), '\nuser edit keeps generated marker\n');
    if (kind === 'companion-edit') put(path.join(old.targetDir, 'assets', 'bytes.bin'), 'user bytes');
    if (kind === 'extra-file') put(path.join(old.targetDir, 'references', 'user.md'), '# user\n');
    if (kind === 'destination') put(path.join(root, '.agents', 'skills', 'demo', 'SKILL.md'), buildSkillContent(root, skill));
    if (kind === 'symlink') {
      fs.rmSync(path.join(old.targetDir, 'assets', 'bytes.bin'));
      fs.symlinkSync(path.join(skill.sourceDir, 'assets', 'bytes.bin'), path.join(old.targetDir, 'assets', 'bytes.bin'));
    }
    if (kind === 'conflicting-owner') put(historicalSkillProjectionOwnershipReceiptTarget(root, 'workspace', 'trae', 'team/demo'), renderSkillProjectionReceipt({ ...old.receipt, agent: 'trae', adapterId: 'trae', sourceIdentity: 'other-source' }));
    const before = snapshot(root);
    assert.throws(() => applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'dsh'), root), /no files were changed|symbolic link/);
    assert.deepEqual(snapshot(root), before);
  });
}

test('modified managed SKILL with its marker and equal external files are never adopted', (t: any) => {
  const { root, skill } = fixture(t);
  const plan = buildSkillRenderPlan(root, root, [skill], 'codex');
  applySkillRenderPlan(plan, root);
  const file = path.join(root, '.agents', 'skills', 'demo', 'SKILL.md');
  fs.appendFileSync(file, '\nuser edit\n');
  const before = snapshot(root);
  assert.throws(() => applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'dsh'), root), /no files were changed/);
  assert.deepEqual(snapshot(root), before);
  fs.rmSync(skillProjectionOwnershipReceiptTarget(root, 'workspace', 'dsh', 'demo'));
  put(file, plan.writes.find((item: any) => item.kind === 'skill-entry').content);
  const external = snapshot(root);
  assert.throws(() => applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'codex'), root), /no files were changed/);
  assert.deepEqual(snapshot(root), external);
});

test('equivalent old owners merge into one receipt without changing payload bytes', (t: any) => {
  const { root, skill } = fixture(t);
  const old = legacyProjection(root, skill, { runtimePath: 'demo' });
  const other = historicalSkillProjectionOwnershipReceiptTarget(root, 'workspace', 'trae', 'demo');
  put(other, renderSkillProjectionReceipt({ ...old.receipt, agent: 'trae', adapterId: 'trae' }));
  const before = fs.statSync(path.join(old.targetDir, 'SKILL.md')).mtimeMs;
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'dsh'), root);
  assert.equal(fs.existsSync(old.receiptFile), false);
  assert.equal(fs.existsSync(other), false);
  assert.equal(fs.statSync(path.join(old.targetDir, 'SKILL.md')).mtimeMs, before);
});

for (const failure of ['canonical-write', 'old-file-remove', 'old-receipt-remove']) {
  test(`migration rollback restores both paths and ownership on ${failure}`, (t: any) => {
    const { root, skill } = fixture(t);
    const old = legacyProjection(root, skill);
    const before = snapshot(root);
    const plan = buildSkillRenderPlan(root, root, [skill], 'dsh');
    const target = failure === 'canonical-write' ? skillProjectionOwnershipReceiptTarget(root, 'workspace', 'dsh', 'demo') : failure === 'old-file-remove' ? path.join(old.targetDir, 'SKILL.md') : old.receiptFile;
    const method = failure === 'canonical-write' ? 'writeFileSync' : 'rmSync';
    const original: any = fs[method].bind(fs);
    let injected = false;
    t.mock.method(fs, method, (file: any, ...args: any[]) => {
      if (!injected && path.resolve(file) === target) { injected = true; throw new Error('injected migration failure'); }
      return original(file, ...args);
    });
    assert.throws(() => applySkillRenderPlan(plan, root), /injected migration failure/);
    t.mock.restoreAll();
    assert.deepEqual(snapshot(root), before);
  });
}

test('workspace migration does not mutate user ownership and inventory discovers legacy user receipts', (t: any) => {
  const { root, skill } = fixture(t);
  const home = path.join(root, 'user-home');
  fs.mkdirSync(home);
  legacyProjection(home, skill, { destination: 'user' });
  legacyProjection(root, skill);
  const beforeUser = snapshot(home);
  const inventory = buildEffectiveSkillInventory({ adapterId: 'agents-standard', runtimeId: 'dsh', workspaceRoot: root, userHome: home, candidateIds: ['demo'] });
  assert.equal(inventory.entries.filter((entry: any) => entry.sourceCategory === 'buildr-managed').length, 2);
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'dsh'), root);
  assert.deepEqual(snapshot(home), beforeUser);
  applySkillRenderPlan(buildSkillRenderPlan(root, home, [skill], 'dsh', { destination: 'user' }), home);
  assert.equal(fs.existsSync(skillProjectionOwnershipReceiptTarget(home, 'user', 'dsh', 'demo')), true);
  assert.equal(fs.existsSync(path.join(home, '.buildr', 'agent-runtime', 'workspace')), false);
});

test('shared cleanup preserves caller-inapplicable live Skills and removes disabled aliases exactly once', (t: any) => {
  const { root, skill } = fixture(t);
  const old = legacyProjection(root, skill);
  const declarations: any[] = [{ id: 'demo', path: 'team/demo', runtimePath: 'demo', runtimes: ['codex'] }];
  const app = cleanupApplication(declarations);
  assert.deepEqual(app.buildRuntimeOrphanRemovalPlan(root, 'agents-standard', '.', { runtimeId: 'dsh' }), []);
  declarations[0].enabled = false;
  const removals = app.buildRuntimeOrphanRemovalPlan(root, 'agents-standard', '.', { runtimeId: 'dsh' });
  assert.equal(removals.length, old.receipt.files.length + 1);
  applyRemovals(root, removals);
  assert.equal(fs.existsSync(old.targetDir), false);
  assert.equal(fs.existsSync(old.receiptFile), false);
});

test('cleanup preserves marker-only history and modified owned files', (t: any) => {
  const { root, skill } = fixture(t);
  const app = cleanupApplication([]);
  put(path.join(root, '.agents', 'skills', 'unproven', 'SKILL.md'), '<!-- Generated by Buildr. user kept marker -->\nuser content\n');
  const before = snapshot(root);
  assert.throws(() => app.buildRuntimeOrphanRemovalPlan(root, 'dsh'), /缺少完整所有权回执/);
  assert.deepEqual(snapshot(root), before);
  fs.rmSync(path.join(root, '.agents', 'skills', 'unproven'), { recursive: true });
  const old = legacyProjection(root, skill);
  fs.appendFileSync(path.join(old.targetDir, 'SKILL.md'), '\nuser change\n');
  const edited = snapshot(root);
  assert.throws(() => app.buildRuntimeOrphanRemovalPlan(root, 'dsh'), /受管文件已修改/);
  assert.deepEqual(snapshot(root), edited);
});

for (const kind of ['payload', 'receipt']) {
  for (const transition of ['appeared', 'disappeared', 'changed']) {
    test(`observed ${kind} ${transition} invalidates a stale write plan with zero writes`, (t: any) => {
      const { root, skill } = fixture(t);
      if (transition !== 'appeared') applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'codex'), root);
      const plan = buildSkillRenderPlan(root, root, [skill], 'dsh');
      const target = kind === 'payload' ? path.join(root, '.agents', 'skills', 'demo', 'SKILL.md') : skillProjectionOwnershipReceiptTarget(root, 'workspace', 'dsh', 'demo');
      if (transition === 'disappeared') fs.rmSync(target);
      else put(target, 'another writer owns this state\n');
      const before = snapshot(root);
      assert.throws(() => applySkillRenderPlan(plan, root), /no files were changed/);
      assert.deepEqual(snapshot(root), before);
    });
  }
}

test('observed deletion after outer preflight is rechecked inside the shared projection lock', (t: any) => {
  const { root, skill } = fixture(t);
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'codex'), root);
  const plan = buildSkillRenderPlan(root, root, [skill], 'dsh');
  const payload = path.join(root, '.agents', 'skills', 'demo', 'SKILL.md');
  const canonical = skillProjectionOwnershipReceiptTarget(root, 'workspace', 'dsh', 'demo');
  const receiptBefore = fs.readFileSync(canonical);
  const link = fs.linkSync.bind(fs);
  let deleted = false;
  t.mock.method(fs, 'linkSync', (source: any, target: any) => {
    link(source, target);
    if (!deleted && path.basename(target) === 'projection.lock') { deleted = true; fs.rmSync(payload); }
  });
  assert.throws(() => applySkillRenderPlan(plan, root), /no files were changed/);
  assert.equal(deleted, true);
  assert.equal(fs.existsSync(payload), false, 'do not undo another writer deletion');
  assert.deepEqual(fs.readFileSync(canonical), receiptBefore);
});

test('a missing payload observed before planning can still be explicitly repaired', (t: any) => {
  const { root, skill } = fixture(t);
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'codex'), root);
  const payload = path.join(root, '.agents', 'skills', 'demo', 'SKILL.md');
  fs.rmSync(payload);
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'dsh'), root);
  assert.equal(fs.readFileSync(payload, 'utf8'), buildSkillContent(root, skill));
});

test('unknown historical owner directories are not aliases and contradictory owner fields are rejected', (t: any) => {
  const { root, skill } = fixture(t);
  const old = legacyProjection(root, skill, { owner: 'unregistered-owner' });
  let before = snapshot(root);
  assert.throws(() => buildSkillRenderPlan(root, root, [skill], 'dsh'), /no proven owner/);
  assert.deepEqual(snapshot(root), before);
  fs.rmSync(old.receiptFile);
  put(historicalSkillProjectionOwnershipReceiptTarget(root, 'workspace', 'codex', 'team/demo'), renderSkillProjectionReceipt({ ...old.receipt, adapterId: 'codex', agent: 'foreign-owner' }));
  before = snapshot(root);
  assert.throws(() => buildSkillRenderPlan(root, root, [skill], 'dsh'), /owner identity/);
  assert.deepEqual(snapshot(root), before);
});

test('builtin uninstall restores the canonical receipt after a later root fails', (t: any) => {
  const { root, skill } = fixture(t);
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'dsh'), root);
  const canonical = skillProjectionOwnershipReceiptTarget(root, 'workspace', 'dsh', 'demo');
  const beforeReceipt = fs.readFileSync(canonical);
  const beforePayload = fs.readFileSync(path.join(root, '.agents', 'skills', 'demo', 'SKILL.md'));
  const beforeSource = fs.readFileSync(skill.sourceFile);
  const declaration = { id: 'demo', source: 'buildr', path: 'team/demo', runtimePath: 'demo', enabled: true };
  const manifest = path.join(root, 'skills', 'manifest.yml');
  put(manifest, YAML.stringify({ schemaVersion: 'buildr.skills/v1', skills: [declaration] }));
  const beforeManifest = fs.readFileSync(manifest);
  const existsFile = (file: string) => fs.existsSync(file) && fs.lstatSync(file).isFile();
  const existsDirectory = (file: string) => fs.existsSync(file) && fs.lstatSync(file).isDirectory();
  const toPosixRelative = (base: string, file: string) => path.relative(base, file).split(path.sep).join('/');
  const mutation = createWorkspaceMutation({ ensureDirectory: (directory: string) => fs.mkdirSync(directory, { recursive: true }), existsFile, toPosixRelative, workspaceSymlinkSegment: () => null });
  const cleanup = cleanupApplication([declaration]);
  let firstRootRemoved = false;
  const lifecycle = createBuiltinLifecycle({
    fs, path, process, getRuntimeAdapter, SUPPORTED_AGENT_IDS: ['agents-standard', 'qoder'],
    existsFile, existsDirectory, toPosixRelative, withWorkspaceMutation: mutation.withWorkspaceMutation,
    assertInitializedBuildrWorkspace: () => {}, assertNoUnknownOptions: () => {},
    positionalArgs: (args: string[]) => [args[0]],
    optionValue: (args: string[], flag: string, fallback: any) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback,
    readPackageManifest: () => ({ builtins: { skills: [{ id: 'demo' }], rules: [], commands: [] } }),
    readRulesManifestForWrite: () => ({ rules: [] }),
    readSkillsManifestForWrite: () => YAML.parse(fs.readFileSync(manifest, 'utf8')).skills,
    readBuiltinReceipts: () => ({ builtins: [] }),
    writeSkillsManifest: (_root: string, skills: any[]) => { put(manifest, YAML.stringify({ schemaVersion: 'buildr.skills/v1', skills })); return manifest; },
    buildRuntimeOrphanRemovalPlan: (...args: any[]) => {
      if (args[1] === 'qoder') {
        assert.equal(fs.existsSync(path.join(root, '.buildr', 'agent-runtime', 'projection.lock')), true, 'the lock must span every root and rollback');
        firstRootRemoved = !fs.existsSync(canonical);
        throw new Error('injected second root failure');
      }
      return (cleanup.buildRuntimeOrphanRemovalPlan as any)(...args);
    },
  });
  assert.throws(() => lifecycle.builtinUninstall(['demo', '--target', root]), /injected second root failure/);
  assert.equal(firstRootRemoved, true, 'the first root must have actually committed before failure');
  assert.deepEqual(fs.readFileSync(canonical), beforeReceipt);
  assert.deepEqual(fs.readFileSync(path.join(root, '.agents', 'skills', 'demo', 'SKILL.md')), beforePayload);
  assert.deepEqual(fs.readFileSync(skill.sourceFile), beforeSource);
  assert.deepEqual(fs.readFileSync(manifest), beforeManifest);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'agent-runtime', 'projection.lock')), false);
  put(path.join(root, '.buildr', 'mutations', 'lock.json'), JSON.stringify({ transactionId: 'occupied', operation: 'other-source-writer' }));
  assert.throws(() => lifecycle.builtinUninstall(['demo', '--target', root]), /incomplete transaction/);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'agent-runtime', 'projection.lock')), false, 'a busy source lock must release the projection lock immediately');
});

test('concurrent shared writers cannot commit incompatible payload and receipts', async (t: any) => {
  const { root, skill } = fixture(t);
  const module = fileURLToPath(new URL('../../src/modules/agent-assets/infrastructure/runtime/skills/render-plan.ts', import.meta.url));
  const script = `import {buildSkillRenderPlan,applySkillRenderPlan} from ${JSON.stringify(module)}; const [root,raw,tag]=process.argv.slice(1); const skill=JSON.parse(raw); skill.sourceContent += '\\n'+tag+'\\n'; const plan=buildSkillRenderPlan(root,root,[skill],tag); process.send('ready'); process.once('message',()=>{try{applySkillRenderPlan(plan,root);process.send('written')}catch(e){process.send('conflict')}process.disconnect()});`;
  const children = ['codex', 'dsh'].map((runtime) => spawn(process.execPath, ['--input-type=module', '-e', script, root, JSON.stringify({ ...skill, sourceContent: fs.readFileSync(skill.sourceFile, 'utf8') }), runtime], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }));
  t.after(() => children.forEach((child) => child.kill()));
  const waitMessage = (child: any) => new Promise<string>((resolve, reject) => { child.once('message', resolve); child.once('error', reject); child.once('exit', (code: number) => { if (code) reject(new Error(`child exited ${code}`)); }); });
  await Promise.all(children.map(waitMessage));
  const results = children.map(waitMessage);
  children.forEach((child) => child.send('apply'));
  assert.deepEqual((await Promise.all(results)).sort(), ['conflict', 'written']);
  const receipt = parseSkillProjectionReceipt(fs.readFileSync(skillProjectionOwnershipReceiptTarget(root, 'workspace', 'dsh', 'demo'), 'utf8'));
  for (const file of receipt.files) assert.equal(runtimeFileMatches(path.join(root, '.agents', 'skills', 'demo', file.path), file.integrity, file.executable), true);
});
