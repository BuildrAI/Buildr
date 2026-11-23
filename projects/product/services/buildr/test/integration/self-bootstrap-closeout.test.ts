import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runDirectSelfBootstrapCloseout, runSelfBootstrapCloseoutCommand } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { DEFAULT_DEVELOPMENT_WEB_PORT } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';
import { parseTaskCommitTrailer } from '../../src/modules/task/commits/domain/task-commit.ts';
import { git, executor, writeSyncResume, createSelfBootstrapCloseoutFixtures } from '../helpers/self-bootstrap-closeout-fixture.ts';

const { fixture, directFixture, syncResumeFixture } = createSelfBootstrapCloseoutFixtures();

test('prepared closeout sandboxes isolate files, Git refs, indexes and remotes', t => {
  const first = fixture(t), second = fixture(t);
  fs.writeFileSync(path.join(first.root, 'skills/generated/SKILL.md'), 'changed only here\n');
  git(first.root, 'add', '.'); git(first.root, 'commit', '-m', 'isolated mutation');
  git(first.root, 'push', 'origin', 'dev');
  assert.equal(fs.readFileSync(path.join(second.root, 'skills/generated/SKILL.md'), 'utf8'), 'v1\n');
  assert.equal(git(second.root, 'rev-parse', 'HEAD'), second.baseRef);
  assert.equal(git(second.root, 'status', '--porcelain'), '');
  assert.equal(git(second.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s/u)[0], second.baseRef);
  assert.notEqual(git(first.root, 'rev-parse', 'HEAD'), second.baseRef);
  assert.notEqual(first.remote, second.remote);
});

test('explicit sync resume commits the reviewed snapshot at a fresh delivered HEAD without repeating sync', (t: any) => {
  const current = syncResumeFixture(t);
  // An independently delivered owner repair can advance HEAD while preserving the sync snapshot.
  git(current.root, 'commit', '--allow-empty', '-m', 'delivered owner repair');
  git(current.root, 'push', 'origin', 'dev');
  current.request.expectedHead = git(current.root, 'rev-parse', 'HEAD');
  git(current.root, 'add', '--', 'skills/manifest.yml');
  current.request.stagedPaths = ['skills/manifest.yml'];
  writeSyncResume(current);
  const calls: any[] = [];
  const perform = executor(current.root);
  const result: any = runSelfBootstrapCloseoutCommand({
    args: ['--target', current.root, '--base-ref', current.input.baseRef, '--delivered-ref', current.input.deliveredRef,
      '--branch', 'dev', '--remote', 'origin', '--agent', 'codex', '--node-executable', process.execPath, '--resume-sync', current.resumeSync],
    environment: current.environment,
    execute: (command: any, args: any, context: any) => { calls.push([command, ...args]); return perform(command, args, context); },
  });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.phases.some((stage: any) => stage.id === 'sync'), false);
  assert.equal(calls.some(args => args.includes('sync')), false);
  assert.equal(result.phases[0].effects[0].type, 'workspace-sync-resume');
  assert.equal(git(current.root, 'rev-parse', 'HEAD^'), current.request.expectedHead);
  assert.deepEqual(git(current.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.successor).split('\n').sort(), current.request.files.map((file: any) => file.path));
  assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], result.successor);
  assert.equal(git(current.root, 'status', '--porcelain'), '');
  assert.ok(result.phases.some((stage: any) => stage.id === 'verify-development-entry' && stage.status === 'passed'));
  assert.ok(result.phases.some((stage: any) => stage.id === 'finalize' && stage.status === 'passed'));
});

for (const scenario of ['content', 'extra-path', 'missing-path', 'staging', 'partial-staging', 'head', 'remote', 'unsafe-path', 'traversal', 'symlink']) {
  test(`sync resume rejects ${scenario} drift without staging, committing or pushing`, (t: any) => {
    const current = syncResumeFixture(t);
    const first = current.request.files[0];
    if (scenario === 'content') fs.appendFileSync(path.join(current.root, first.path), 'changed\n');
    if (scenario === 'extra-path') fs.writeFileSync(path.join(current.root, 'skills/buildr/generated/other.md'), 'unreviewed\n');
    if (scenario === 'missing-path') fs.unlinkSync(path.join(current.root, first.path));
    if (scenario === 'staging') {
      fs.writeFileSync(path.join(current.root, 'user-staged.txt'), 'unrelated staged work\n');
      git(current.root, 'add', '--', 'user-staged.txt');
    }
    if (scenario === 'partial-staging') {
      git(current.root, 'add', '--', first.path);
      fs.appendFileSync(path.join(current.root, first.path), 'working copy differs\n');
      current.request.stagedPaths = [first.path];
      first.sha256 = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(current.root, first.path))).digest('hex')}`;
    }
    if (scenario === 'head') git(current.root, 'commit', '--allow-empty', '-m', 'unexpected HEAD');
    if (scenario === 'remote') git(current.root, '--git-dir', current.remote, 'update-ref', 'refs/heads/dev', current.baseRef);
    if (scenario === 'unsafe-path' || scenario === 'symlink') {
      const relative = scenario === 'unsafe-path' ? 'projects/product/services/buildr/src/unreviewed.ts' : 'skills/buildr/generated/link.md';
      fs.mkdirSync(path.dirname(path.join(current.root, relative)), { recursive: true });
      if (scenario === 'symlink') fs.symlinkSync(path.join(current.root, first.path), path.join(current.root, relative));
      else fs.writeFileSync(path.join(current.root, relative), 'outside sync sources\n');
      current.request.files.push({ path: relative, sha256: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(current.root, relative))).digest('hex')}` });
    }
    if (scenario === 'traversal') first.path = 'skills/buildr/../manifest.yml';
    writeSyncResume(current);
    const before = git(current.root, 'rev-parse', 'HEAD');
    const calls: any[] = [];
    const perform = executor(current.root);
    const result: any = runDirectSelfBootstrapCloseout({ ...current.input, resumeSync: current.resumeSync,
      execute: (command: any, args: any, context: any) => { calls.push([command, ...args]); return perform(command, args, context); } });
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), before);
    assert.equal(calls.some(args => args[0] === 'git' && ['add', 'commit', 'push'].includes(args[1])), false);
    assert.equal(calls.some(args => args.includes('sync')), false);
  });
}

