import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { describe, test } from 'node:test';
import YAML from 'yaml';

const buildr = path.resolve('bin/buildr.mjs');

function run(args, expected = 0, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildr, ...args], options);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      try {
        assert.equal(status, expected, `buildr ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
        resolve({ status, stdout, stderr });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function writeSkill(root, id) {
  const directory = path.join(root, `${id}-source`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${id}\ndescription: ${id} fixture\n---\n\n# ${id}\n`);
  return directory;
}

function manifest(root, scope = '.') {
  const scopeRoot = scope === '.' ? root : path.join(root, scope);
  return YAML.parse(fs.readFileSync(path.join(scopeRoot, 'skills', 'manifest.yml'), 'utf8'));
}

async function doctor(root, scope = '.', expected = 0) {
  const result = await run(['doctor', '--target', root, '--scope', scope, '--json'], expected);
  return JSON.parse(result.stdout);
}

function consumer(result, scope, id) {
  const graph = result.capabilities.graphs.find((item) => item.scope === scope);
  return graph?.consumers.find((item) => item.consumer === id);
}

describe('capability CLI integration', { concurrency: 2 }, () => {

test('CLI 集成验证 provider 替换、绑定与 builtin 恢复', { concurrency: true }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capability-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--target', root, '--name', 'capability-cli', '--profile', 'personal']);

  await run([
    'skills', 'add', 'invalid-provider', '--remote-source', 'https://example.com/invalid-provider', '--scope', '.', '--target', root,
    '--provides', 'example.unknown@1',
  ], 1);
  assert.equal(manifest(root).skills.some((item) => item.id === 'invalid-provider'), false, 'unknown contract declaration must fail before write');

  const internalSource = writeSkill(root, 'internal-git');
  await run([
    'skills', 'add', '--source', internalSource, '--scope', '.', '--target', root,
    '--provides', 'buildr.git-single-operation@1',
    '--provides', 'buildr.git-task-integration@1',
    '--provides', 'buildr.git-workspace-update@1',
  ]);
  let workspaceManifest = manifest(root);
  assert.equal(workspaceManifest.schemaVersion, 'buildr.skills/v3');
  assert.equal(workspaceManifest.bindings.find((item) => item.capability === 'buildr.git-task-integration').provider, 'git-ops', 'provider install must not silently change binding');

  for (const capability of ['buildr.git-single-operation@1', 'buildr.git-task-integration@1', 'buildr.git-workspace-update@1']) {
    await run(['skills', 'bind', capability, '--provider', 'internal-git', '--scope', '.', '--target', root]);
  }
  const internalWorktreeSource = writeSkill(root, 'internal-worktree');
  await run([
    'skills', 'add', '--source', internalWorktreeSource, '--scope', '.', '--target', root,
    '--provides', 'buildr.task-worktree-lifecycle@2',
  ]);
  assert.equal(manifest(root).bindings.find((item) => item.capability === 'buildr.task-worktree-lifecycle').provider, 'task-worktree');
  await run(['skills', 'bind', 'buildr.task-worktree-lifecycle@2', '--provider', 'internal-worktree', '--scope', '.', '--target', root]);
  await run(['builtin', 'uninstall', 'task-worktree', '--target', root, '--reason', 'internal replacement']);
  const internalVerificationSource = writeSkill(root, 'internal-verification');
  await run([
    'skills', 'add', '--source', internalVerificationSource, '--scope', '.', '--target', root,
    '--provides', 'buildr.task-verification@2',
  ]);
  assert.equal(manifest(root).bindings.find((item) => item.capability === 'buildr.task-verification').provider, 'task-verification');
  await run(['skills', 'bind', 'buildr.task-verification@2', '--provider', 'internal-verification', '--scope', '.', '--target', root]);
  await run(['builtin', 'uninstall', 'task-verification', '--target', root, '--reason', 'internal replacement']);
  const uninstallGit = await run(['builtin', 'uninstall', 'git-ops', '--target', root, '--reason', 'internal replacement']);
  assert.doesNotMatch(uninstallGit.stdout, /Capability dependency impact（写入前）/, 'unselected builtin must not report a false dependency impact');
  workspaceManifest = manifest(root);
  assert.equal(workspaceManifest.skills.find((item) => item.id === 'git-ops').state, 'uninstalled');
  const readyDoctor = await doctor(root);
  assert.equal(consumer(readyDoctor, '.', 'task-finish').readiness, 'ready');
  assert.doesNotMatch(JSON.stringify(readyDoctor.capabilities), /sourceFile|absolutePath|skillContributions/);
  const humanDoctor = await run(['doctor', '--target', root, '--scope', '.']);
  assert.match(humanDoctor.stdout, /Capability readiness（ready 只表示结构可路由）：/);
  assert.match(humanDoctor.stdout, /buildr\.git-task-integration@1 mode=required readiness=ready reason=none selected=internal-git/);
  assert.match(humanDoctor.stdout, /buildr\.task-verification@2 mode=required readiness=ready reason=none selected=internal-verification/);

  await run(['builtin', 'restore', 'git-ops', '--target', root]);
  assert.equal(manifest(root).skills.find((item) => item.id === 'git-ops').state, 'installed');
});

test('CLI 集成验证 optional provider 卸载后 consumer 降级', { concurrency: true }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capability-optional-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--target', root, '--name', 'capability-optional', '--profile', 'personal']);
  const uninstallReview = await run(['builtin', 'uninstall', 'task-asset-review', '--target', root, '--reason', 'optional fixture']);
  assert.match(uninstallReview.stdout, /\[optional\].*task-finish.*buildr\.task-asset-review@3/);
  assert.equal(consumer(await doctor(root), '.', 'task-finish').readiness, 'degraded');
});