for (const field of ['baseRef', 'deliveredRef', 'targetBranch', 'remote', 'agent', 'workspaceRoot']) {
  test(`sync resume rejects a mismatched ${field} input before writes`, (t: any) => {
    const current = syncResumeFixture(t);
    current.request[field] = field.endsWith('Ref') ? current.baseRef : 'different-input';
    if (field === 'baseRef') current.request[field] = current.input.deliveredRef;
    writeSyncResume(current);
    const calls: any[] = [];
    const perform = executor(current.root);
    const result: any = runDirectSelfBootstrapCloseout({ ...current.input, resumeSync: current.resumeSync,
      execute: (command: any, args: any, context: any) => { calls.push([command, ...args]); return perform(command, args, context); } });
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
    assert.equal(calls.some(args => args[0] === 'git' && ['add', 'commit', 'push'].includes(args[1])), false);
  });
}

for (const scenario of ['working-file', 'index-blob']) {
  test(`sync resume rejects ${scenario} changes during staging before commit`, (t: any) => {
    const current = syncResumeFixture(t);
    writeSyncResume(current);
    const perform = executor(current.root);
    const calls: any[] = [];
    const first = current.request.files[0];
    const result: any = runDirectSelfBootstrapCloseout({ ...current.input, resumeSync: current.resumeSync,
      execute: (command: any, args: any, context: any) => {
        calls.push([command, ...args]);
        if (command === 'git' && args[0] === 'add' && scenario === 'working-file') fs.appendFileSync(path.join(current.root, first.path), 'changed while staging\n');
        if (command === 'git' && args[0] === 'show' && args[1] === `:${first.path}` && scenario === 'index-blob') {
          const original = fs.readFileSync(path.join(current.root, first.path));
          fs.appendFileSync(path.join(current.root, first.path), 'unreviewed index bytes\n');
          git(current.root, 'add', '--', first.path);
          fs.writeFileSync(path.join(current.root, first.path), original);
        }
        return perform(command, args, context);
      } });
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
    assert.equal(calls.some(args => args[0] === 'git' && ['commit', 'push'].includes(args[1])), false);
    assert.equal(calls.some(args => args.includes('sync')), false);
  });
}

test('direct activation uses real Git without Finish and does not repeat a successful push', (t: any) => {
  const current: any = directFixture(t);
  const calls: any[] = [];
  const perform: any = executor(current.root, current.options);
  const execute: any = (exe: any, args: any, context: any) => { calls.push([exe, ...args]); return perform(exe, args, context); };
  const first: any = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(first.status, 'passed', JSON.stringify(first));
  assert.equal(first.runId, null);
  assert.equal(first.delivery.observed, true);
  const message = git(current.root, 'show', '-s', '--format=%B', first.successor);
  assert.equal(message.split(/\r?\n/).filter((line: string) => line === `Buildr-Task: ${current.input.taskId}`).length, 1);
  assert.equal(parseTaskCommitTrailer(message).taskId, current.input.taskId);
  assert.match(message, /^Buildr-Activation-Identity: sha256-[a-f0-9]{64}$/m);
  assert.ok(message.includes(`Buildr-Activation-Task: ${current.input.taskId}`));
  assert.ok(message.includes(`Buildr-Activation-Delivery: ${current.input.deliveredRef}`));
  assert.equal(calls.some((args: any) => args.includes('finish') || args.some((arg: any) => typeof arg === 'string' && arg.endsWith('task-finish-target-lease-driver.mjs'))), false);
  assert.equal(calls.filter((args: any) => args[0] === 'git' && args[1] === 'push').length, 1);
  calls.length = 0;
  const second: any = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(second.status, 'passed', JSON.stringify(second));
  assert.equal(calls.filter((args: any) => args[0] === 'git' && args[1] === 'push').length, 0);
});

test('direct activation prepares the current Agent package before importing new Product HTTP schemas', (t: any) => {
  const current = directFixture(t), calls: string[][] = [];
  const perform = executor(current.root, { ...current.options, requiresAgentPreparation: true });
  const result = runDirectSelfBootstrapCloseout({ ...current.input, execute: (exe: string, args: string[], context: any) => {
    calls.push([exe, ...args]); return perform(exe, args, context);
  } });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  const preparation = calls.findIndex(args => args[1]?.endsWith('/tools/development/prepare-development-agent.ts'));
  const sync = calls.findIndex(args => args[2] === 'sync');
  assert.ok(preparation >= 0 && preparation < sync, JSON.stringify(calls));
  assert.equal(calls[preparation]![0], process.execPath);
  assert.equal(calls.filter(args => args[1]?.endsWith('/tools/development/prepare-development-agent.ts')).length, 1);
});

test('failed Agent preparation preserves delivery and never syncs or stops the running application', (t: any) => {
  const current = directFixture(t), calls: string[][] = [];
  const perform = executor(current.root, { ...current.options, failAgentPreparation: true, runningDevelopmentInstance: true });
  const result = runDirectSelfBootstrapCloseout({ ...current.input, execute: (exe: string, args: string[], context: any) => {
    calls.push([exe, ...args]); return perform(exe, args, context);
  } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic?.code, 'self-bootstrap-closeout.agent-preparation-failed');
  assert.equal(result.delivery.observed, true);
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
  assert.equal(git(current.root, 'status', '--porcelain'), '');
  assert.equal(calls.some(args => args.includes('sync') || args.includes('install') || args.includes('restart')), false);
});

test('direct activation resumes only its own committed successor after push failure', (t: any) => {
  const current: any = directFixture(t);
  const first: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, { ...current.options, failPush: true }) });
  assert.equal(first.status, 'blocked');
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  assert.equal(first.delivery.observed, true);
  const successor: any = git(current.root, 'rev-parse', 'HEAD');
  assert.notEqual(successor, current.input.deliveredRef);
  const recovered: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(recovered.status, 'passed', JSON.stringify(recovered));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), successor);
  assert.equal(recovered.phases.some((stage: any) => stage.id === 'commit'), false);
});

test('direct activation preserves dirty work regardless of Task metadata', (t: any) => {
  const current: any = directFixture(t);
  fs.writeFileSync(path.join(current.root, 'user-work.txt'), 'keep me\n');
  const blocked: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.equal(fs.readFileSync(path.join(current.root, 'user-work.txt'), 'utf8'), 'keep me\n');
  const noTask: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root) });
  assert.equal(noTask.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
});

test('CLI activates without a Task and never reads or writes Task records', (t: any) => {
  const current: any = directFixture(t);
  const calls: any[] = [];
  const perform = executor(current.root);
  const result: any = runSelfBootstrapCloseoutCommand({
    args: ['--target', current.root, '--base-ref', current.baseRef, '--delivered-ref', current.input.deliveredRef,
      '--branch', 'dev', '--remote', 'origin', '--agent', 'codex', '--node-executable', process.execPath],
    environment: current.environment,
    execute: (command: any, args: any, context: any) => { calls.push(args); return perform(command, args, context); },
  });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.taskId, null);
  assert.equal(calls.some(args => args.includes('task')), false);
  assert.equal(fs.readFileSync(path.join(current.root, 'skills/generated/SKILL.md'), 'utf8'), 'v2\n');
  const message = git(current.root, 'show', '-s', '--format=%B', result.successor);
  assert.doesNotMatch(message, /^Buildr-(?:Activation-)?Task:/m);
  assert.equal(parseTaskCommitTrailer(message).taskId, null);
});

test('an optional unfinished or unavailable Task does not gate activation', (t: any) => {
  const current: any = directFixture(t);
  const calls: any[] = [];
  const perform = executor(current.root, { taskInspectionFailures: [current.input.taskId] });
  const result: any = runDirectSelfBootstrapCloseout({ ...current.input,
    execute: (command: any, args: any, context: any) => { calls.push(args); return perform(command, args, context); } });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(calls.some(args => args.includes('task')), false);
});

test('taskless recovery binds the delivery inputs and ignores optional Task annotation', (t: any) => {
  const current: any = directFixture(t);
  const input = { ...current.input, taskId: null };
  const first: any = runDirectSelfBootstrapCloseout({ ...input, execute: executor(current.root, { failPush: true }) });
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  const successor = git(current.root, 'rev-parse', 'HEAD');
  const mismatched: any = runDirectSelfBootstrapCloseout({ ...input, baseRef: input.deliveredRef, execute: executor(current.root) });
  // An empty scope needs no activation and cannot push the pending successor.
  assert.equal(mismatched.status, 'not-applicable');
  assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], input.deliveredRef);
  const wrongHost: any = runDirectSelfBootstrapCloseout({ ...input, agent: 'claude-code', execute: executor(current.root) });
  assert.equal(wrongHost.diagnostic.code, 'self-bootstrap-closeout.remote-drift');
  const recovered: any = runDirectSelfBootstrapCloseout({ ...input, taskId: 'optional-note', execute: executor(current.root) });
  assert.equal(recovered.status, 'passed', JSON.stringify(recovered));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), successor);
  assert.equal(recovered.phases.some((stage: any) => ['sync', 'commit'].includes(stage.id)), false);
  assert.equal(parseTaskCommitTrailer(git(current.root, 'show', '-s', '--format=%B', successor)).taskId, null);
});

for (const changedPath of ['AGENTS.md', 'projects/product/AGENTS.md', 'components/workspace/buildr-self-bootstrap/contributions/task-finish.md']) {
  test(`taskless ${changedPath} changes trigger projection`, (t: any) => {
    const current: any = fixture(t);
    const file = path.join(current.root, changedPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, '\nupdated instruction\n');
    git(current.root, 'add', '--', changedPath);
    git(current.root, 'commit', '-m', 'update instruction');
    git(current.root, 'push', 'origin', 'dev');
    const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, baseRef: current.baseRef,
      deliveredRef: git(current.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex',
      nodeExecutable: process.execPath, environment: current.environment, execute: executor(current.root) });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.ok(result.phases.some((stage: any) => stage.id === 'sync'));
  });
}

test('unrelated documentation does not activate or access Task records', (t: any) => {
  const current: any = fixture(t);
  fs.writeFileSync(path.join(current.root, 'notes.md'), 'Unrelated documentation.\n');
  git(current.root, 'add', '--', 'notes.md');
  git(current.root, 'commit', '-m', 'documentation');
  git(current.root, 'push', 'origin', 'dev');
  const calls: any[] = [];
  const perform = executor(current.root);
  const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, baseRef: current.baseRef,
    deliveredRef: git(current.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex',
    nodeExecutable: process.execPath, environment: current.environment,
    execute: (command: any, args: any, context: any) => { calls.push(args); return perform(command, args, context); } });
  assert.equal(result.status, 'not-applicable');
  assert.equal(calls.some(args => args.includes('sync') || args.includes('task') || args[0] === 'push'), false);
});

for (const agent of ['codex', 'claude-code']) for (const mode of ['stale', 'other-scope', 'mixed', 'render-failed', 'still-stale']) {
  test(`runtime-only activation repairs only root projection drift once: ${agent} ${mode}`, t => {
    const f = fixture(t), relative = 'projects/product/services/buildr/src/modules/runtime-fixture.ts';
    fs.mkdirSync(path.dirname(path.join(f.root, relative)), { recursive: true });
    fs.writeFileSync(path.join(f.root, relative), 'export const runtime = true;\n');
    git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'runtime only'); git(f.root, 'push', 'origin', 'dev');
    const deliveredRef = git(f.root, 'rev-parse', 'HEAD'), perform = executor(f.root), bridge = fs.realpathSync(f.projectBridge);
    const calls: string[][] = [];
    let doctors = 0, renders = 0;
    const findings: any[] = [{ code: `runtime.${agent.replaceAll('-', '_')}_stale`, scope: mode === 'other-scope' ? 'projects/demo' : '.' }];
    if (mode === 'mixed') findings.push({ code: 'source.conflict', scope: '.' });
    const result = runDirectSelfBootstrapCloseout({
      workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin',
      agent, nodeExecutable: process.execPath, environment: f.environment,
      execute(command: string, args: string[], context: any) {
        calls.push(args);
        if (command === bridge && args[0] === 'doctor') {
          doctors++;
          return { status: 0, stdout: JSON.stringify(doctors > 1 && mode !== 'still-stale'
            ? { health: { ready: true }, findings: [] } : { health: { ready: false }, findings }), stderr: '' };
        }
        if (command === bridge && args[0] === 'render') {
          renders++;
          assert.deepEqual(args, ['render', agent, '--product-skill', '--target', fs.realpathSync(f.root)]);
          return { status: mode === 'render-failed' ? 1 : 0, stdout: '', stderr: '' };
        }
        return perform(command, args, context);
      },
    });
    assert.equal(result.status, mode === 'stale' ? 'passed' : 'blocked', JSON.stringify(result));
    assert.equal(renders, ['other-scope', 'mixed'].includes(mode) ? 0 : 1);
    assert.equal(doctors, ['stale', 'still-stale'].includes(mode) ? 2 : 1);
    assert.equal(calls.some(args => args.includes('--publish-resources') || args[0] === 'sync'), false);
    assert.equal(calls.some(args => ['add', 'commit', 'push'].includes(args[0])), false);
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), deliveredRef);
    assert.equal(git(f.root, 'status', '--porcelain'), '');
  });
}