test('CLI 集成验证 provider 歧义、legacy Project 拒绝与 Project override', { concurrency: true }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capability-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--target', root, '--name', 'capability-project', '--profile', 'personal']);
  const internalSource = writeSkill(root, 'internal-git');
  await run(['skills', 'add', '--source', internalSource, '--target', root, '--provides', 'buildr.git-task-integration@1']);
  const unbind = await run(['skills', 'unbind', 'buildr.git-task-integration@1', '--scope', '.', '--target', root]);
  assert.match(unbind.stdout, /\[required\].*task-finish.*buildr\.git-task-integration@1/);
  const ambiguous = consumer(await doctor(root, '.', 1), '.', 'task-finish');
  assert.equal(ambiguous.readiness, 'blocked');
  assert.equal(ambiguous.dependencies.find((item) => item.capability === 'buildr.git-task-integration').reason, 'ambiguous_provider');

  await run(['project', 'create', 'demo', '--target', root]);
  assert.equal(fs.existsSync(path.join(root, 'projects', 'demo', 'skills')), false, 'new Project must not create a Skill source scope');
  const projectManifestPath = path.join(root, 'projects', 'demo', 'skills', 'manifest.yml');
  fs.mkdirSync(path.dirname(projectManifestPath), { recursive: true });
  fs.writeFileSync(projectManifestPath, 'schemaVersion: buildr.skills/v1\nskills: []\n');
  assert.ok((await doctor(root, 'projects/demo', 1)).findings.some((finding) => finding.code === 'skills.project_assets_legacy'));
  const projectSource = writeSkill(root, 'project-git');
  await run([
    'skills', 'add', '--source', projectSource, '--scope', 'projects/demo', '--target', root,
    '--provides', 'buildr.git-task-integration@1',
  ], 1);
  assert.equal(YAML.parse(fs.readFileSync(projectManifestPath, 'utf8')).schemaVersion, 'buildr.skills/v1', 'rejected Project source mutation must write nothing');
  await run(['skills', 'add', '--source', projectSource, '--target', root, '--provides', 'buildr.git-task-integration@1']);
  await run(['skills', 'bind', 'buildr.git-task-integration@1', '--provider', 'project-git', '--scope', 'projects/demo', '--target', root]);
  const projectFinish = consumer(await doctor(root, 'projects/demo', 1), 'projects/demo', 'task-finish');
  assert.equal(projectFinish.readiness, 'ready', 'Project binding resolves the required provider while optional review remains installed');
  assert.equal(projectFinish.dependencies.find((item) => item.capability === 'buildr.git-task-integration').selectedProvider.id, 'project-git');

  const projectCapabilities = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'demo', 'capabilities.yml'), 'utf8'));
  assert.equal(projectCapabilities.schemaVersion, 'buildr.project-capabilities/v1');
  assert.equal(projectCapabilities.bindings[0].provider, 'project-git');
});