for (const mode of ['current', 'stale', 'orphan', 'conflict', 'source-drift']) {
  test(`multi-adapter finalization checks and repairs other detected runtime adapters: ${mode}`, t => {
    const f = fixture(t), relative = 'projects/product/services/buildr/src/modules/runtime-fixture.ts';
    fs.mkdirSync(path.dirname(path.join(f.root, relative)), { recursive: true });
    fs.writeFileSync(path.join(f.root, relative), 'export const runtime = true;\n');
    git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'multi adapter runtime fixture'); git(f.root, 'push', 'origin', 'dev');
    const deliveredRef = git(f.root, 'rev-parse', 'HEAD'), perform = executor(f.root), bridge = fs.realpathSync(f.projectBridge), canonicalRoot = fs.realpathSync(f.root);
    const calls: string[][] = [];
    let extraDoctors = 0, extraRenders = 0;
    const result = runDirectSelfBootstrapCloseout({
      workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin',
      agent: 'codex', nodeExecutable: process.execPath, environment: f.environment,
      execute(command: string, args: string[], context: any) {
        calls.push(args);
        if (command === bridge && args[0] === 'doctor') {
          if (args.includes('--agent')) {
            assert.equal(args[args.indexOf('--agent') + 1], 'codex');
            return {
              status: 0,
              stdout: JSON.stringify({
                agentRuntime: { adapterId: 'agents-standard', detectedAdapters: ['claude-code', 'agents-standard'] },
                health: { ready: true },
                findings: [],
              }),
              stderr: '',
            };
          }
          assert.equal(args[args.indexOf('--adapter') + 1], 'claude-code');
          extraDoctors++;
          if (mode === 'current' || extraDoctors > 1) return { status: 0, stdout: JSON.stringify({ health: { ready: true }, findings: [] }), stderr: '' };
          if (mode === 'conflict') {
            return { status: 0, stdout: JSON.stringify({ health: { ready: false }, findings: [{ code: 'runtime.claude_code_conflict', scope: '.' }] }), stderr: '' };
          }
          const findings: any[] = [{ code: 'runtime.claude_code_stale', scope: '.' }];
          if (mode === 'orphan') findings.push({ code: 'components.runtime_orphan', scope: '.', agent: 'claude-code' });
          return { status: 0, stdout: JSON.stringify({ health: { ready: false }, findings }), stderr: '' };
        }
        if (command === bridge && args[0] === 'render') {
          extraRenders++;
          assert.deepEqual(args, ['render', '--adapter', 'claude-code', '--product-skill', '--target', canonicalRoot]);
          if (mode === 'source-drift') fs.writeFileSync(path.join(f.root, 'drift.txt'), 'unexpected source write\n');
          return { status: 0, stdout: '', stderr: '' };
        }
        return perform(command, args, context);
      },
    });
    const expectedPassed = ['current', 'stale', 'orphan'].includes(mode);
    assert.equal(result.status, expectedPassed ? 'passed' : 'blocked', JSON.stringify(result));
    assert.equal(calls.some(args => args[0] === 'doctor' && args.includes('--adapter') && args.includes('agents-standard')), false);
    assert.equal(extraDoctors, ['stale', 'orphan'].includes(mode) ? 2 : 1);
    assert.equal(extraRenders, ['stale', 'orphan', 'source-drift'].includes(mode) ? 1 : 0);
    if (mode === 'conflict') assert.equal(result.diagnostic?.code, 'self-bootstrap-closeout.doctor-not-ready');
    if (mode === 'conflict') assert.equal(result.diagnostic?.details?.adapterId, 'claude-code');
    if (mode === 'source-drift') assert.equal(result.diagnostic?.code, 'self-bootstrap-closeout.runtime-refresh-source-drift');
    if (mode !== 'source-drift') assert.equal(git(f.root, 'status', '--porcelain'), '');
  });
}

test('multi-adapter finalization refreshes agents-standard when claude-code is the active host', t => {
  const f = fixture(t), relative = 'projects/product/services/buildr/src/modules/runtime-fixture-claude.ts';
  fs.mkdirSync(path.dirname(path.join(f.root, relative)), { recursive: true });
  fs.writeFileSync(path.join(f.root, relative), 'export const runtime = true;\n');
  git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'claude host fixture'); git(f.root, 'push', 'origin', 'dev');
  const deliveredRef = git(f.root, 'rev-parse', 'HEAD'), perform = executor(f.root), bridge = fs.realpathSync(f.projectBridge), canonicalRoot = fs.realpathSync(f.root);
  let standardDoctors = 0, standardRenders = 0;
  const result = runDirectSelfBootstrapCloseout({
    workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin',
    agent: 'claude-code', nodeExecutable: process.execPath, environment: f.environment,
    execute(command: string, args: string[], context: any) {
      if (command === bridge && args[0] === 'doctor') {
        if (args.includes('--agent')) {
          return {
            status: 0,
            stdout: JSON.stringify({
              agentRuntime: { adapterId: 'claude-code', detectedAdapters: ['claude-code', 'agents-standard'] },
              health: { ready: true },
              findings: [],
            }),
            stderr: '',
          };
        }
        assert.deepEqual(args, ['doctor', '--adapter', 'agents-standard', '--target', canonicalRoot, '--json']);
        standardDoctors++;
        return {
          status: 0,
          stdout: JSON.stringify(standardDoctors > 1
            ? { health: { ready: true }, findings: [] }
            : { health: { ready: false }, findings: [{ code: 'runtime.agents_standard_stale', scope: '.' }] }),
          stderr: '',
        };
      }
      if (command === bridge && args[0] === 'render') {
        standardRenders++;
        assert.deepEqual(args, ['render', '--adapter', 'agents-standard', '--product-skill', '--target', canonicalRoot]);
        return { status: 0, stdout: '', stderr: '' };
      }
      return perform(command, args, context);
    },
  });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(standardDoctors, 2);
  assert.equal(standardRenders, 1);
});

for (const [role, sourcePath] of [
  ['module', 'src/modules/workspace/application/runtime-fixture.ts'],
  ['bin', 'bin/runtime-fixture.mjs'],
  ['web', 'src/web/application/runtime-fixture.ts'],
]) {
  test(`package runtime source ${role} installs and restarts the retained development app before entry and Doctor verification`, (t: any) => {
    const current: any = fixture(t);
    const relative = `projects/product/services/buildr/${sourcePath}`;
    const file = path.join(current.root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export const deliveredRuntime = true;\n');
    git(current.root, 'add', '--', relative);
    git(current.root, 'commit', '-m', `deliver ${role} runtime`);
    git(current.root, 'push', 'origin', 'dev');
    const deliveredRef = git(current.root, 'rev-parse', 'HEAD');
    const perform = executor(current.root, { runningDevelopmentInstance: true });
    const calls: Array<{ executable: string; args: string[]; entryInspection: boolean }> = [];
    const result: any = runDirectSelfBootstrapCloseout({
      workspaceRoot: current.root, baseRef: current.baseRef, deliveredRef,
      targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: current.environment,
      execute: (executable: string, args: string[], context: any) => { calls.push({ executable, args, entryInspection: context.env?.BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON === '1' }); return perform(executable, args, context); },
    });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.deepEqual(result.phases.map((phase: any) => phase.id), ['preflight', 'install-buildr-web', 'verify-development-entry', 'finalize']);
    assert.ok(result.phases.every((phase: any) => phase.status === 'passed'));
    const canonicalRoot = fs.realpathSync(current.root);
    const manager = path.join(canonicalRoot, 'projects/product/services/buildr/tools/build/launcher/manage.ts');
    const continuity = path.join(canonicalRoot, 'skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs');
    const bridge = fs.realpathSync(current.projectBridge);
    const inspectIndex = calls.findIndex((call) => call.args[0] === continuity && call.args[1] === 'inspect');
    const installIndex = calls.findIndex((call) => call.args[0] === manager && call.args[1] === 'install');
    const restartIndex = calls.findIndex((call) => call.args[0] === continuity && call.args[1] === 'restart');
    const entryIndex = calls.findIndex((call) => call.executable === bridge && call.entryInspection);
    const doctorIndex = calls.findIndex((call) => call.executable === bridge && call.args[0] === 'doctor');
    assert.ok(inspectIndex >= 0 && inspectIndex < installIndex && installIndex < restartIndex && restartIndex < entryIndex && entryIndex < doctorIndex, JSON.stringify(calls));
    for (const index of [inspectIndex, installIndex, restartIndex]) assert.equal(calls[index].executable, process.execPath);
    assert.deepEqual(calls[installIndex].args.slice(1), ['install', '--channel', 'development', '--no-stop-instance']);
    const restart = calls[restartIndex].args;
    assert.equal(restart[restart.indexOf('--previous-pid') + 1], '71173');
    assert.equal(restart[restart.indexOf('--port') + 1], String(DEFAULT_DEVELOPMENT_WEB_PORT));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), deliveredRef);
    assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], deliveredRef);
  });
}

test('taskless activation rejects a delivery absent from the remote', (t: any) => {
  const current: any = fixture(t);
  fs.appendFileSync(path.join(current.root, 'skills/generated/SKILL.md'), 'unpublished\n');
  git(current.root, 'add', '--', 'skills/generated/SKILL.md');
  git(current.root, 'commit', '-m', 'not delivered');
  const head = git(current.root, 'rev-parse', 'HEAD');
  const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, baseRef: current.baseRef,
    deliveredRef: head, targetBranch: 'dev', remote: 'origin', agent: 'codex',
    nodeExecutable: process.execPath, environment: current.environment, execute: executor(current.root) });
  assert.partialDeepStrictEqual(result.diagnostic, { code: 'self-bootstrap-closeout.delivery-unconfirmed' });
  assert.equal(result.delivery.observed, false);
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), head);
  assert.equal(result.phases.some((stage: any) => ['sync', 'commit', 'push'].includes(stage.id)), false);
});

test('legacy task-marked pending successors remain recoverable', (t: any) => {
  const current: any = directFixture(t);
  const first: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, { failPush: true }) });
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  git(current.root, 'commit', '--amend', '-m', `Legacy activation\n\nBuildr-Activation-Task: ${current.input.taskId}\nBuildr-Activation-Delivery: ${current.input.deliveredRef}`);
  const legacyHead = git(current.root, 'rev-parse', 'HEAD');
  const result: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root) });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), legacyHead);
  assert.equal(result.phases.some((stage: any) => ['sync', 'commit'].includes(stage.id)), false);
});

test('runner 拒绝旧运行输入且不启动外部操作', () => {
  assert.throws(() => runSelfBootstrapCloseoutCommand({ args: ['--run', 'legacy'], execute: () => { throw new Error('must not execute'); } }), (error: any) => error.code === 'self-bootstrap-closeout.option-unknown');
});

test('直接激活拒绝把带相同标记的合并提交当作自己的待推送后继', (t: any) => {
  const current: any = directFixture(t);
  git(current.root, 'switch', '-c', 'other-work');
  fs.writeFileSync(path.join(current.root, 'unrelated.txt'), 'unrelated contribution');
  git(current.root, 'add', '--', 'unrelated.txt');
  git(current.root, 'commit', '-m', 'other contribution');
  git(current.root, 'switch', 'dev');
  git(current.root, 'merge', '--no-ff', 'other-work', '-m', `merge fixture\n\nBuildr-Activation-Task: ${current.input.taskId}\nBuildr-Activation-Delivery: ${current.input.deliveredRef}`);
  const before: any = git(current.root, 'rev-parse', 'HEAD');
  const result: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(result.status, 'blocked');
  assert.partialDeepStrictEqual(result.diagnostic, { code: 'self-bootstrap-closeout.remote-drift' });
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), before);
  assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], current.input.deliveredRef);
});