test('skills render 将 source workspace 与 user/workspace destination 分离并复用用户投射', { concurrency: true }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skill-destination-'));
  const userHome = path.join(root, 'user-home');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(userHome, { recursive: true });
  const env = { ...process.env, HOME: userHome };
  await run(['init', '--target', root, '--name', 'destinations', '--profile', 'personal'], 0, { env });
  await run(['skills', 'render', 'codex', '--destination', 'user', '--target', root], 0, { env });
  const userSkill = path.join(userHome, '.agents', 'skills', 'task-triage', 'SKILL.md');
  assert.equal(fs.existsSync(userSkill), true);
  assert.equal(fs.existsSync(path.join(root, '.agents', 'skills', 'task-triage', 'SKILL.md')), false);
  const receipt = JSON.parse(fs.readFileSync(path.join(userHome, '.agents', 'buildr', 'skill-projection-receipts', 'codex', 'task-triage.json'), 'utf8'));
  assert.equal(receipt.schemaVersion, 'buildr.skill-projection/v2');
  assert.equal(receipt.destination, 'user');
  assert.ok(receipt.assetIdentity && receipt.sourceIdentity && receipt.sourceDigest && receipt.renderDigest);
  const local = await run(['skills', 'render', 'codex', '--destination', 'workspace', '--target', root], 0, { env });
  assert.equal(fs.existsSync(path.join(root, '.agents', 'skills', 'task-triage', 'SKILL.md')), false, 'same user asset must satisfy workspace without duplicate projection');
  assert.equal(fs.existsSync(path.join(root, '.agents', 'buildr', 'skill-satisfaction', 'codex', 'task-triage.json')), true);
  assert.doesNotMatch(local.stderr, /runtime\.skill_visibility_incomplete/);
});

test('skills render 对用户层同名外部资产输出稳定 JSON 并整次零写入', { concurrency: true }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skill-conflict-'));
  const userHome = path.join(root, 'user-home');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const external = path.join(userHome, '.agents', 'skills', 'task-triage');
  fs.mkdirSync(external, { recursive: true });
  fs.writeFileSync(path.join(external, 'SKILL.md'), '---\nname: task-triage\ndescription: foreign\n---\nforeign\n');
  const env = { ...process.env, HOME: userHome };
  await run(['init', '--target', root, '--name', 'conflict', '--profile', 'personal'], 0, { env });
  const result = await run(['skills', 'render', 'codex', '--destination', 'workspace', '--target', root, '--json'], 1, { env });
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 'buildr.skill-conflict-report/v1');
  const conflict = report.conflicts.find((item) => item.skillId === 'task-triage');
  assert.equal(conflict.reason, 'name_conflict');
  assert.ok(conflict.assetIdentity && conflict.sourceIdentity && conflict.renderDigest);
  assert.equal(conflict.nextActions.length, 3);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false, 'blocking preflight must write no candidate or receipt');
});

test('legacy Project Skill migration check/apply 事务化迁移并对同名异内容零写入', { concurrency: true }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-skill-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--target', root, '--name', 'migration', '--profile', 'personal']);
  await run(['project', 'create', 'demo', '--target', root]);
  const legacyRoot = path.join(root, 'projects', 'demo', 'skills');
  fs.mkdirSync(path.join(legacyRoot, 'legacy-demo'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'legacy-demo', 'SKILL.md'), '---\nname: legacy-demo\ndescription: legacy\n---\nbody\n');
  fs.writeFileSync(path.join(legacyRoot, 'manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.skills/v2', skills: [{ id: 'legacy-demo', path: 'legacy-demo' }] }));
  const check = JSON.parse((await run(['skills', 'migrate-project-assets', '--target', root, '--check', '--json'])).stdout);
  assert.equal(check.blocking, false);
  assert.equal(check.projects[0].skills[0].classification, 'project_only');
  await run(['skills', 'migrate-project-assets', '--target', root, '--apply']);
  assert.equal(fs.existsSync(legacyRoot), false);
  assert.equal(fs.existsSync(path.join(root, 'skills', 'legacy-demo', 'SKILL.md')), true);
  assert.equal(manifest(root).schemaVersion, 'buildr.skills/v3');
  const capabilities = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'demo', 'capabilities.yml'), 'utf8'));
  assert.deepEqual(capabilities.skills, ['legacy-demo']);

  await run(['project', 'create', 'other', '--target', root]);
  const conflictRoot = path.join(root, 'projects', 'other', 'skills');
  fs.mkdirSync(path.join(conflictRoot, 'legacy-demo'), { recursive: true });
  fs.writeFileSync(path.join(conflictRoot, 'legacy-demo', 'SKILL.md'), '---\nname: legacy-demo\ndescription: different\n---\ndifferent\n');
  fs.writeFileSync(path.join(conflictRoot, 'manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.skills/v2', skills: [{ id: 'legacy-demo', path: 'legacy-demo' }] }));
  const before = fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8');
  await run(['skills', 'migrate-project-assets', '--target', root, '--apply'], 1);
  assert.equal(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'), before);
  assert.equal(fs.existsSync(conflictRoot), true);
});

});