test('workspace-owned release Skill changes activate the same retained projection runner', (t: any) => {
  const current: any = fixture(t);
  const skill = path.join(current.root, 'skills', 'buildr-release', 'SKILL.md');
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, '---\nname: buildr-release\ndescription: Release fixture\n---\nRelease flow.\n');
  git(current.root, 'add', '--', 'skills/buildr-release/SKILL.md');
  git(current.root, 'commit', '-m', 'deliver release Skill');
  git(current.root, 'push', 'origin', 'dev');
  const deliveredRef = git(current.root, 'rev-parse', 'HEAD');
  const taskId = 'release-skill-delivery';
  const performed: any[] = [];
  const execute = executor(current.root, { taskInspections: { [taskId]: { record: { taskId, status: 'completed', result: { summary: 'Delivered release Skill.' }, scope: { projects: ['product'] } } } } });
  const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, taskId, baseRef: current.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: current.environment,
    execute: (command: any, args: any, context: any) => { performed.push(args); return execute(command, args, context); } });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.ok(performed.some(args => args.includes('sync')));
  assert.equal(fs.readFileSync(path.join(current.root, 'skills', 'generated', 'SKILL.md'), 'utf8'), 'v2\n');
});

for (const relative of ['projects/product/services/buildr-web/test/runtime.test.ts', 'projects/product/services/buildr-harness-web/test/ui/app.test.mjs', 'projects/product/services/dsh-plugin/plugin/bridge.ts', 'projects/product/services/buildr/docs/runtime.md']) {
  test(`non-runtime ${relative} does not install or restart the development app`, t => {
    const f = fixture(t), file = path.join(f.root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'documentation or independent work\n');
    git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'unrelated change'); git(f.root, 'push', 'origin', 'dev');
    const calls: string[][] = [], perform = executor(f.root, { runningDevelopmentInstance: true });
    const result = runDirectSelfBootstrapCloseout({ workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef: git(f.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: f.environment,
      execute: (command: string, args: string[], context: any) => { calls.push(args); return perform(command, args, context); } });
    assert.equal(result.status, 'not-applicable');
    assert.equal(calls.some(args => args.includes('restart') || args.includes('--channel')), false);
  });
}

for (const relative of ['projects/product/services/buildr-harness/src/index.ts', 'projects/product/services/buildr-harness/package-lock.json', 'projects/product/services/buildr/package-lock.json', 'projects/product/services/buildr-web/vite.config.ts', 'projects/product/services/buildr-web/tsconfig.app.json', 'projects/product/services/buildr-harness-web/src/HarnessApp.tsx', 'projects/product/services/buildr-harness-web/vite.config.ts', 'projects/product/services/buildr-harness-web/tools/build.ts', 'projects/product/services/buildr/tools/development/prepare-development-web.ts']) {
  test(`shared runtime policy restarts for ${relative}`, t => {
    const f = fixture(t), file = path.join(f.root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'runtime input changed\n');
    git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'runtime input change'); git(f.root, 'push', 'origin', 'dev');
    const result = runDirectSelfBootstrapCloseout({ workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef: git(f.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: f.environment, execute: executor(f.root, { runningDevelopmentInstance: true }) });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.ok(result.phases.some((phase: any) => phase.id === 'install-buildr-web' && phase.status === 'passed'));
  });
}

test('自举技能源变更必须同步组件完整性声明', async () => {
  const { assetIntegrity } = await import('../../src/modules/agent-assets/infrastructure/component-source.ts');
  const { default: YAML } = await import('yaml');
  const workspaceRoot = path.resolve(import.meta.dirname, '../../../../../..');
  const definition = YAML.parse(fs.readFileSync(path.join(workspaceRoot, 'components/workspace/buildr-self-bootstrap/component.yml'), 'utf8'));
  const expected = new Map(definition.integrity.map((item: string) => { const split=item.lastIndexOf('=');return [item.slice(0,split),item.slice(split+1)]; }));
  for (const member of Object.values(definition.members).flat() as string[]) {
    assert.equal(assetIntegrity(path.join(workspaceRoot,member)),expected.get(member),`组件成员摘要未跟随源文件更新：${member}`);
  }
});

test('DSH 开发插件自举只换装已核对的本地旧包，运行时准备候选但不改配置', async t => {
  const { isDshDevelopmentPluginInput, updateDshDevelopmentPlugin } = await import('../../../../../../skills/buildr-self-bootstrap-sync/scripts/dsh-development-plugin.mjs');
  const f = fixture(t);
  const home = path.join(f.root, 'dsh-home');
  const owner = path.join(f.root, '.buildr/local/buildr-harness-dsh-plugin');
  const profile = path.join(home, '.dsh/profiles/desktop');
  const name = '@buildr-ai/buildr-harness-dsh-plugin-dev';
  const installed = path.join(profile, 'node_modules', name);
  const manifest = path.join(profile, 'package.json');
  const hostCli = path.join(f.root, 'dsh');
  fs.writeFileSync(hostCli, 'fixture');
  const old = path.join(owner, 'old.tgz');
  fs.mkdirSync(owner, { recursive:true });
  fs.mkdirSync(path.join(installed, 'lib'), { recursive:true });
  fs.writeFileSync(old, 'old');
  const files = ['package.json', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'lib/launcher.js'];
  const contents = (version: string, file: string) => file === 'package.json' ? JSON.stringify({name, version}) : version;
  const install = (archive: string, version: string) => {
    fs.writeFileSync(manifest, JSON.stringify({dependencies: {[name]: `file:${archive}`, unrelated:'1.0.0'}}));
    for (const file of files) fs.writeFileSync(path.join(installed, file), contents(version, file));
  };
  install(old, '0.0.1');
  let running = true, installs = 0;
  let installBehavior: 'normal' | 'failure' | 'unknown' | 'unknown-after-write' = 'normal';
  const lifecycle: string[] = [];
  const run = (_exe: string, args: string[], id: string) => {
    let stdout: string | Buffer = '';
    if (id === 'dsh-host-version') stdout = '0.2.2-rc.5';
    else if (id === 'dsh-processes') stdout = running ? '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' : '/sbin/launchd';
    else if (id === 'dsh-build-plugin') {
      const file = path.join(args.at(-1)!, 'built.tgz'); fs.writeFileSync(file, 'new'); stdout = JSON.stringify({name,path:file});
    } else if (id.startsWith('dsh-verify-')) stdout = Buffer.from(contents(args[1] === old ? '0.0.1' : '0.0.2', args.at(-1)!.slice('package/'.length)));
    else if (id === 'dsh-install-plugin') {
      installs++; lifecycle.push('install');
      if (installBehavior === 'unknown') return { status:1, errorCode:'ETIMEDOUT', stdout };
      if (installBehavior === 'failure') return { status:1, stdout };
      install(args.at(-1)!, '0.0.2');
      if (installBehavior === 'unknown-after-write') return { status:1, errorCode:'ETIMEDOUT', stdout };
    }
    else assert.fail(id);
    return {status:0,stdout};
  };
  const activate = () => updateDshDevelopmentPlugin({ root:f.root, nodeExecutable:process.execPath, run, environment:{ HOME:home }, platform:'darwin', hostCli });
  assert.equal(isDshDevelopmentPluginInput('projects/product/services/buildr-harness-dsh-plugin/src/client.tsx'), true);
  assert.equal(isDshDevelopmentPluginInput('projects/product/services/buildr-harness-dsh-plugin/test/desktop-acceptance.md'), false);
  assert.equal(isDshDevelopmentPluginInput('projects/product/services/buildr-harness-web/src/main.tsx'), false);
  const pending = activate();
  assert.equal(pending.status, 'pending', JSON.stringify(pending));
  assert.equal(installs, 0);
  assert.equal(JSON.parse(fs.readFileSync(manifest,'utf8')).dependencies[name], `file:${old}`);
  running = false;
  const next = activate();
  assert.equal(next.status, 'installed', JSON.stringify(next));
  assert.ok('desktopLoaded' in next && 'archive' in pending);
  assert.equal(next.desktopLoaded, false);
  assert.equal(next.archive, pending.archive);
  assert.equal(activate().status, 'unchanged');
  assert.equal(installs, 1);
  fs.writeFileSync(path.join(installed, 'lib/client.js'), 'not from package');
  assert.equal(activate().status, 'blocked');
  assert.equal(installs, 1);
  const activateAndReopen = (quitStatus: string, loaded = true) => updateDshDevelopmentPlugin({
    root:f.root, nodeExecutable:process.execPath, run, environment:{ HOME:home }, platform:'darwin', hostCli, restartDsh:true,
    continuity: () => ({
      quit(_: string, beforeQuit: () => boolean) {
        assert.equal(beforeQuit(), true);
        lifecycle.push('quit');
        if (quitStatus === 'exited') { running = false; return {status:quitStatus, verified:{}}; }
        return {status:quitStatus};
      },
      reopen() { assert.equal(running,false); lifecycle.push('reopen'); running = true; return {status:loaded ? 'reopened' : 'opened-load-unconfirmed', desktopLoaded:loaded}; },
    }) as any,
  });
  const reset = () => { install(old, '0.0.1'); running = true; lifecycle.length = 0; installBehavior = 'normal'; };
  for (const status of ['unconfirmed','not-accepted','not-exited']) {
    reset(); assert.equal(activateAndReopen(status).status, 'pending'); assert.deepEqual(lifecycle,['quit']);
  }
  reset(); const restarted = activateAndReopen('exited');
  assert.equal(restarted.status,'installed'); assert.ok('desktopLoaded' in restarted && restarted.desktopLoaded === true);
  assert.deepEqual(lifecycle,['quit','install','reopen']);
  lifecycle.length = 0;
  assert.equal(activateAndReopen('exited').status, 'unchanged'); assert.deepEqual(lifecycle,[]);
  reset(); const unconfirmed = activateAndReopen('exited',false);
  assert.equal(unconfirmed.status,'installed'); assert.ok('desktopLoaded' in unconfirmed && unconfirmed.desktopLoaded === false);
  reset(); installBehavior = 'failure';
  assert.equal(activateAndReopen('exited').status,'blocked'); assert.deepEqual(lifecycle,['quit','install','reopen']);
  reset(); installBehavior = 'unknown';
  assert.equal(activateAndReopen('exited').status,'blocked'); assert.deepEqual(lifecycle,['quit','install']);
  reset(); installBehavior = 'unknown-after-write';
  const partial = activateAndReopen('exited');
  assert.equal(partial.status,'installed'); assert.ok('desktopLoaded' in partial && partial.desktopLoaded === false);
  assert.deepEqual(lifecycle,['quit','install']);
});

for (const [relative, web, plugin] of [
  ['projects/product/services/buildr-harness-web/src/fixture.ts', true, false],
  ['projects/product/services/buildr-harness-dsh-plugin/src/client.tsx', false, true],
  ['projects/product/services/buildr-harness-dsh-plugin/README.md', false, false],
] as const) {
  test(`自举预检只读区分网页和插件：${relative}`, t => {
    const f = fixture(t), target = path.join(f.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, 'change\n');
    git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'delivery'); git(f.root, 'push', 'origin', 'dev');
    const tip = git(f.root, 'rev-parse', 'HEAD');
    const result = runSelfBootstrapCloseoutCommand({ args: [
      '--plan', 'true', '--restart-dsh', 'true', '--target', f.root, '--base-ref', f.baseRef, '--delivered-ref', tip, '--branch', 'dev', '--remote', 'origin', '--agent', 'codex',
    ], environment: f.environment, execute: (executable, args, context) => {
      assert.equal(executable, 'git');
      assert.ok(['check-ref-format', 'rev-parse', 'diff', 'symbolic-ref', 'merge-base', 'ls-remote'].includes(args[0]), JSON.stringify(args));
      return executor(f.root)(executable, args, context);
    }});
    assert.equal(result.status, 'planned', JSON.stringify(result));
    assert.deepEqual(result.updateScope?.harnessRuntimePaths, web ? [relative] : []);
    assert.equal(result.updateScope?.developmentWebRequested, web);
    assert.equal(result.updateScope?.restartDshRequested, plugin);
    assert.deepEqual(result.updateScope?.paths['update-dsh-development-plugin'], plugin ? [relative] : []);
    assert.equal(git(f.root, 'status', '--porcelain'), '');
    assert.equal(fs.existsSync(path.join(f.root, '.git/buildr/self-bootstrap-direct.lock')), false);
  });
}

test('DSH 待安装接续仅换包、验证入口并拒绝保留提交漂移', t => {
  const f = fixture(t);
  const inputs = ['projects/product/services/buildr-harness-web/src/fixture.ts', 'projects/product/services/buildr-harness-dsh-plugin/src/client.tsx'];
  for (const relative of inputs) {
    const file = path.join(f.root, relative); fs.mkdirSync(path.dirname(file), { recursive:true }); fs.writeFileSync(file, 'change\n');
  }
  git(f.root, 'add', '--', ...inputs); git(f.root, 'commit', '-m', 'delivery'); git(f.root, 'push', 'origin', 'dev');
  const deliveredRef = git(f.root, 'rev-parse', 'HEAD');
  const input = { workspaceRoot:f.root, baseRef:f.baseRef, deliveredRef, targetBranch:'dev', remote:'origin', agent:'codex', nodeExecutable:process.execPath, environment:f.environment };
  const pending = runDirectSelfBootstrapCloseout({ ...input, execute:executor(f.root), updateDshPlugin: () => ({ status:'pending', archive:'candidate', reason:'DSH is running' }) });
  assert.equal(pending.diagnostic?.code, 'self-bootstrap-closeout.dsh-plugin-pending', JSON.stringify(pending));
  assert.ok(pending.phases.some((phase: { id:string; status:string }) => phase.id === 'install-buildr-web' && phase.status === 'passed'));
  const receipt = path.join(path.dirname(f.root), 'pending-result.json'); fs.writeFileSync(receipt, JSON.stringify(pending));
  let attempts = 0;
  const resume = () => {
    const perform = executor(f.root);
    return runDirectSelfBootstrapCloseout({ ...input, resumeDsh:receipt, execute:(exe,args,ctx) => {
      assert.ok(!args.some((arg: string) => /prepare-development-agent\.ts$|launcher\/manage\.ts$/.test(arg)));
      assert.ok(!args.includes('sync') && !args.includes('push'));
      return perform(exe,args,ctx);
    }, updateDshPlugin:() => { attempts++; return { status:'installed', archive:'candidate', desktopLoaded:false }; }});
  };
  const resumed = resume();
  assert.equal(resumed.status, 'passed', JSON.stringify(resumed));
  assert.deepEqual(resumed.phases.map((phase: { id:string }) => phase.id), ['preflight','verify-development-entry','finalize','update-dsh-development-plugin']);
  assert.equal(attempts, 1);
  fs.writeFileSync(receipt, JSON.stringify({ ...pending, phases: pending.phases.map((phase: { id:string }) => phase.id === 'update-dsh-development-plugin' ? {...phase,operations:[{id:'dsh-install-plugin'}]} : phase) }));
  assert.equal(resume().diagnostic?.code, 'self-bootstrap-closeout.dsh-resume-mismatch');
  fs.writeFileSync(receipt, JSON.stringify(pending));
  git(f.root, 'commit', '--allow-empty', '-m', 'checkout advanced'); git(f.root, 'push', 'origin', 'dev');
  assert.equal(resume().diagnostic?.code, 'self-bootstrap-closeout.dsh-resume-mismatch');
  assert.equal(attempts, 1);
});

test('DSH 原生重开仅采用可验证的宿主绑定和本次加载回执', { skip: process.platform === 'win32' }, async t => {
  const { dshDesktopContinuity } = await import('../../../../../../skills/buildr-self-bootstrap-sync/scripts/dsh-desktop-continuity.mjs');
  const f = fixture(t), root = fs.realpathSync(f.root), home = path.join(root,'home'), dataRoot = path.join(home,'data');
  const dshHome = path.join(home,'.dsh'), packageRoot = path.join(root,'projects/product/services/buildr/node_modules/@buildr-ai/buildr-harness');
  const app = '/Applications/DeepSeek Harness.app', executable = `${app}/Contents/MacOS/DeepSeek Harness`;
  fs.mkdirSync(dshHome,{recursive:true}); fs.mkdirSync(packageRoot,{recursive:true}); fs.mkdirSync(path.join(dataRoot,'agent-service'),{recursive:true});
  const receipt = path.join(dataRoot,'agent-service/dsh-development-desktop.json');
  const binding = {schemaVersion:'buildr.dsh-development-desktop/v1',desktopPid:33,hostPid:34,observedAt:2005,node:fs.realpathSync(process.execPath),packageRoot,dataRoot,dshHome,port:'9519',entryDigest:'old',nonce:null as string|null};
  const writeReceipt = () => fs.writeFileSync(receipt,JSON.stringify(binding),{mode:0o600});
  let front = {pid:33,app,startedAt:2000,ready:true};
  let exited = false, exits = 0, starts = 0, issueNonce = true, extraInstance = false;
  const run = (_exe:string,args:string[],id:string) => {
    if (id === 'dsh-desktop-inspect') return {status:0,stdout:JSON.stringify(exited ? [] : extraInstance ? [front,front] : [front])};
    if (id === 'dsh-desktop-processes') return {status:0,stdout:`${front.pid} 1 ${process.getuid?.()} ${executable}\n${binding.hostPid} ${front.pid} ${process.getuid?.()} ${executable}`};
    if (id === 'dsh-desktop-original-launch') return {status:0,stdout:executable};
    if (id === 'dsh-desktop-quit') { assert.equal(args.at(-3),String(front.pid)); exits++; exited = true; return {status:0,stdout:'accepted'}; }
    if (id === 'dsh-desktop-reopen') {
      starts++; assert.equal(exited,true);
      assert.ok(args.includes(`BUILDR_HARNESS_DSH_DATA_ROOT=${dataRoot}`)); assert.ok(args.includes('BUILDR_HARNESS_DSH_PORT=9519'));
      front = {...front,pid:55,startedAt:3000}; exited = false;
      Object.assign(binding,{desktopPid:55,hostPid:56,observedAt:3001,entryDigest:'new',nonce:issueNonce ? args.at(-1)?.split('=')[1] : null});
      writeReceipt(); return {status:0,stdout:''};
    }
    assert.fail(id);
  };
  const control = dshDesktopContinuity({root,home,dataRoot,nodeExecutable:process.execPath,run,env:{},exited:() => exited,boundMs:0});
  assert.equal(control.quit('old').status,'unconfirmed');
  writeReceipt(); extraInstance = true; assert.equal(control.quit('old').status,'unconfirmed');
  extraInstance = false; assert.equal(control.quit('different').status,'unconfirmed');
  assert.equal(control.quit('old',()=>false).status,'unconfirmed'); assert.equal(exits,0);
  const quit = control.quit('old'); assert.equal(quit.status,'exited'); assert.ok(quit.verified);
  assert.deepEqual(control.reopen(quit.verified,'new'),{status:'reopened',desktopLoaded:true});
  const secondQuit = control.quit('new'); assert.ok(secondQuit.verified);
  issueNonce = false;
  assert.deepEqual(control.reopen(secondQuit.verified,'new'),{status:'opened-load-unconfirmed',desktopLoaded:false});
  assert.equal(exits,2); assert.equal(starts,2);
});
