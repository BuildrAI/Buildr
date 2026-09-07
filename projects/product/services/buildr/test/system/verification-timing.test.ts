import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanupOwnedProcessGroup, cleanupTrackedDescendants, createOwnedDescendantTracker, parseProcessLineage, runVerificationBatch, runVerificationStep } from '../../test/verification/timing/parallel-runner.ts';
import { executePlan } from '../../test/verification/plan-runner.ts';
import { candidateStepBudget } from '../../test/verification/timing/budgets.ts';
import { cleanupVerificationHarnessRoot, createVerificationPhaseRecorder, parseVerificationPhaseTimings } from '../../test/verification/timing/phases.ts';
import {
  collectVerificationSourceIdentity,
  cleanupVerificationTimingEvidence,
  createVerificationTimingSummary,
  createVerificationEvidencePaths,
  formatVerificationTimingSummary,
  validateVerificationTimingEvidence,
  writeVerificationTimingEvidence,
} from '../../test/verification/timing/evidence.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reporter: any = path.join(productRoot, 'test', 'verification', 'timing', 'report.ts');
const summaryVerifier: any = path.join(productRoot, 'test', 'verification', 'timing', 'verify-summary.ts');
const evidenceCleaner: any = path.join(productRoot, 'test', 'verification', 'timing', 'cleanup-evidence.ts');

async function assertProcessExited(pid: any, timeoutMs: any = 1_000): Promise<any>  {
  const deadline: any = Date.now() + timeoutMs;
  while (true) {
    try {
      process.kill(pid, 0);
    } catch (error: any) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    if (Date.now() >= deadline) assert.fail(`Process ${pid} remained alive after ${timeoutMs} ms.`);
    await new Promise((resolve: any) => setTimeout(resolve, 25));
  }
}

test('verification phase markers provide structured inner-step timing', async () => {
  let now: any = 1000;
  let output: any = '';
  const evidenceOutput: any = path.join(os.tmpdir(), `buildr-phase-marker-${process.pid}.jsonl`);
  fs.rmSync(evidenceOutput, { force: true });
  const recorder: any = createVerificationPhaseRecorder('release-smoke', {
    now: () => now,
    env: { BUILDR_VERIFICATION_PHASE_OUTPUT: evidenceOutput },
  });
  await recorder.run('install', async () => { now = 1125; });
  recorder.record('cleanup', 1125, 1150, 'retained');
  recorder.emit({ write(chunk: any): any  { output += chunk; } });
  assert.deepEqual(parseVerificationPhaseTimings(`noise\n${output}`), [
    {
      scope: 'release-smoke', id: 'install', status: 'passed',
      startedAt: '1970-01-01T00:00:01.000Z', finishedAt: '1970-01-01T00:00:01.125Z', durationMs: 125,
    },
    {
      scope: 'release-smoke', id: 'cleanup', status: 'retained',
      startedAt: '1970-01-01T00:00:01.125Z', finishedAt: '1970-01-01T00:00:01.150Z', durationMs: 25,
    },
  ]);
  assert.equal(fs.existsSync(evidenceOutput), false, 'an explicit test stream must not leak fixture markers into runner evidence');
});

test('verification runner preserves phase evidence hidden by a child reporter', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-phase-evidence-'));
  try {
    const result: any = await runVerificationStep({
      name: 'phase evidence',
      command: process.execPath,
      args: ['-e', `require('node:fs').appendFileSync(process.env.BUILDR_VERIFICATION_PHASE_OUTPUT, '[buildr-verification-phase] {"scope":"fresh-build","id":"npm-ci","status":"passed","startedAt":"1970-01-01T00:00:01.000Z","finishedAt":"1970-01-01T00:00:01.125Z","durationMs":125}\\n')`],
      diagnosticsDirectory: root,
    });
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.phases, [{
      scope: 'fresh-build', id: 'npm-ci', status: 'passed',
      startedAt: '1970-01-01T00:00:01.000Z', finishedAt: '1970-01-01T00:00:01.125Z', durationMs: 125,
    }]);
    assert.equal(fs.existsSync(path.join(root, 'phase-evidence.phases.jsonl')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persistent phase evidence survives before final emit', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-persistent-phase-'));
  try {
    const evidenceOutput: any = path.join(root, 'phases.jsonl');
    const recorder: any = createVerificationPhaseRecorder('release-smoke', {
      persistEvidence: true,
      evidenceOutput,
    });
    recorder.record('installation', 1000, 1125);
    assert.deepEqual(parseVerificationPhaseTimings(fs.readFileSync(evidenceOutput, 'utf8')).map((phase: any) => phase.id), ['installation']);
    recorder.emit({ write(): any  {} });
    assert.deepEqual(parseVerificationPhaseTimings(fs.readFileSync(evidenceOutput, 'utf8')).map((phase: any) => phase.id), ['installation']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('harness cleanup only retains known Windows lock races', () => {
  const locked: any = Object.assign(new Error('locked'), { code: 'EPERM' });
  const retained: any = cleanupVerificationHarnessRoot('C:\\fixture', {
    platform: 'win32', removeRoot(): any  { throw locked; }, warn(): any  {},
  });
  assert.equal(retained.status, 'retained');
  assert.throws(() => cleanupVerificationHarnessRoot('/tmp/fixture', {
    platform: 'darwin', removeRoot(): any  { throw locked; }, warn(): any  {},
  }), /locked/);
  assert.throws(() => cleanupVerificationHarnessRoot('C:\\fixture', {
    platform: 'win32', removeRoot(): any  { throw Object.assign(new Error('invalid path'), { code: 'EINVAL' }); }, warn(): any  {},
  }), /invalid path/);
});

test('timing summary 保留向后兼容的 step 调度时间轴', () => {
  const summary: any = createVerificationTimingSummary({
    status: 'passed',
    kind: 'candidate',
    runId: 'candidate-scheduling',
    source: {},
    startedAt: 1000,
    finishedAt: 1200,
    schedulingMode: 'cost',
    executionProfile: { id: 'ci', limits: { global: 4, classes: { 'workspace-heavy': 3 }, resources: { 'workspace-saturating': 1 } } },
    contextLifecycle: {
      contexts: [{ provider: 'task-lifecycle/v1', identity: `sha256-${'a'.repeat(64)}`, owned: true, prepareDurationMs: 12 }],
      events: [{ operation: 'prepare', provider: 'task-lifecycle/v1', durationMs: 12, identity: `sha256-${'a'.repeat(64)}` }],
    },
    timingOutput: path.join(os.tmpdir(), 'buildr-scheduling-summary.json'),
    results: [{
      name: 'scheduled',
      status: 'passed',
      exitCode: 0,
      durationMs: 100,
      queuedAt: '1970-01-01T00:00:01.000Z',
      startedAt: '1970-01-01T00:00:01.050Z',
      finishedAt: '1970-01-01T00:00:01.150Z',
      queueDurationMs: 50,
      scheduling: { mode: 'cost', stepCostMs: 50, remainingCostMs: 125, directDependentCount: 1, demand: { workers: 2, processes: 2 }, grant: { workers: 2, processes: 2 } },
      phases: [{ id: 'install', status: 'passed', durationMs: 25 }],
      testContextRuntime: { hosts: 2, creates: 2, cacheHits: 6, materializeDurationMs: 40, cleanupDurationMs: 12 },
    }],
  });
  assert.deepEqual(summary.steps[0], {
    name: 'scheduled',
    status: 'passed',
    exitCode: 0,
    durationMs: 100,
    queuedAt: '1970-01-01T00:00:01.000Z',
    startedAt: '1970-01-01T00:00:01.050Z',
    finishedAt: '1970-01-01T00:00:01.150Z',
    queueDurationMs: 50,
    scheduling: { mode: 'cost', stepCostMs: 50, remainingCostMs: 125, directDependentCount: 1, demand: { workers: 2, processes: 2 }, grant: { workers: 2, processes: 2 } },
    phases: [{ id: 'install', status: 'passed', durationMs: 25 }],
    testContextRuntime: { hosts: 2, creates: 2, cacheHits: 6, materializeDurationMs: 40, cleanupDurationMs: 12 },
  });
  assert.equal(summary.environment.schedulingMode, 'cost');
  assert.equal(summary.environment.executionProfile, 'ci');
  assert.deepEqual(summary.environment.concurrency.resources, { 'workspace-saturating': 1 });
  assert.deepEqual(summary.contextLifecycle.contexts.map((context: any) => context.provider), ['task-lifecycle/v1']);
  assert.deepEqual(summary.contextLifecycle.events.map((event: any) => event.operation), ['prepare']);
  assert.deepEqual(summary.steps[0].testContextRuntime, {
    hosts: 2,
    creates: 2,
    cacheHits: 6,
    materializeDurationMs: 40,
    cleanupDurationMs: 12,
  });
});

test('verification timing reporter emits a versioned machine-readable summary', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-timing-'));
  try {
    const input: any = path.join(root, 'timing.tsv');
    const diagnostics: any = path.join(root, 'diagnostics');
    const output: any = path.join(root, 'timing.json');
    fs.mkdirSync(diagnostics);
    const stdoutPath: any = path.join(diagnostics, 'runtime.stdout.log');
    const stderrPath: any = path.join(diagnostics, 'runtime.stderr.log');
    fs.writeFileSync(input, `unit tests\tpassed\t0\t125\t\t\t\nWorkspace E2E: runtime reconciliation\tfailed\t1\t375\t300\t${stdoutPath}\t${stderrPath}\n`);
    const result: any = spawnSync(process.execPath, [reporter, input, output, 'failed', '500', diagnostics, '450'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const summary: any = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(summary.schemaVersion, 'buildr.verification-timing/v1');
    assert.equal(summary.status, 'failed');
    assert.equal(summary.run.kind, 'candidate');
    assert.match(summary.run.id, /^candidate-report-/);
    assert.equal(summary.source.productRoot, productRoot);
    assert.match(summary.source.candidateFingerprint, /^sha256-[a-f0-9]{64}$/);
    assert.deepEqual(summary.steps, [
        { name: 'unit tests', status: 'passed', exitCode: 0, durationMs: 125 },
        {
          name: 'Workspace E2E: runtime reconciliation',
          status: 'failed',
          exitCode: 1,
          durationMs: 375,
          budgetMs: 300,
          budgetStatus: 'over',
          stdoutPath,
          stderrPath,
        },
      ]);
    assert.equal(summary.totalDurationMs, 500);
    assert.deepEqual(summary.environment, {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      ci: process.env.CI === 'true',
    });
    assert.equal(summary.budgetMs, 450);
    assert.equal(summary.budgetStatus, 'over');
    assert.equal(summary.diagnosticsDirectory, diagnostics);
    assert.equal(summary.summaryPath, output);
    assert.deepEqual(summary.evidenceLifecycle, {
      evidenceRetention: 'caller-managed',
      cleanupAfter: 'caller-policy',
      cleanupStatus: 'not-applicable',
    });
    assert.match(result.stdout, /timing: total=0\.500s budget=over\/0\.450s/);
    assert.match(result.stdout, /slowest: Workspace E2E: runtime reconciliation \(0\.375s\)/);
    assert.match(result.stdout, /failed: Workspace E2E: runtime reconciliation \(1\)/);
    assert.match(result.stdout, new RegExp(`timing summary: ${output.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const verified: any = spawnSync(process.execPath, [summaryVerifier, output, productRoot, 'candidate'], { encoding: 'utf8' });
    assert.equal(verified.status, 1);
    assert.deepEqual(JSON.parse(verified.stdout).findings.map((finding: any) => finding.code), ['status.not_passed']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('timing summary verifier rejects source identity drift', () => {
  const currentSource: any = collectVerificationSourceIdentity(productRoot);
  const summary: any = {
    schemaVersion: 'buildr.verification-timing/v1',
    status: 'passed',
    run: { kind: 'candidate' },
    source: { ...currentSource, candidateFingerprint: 'sha256-stale' },
  };
  const result: any = validateVerificationTimingEvidence(summary, currentSource);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding: any) => finding.code), ['source.candidateFingerprint_mismatch']);
});

test('timing summary verifier preserves the Product-level candidate scope', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-summary-project-scope-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'buildr-test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
    const project: any = path.join(root, 'projects', 'product');
    const service: any = path.join(project, 'services', 'buildr');
    fs.mkdirSync(service, { recursive: true });
    fs.writeFileSync(path.join(service, 'launcher.mjs'), 'baseline\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root });
    fs.writeFileSync(path.join(project, 'project-change.md'), 'candidate\n');

    const summary: any = {
      schemaVersion: 'buildr.verification-timing/v1',
      status: 'passed',
      run: { kind: 'candidate' },
      source: collectVerificationSourceIdentity(service, { projectRoot: project }),
    };
    const summaryFile: any = path.join(root, 'timing.json');
    fs.writeFileSync(summaryFile, `${JSON.stringify(summary)}\n`);
    const verified: any = spawnSync(process.execPath, [summaryVerifier, summaryFile, service, 'candidate'], { encoding: 'utf8' });
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('default verification evidence paths are run-scoped while explicit paths remain supported', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-evidence-paths-'));
  try {
    const first: any = createVerificationEvidencePaths('candidate', { temporaryRoot: root, env: {} });
    const second: any = createVerificationEvidencePaths('candidate', { temporaryRoot: root, env: {} });
    assert.notEqual(first.runId, second.runId);
    assert.notEqual(first.evidenceDirectory, second.evidenceDirectory);
    assert.equal(first.timingOutput, path.join(first.evidenceDirectory, 'timing.json'));
    assert.equal(first.diagnosticsOutput, path.join(first.evidenceDirectory, 'diagnostics'));
    assert.deepEqual(first.evidenceLifecycle, {
      evidenceRetention: 'transient',
      cleanupAfter: 'consumer-finished',
      cleanupStatus: 'retained',
      cleanupReference: first.evidenceDirectory,
    });

    const explicitOutput: any = path.join(root, 'ci', 'summary.json');
    const explicitDiagnostics: any = path.join(root, 'ci', 'logs');
    const explicit: any = createVerificationEvidencePaths('candidate', {
      temporaryRoot: root,
      env: { BUILDR_TIMING_OUTPUT: explicitOutput, BUILDR_DIAGNOSTICS_OUTPUT: explicitDiagnostics },
    });
    assert.equal(explicit.timingOutput, explicitOutput);
    assert.equal(explicit.diagnosticsOutput, explicitDiagnostics);
    assert.deepEqual(explicit.evidenceLifecycle, {
      evidenceRetention: 'caller-managed',
      cleanupAfter: 'caller-policy',
      cleanupStatus: 'not-applicable',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('transient evidence cleanup removes only an owned run directory', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-evidence-cleanup-test-'));
  try {
    const evidence: any = createVerificationEvidencePaths('candidate', { temporaryRoot: root, env: {} });
    fs.mkdirSync(evidence.diagnosticsOutput, { recursive: true });
    fs.writeFileSync(evidence.timingOutput, '{}\n');
    const summary: any = {
      run: { kind: 'candidate' },
      summaryPath: evidence.timingOutput,
      evidenceLifecycle: evidence.evidenceLifecycle,
    };
    const result: any = cleanupVerificationTimingEvidence(summary, { temporaryRoot: root });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'cleaned');
    assert.equal(fs.existsSync(evidence.evidenceDirectory), false);

    const outside: any = path.join(root, 'not-owned');
    fs.mkdirSync(outside);
    const refused: any = cleanupVerificationTimingEvidence({
      run: { kind: 'candidate' },
      summaryPath: path.join(outside, 'timing.json'),
      evidenceLifecycle: {
        evidenceRetention: 'transient',
        cleanupAfter: 'consumer-finished',
        cleanupStatus: 'retained',
        cleanupReference: outside,
      },
    }, { temporaryRoot: root });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 'cleanup.boundary_invalid');
    assert.equal(fs.existsSync(outside), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('evidence cleanup CLI reports and removes a verified transient run', () => {
  const evidence: any = createVerificationEvidencePaths('changed', { temporaryRoot: os.tmpdir(), env: {} });
  try {
    const summary: any = {
      run: { kind: 'changed' },
      summaryPath: evidence.timingOutput,
      evidenceLifecycle: evidence.evidenceLifecycle,
    };
    fs.writeFileSync(evidence.timingOutput, `${JSON.stringify(summary)}\n`);
    const result: any = spawnSync(process.execPath, [evidenceCleaner, evidence.timingOutput], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const output: any = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 'buildr.verification-evidence-cleanup/v1');
    assert.equal(output.status, 'cleaned');
    assert.equal(fs.existsSync(evidence.evidenceDirectory), false);
  } finally {
    fs.rmSync(evidence.evidenceDirectory, { recursive: true, force: true });
  }
});

test('source identity distinguishes dirty candidates sharing the same HEAD', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-identity-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'buildr-test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
    fs.mkdirSync(path.join(root, 'product'));
    fs.writeFileSync(path.join(root, 'product', 'tracked.txt'), 'baseline\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root });

    const clean: any = collectVerificationSourceIdentity(path.join(root, 'product'));
    fs.writeFileSync(path.join(root, 'product', 'untracked.txt'), 'candidate one\n');
    const first: any = collectVerificationSourceIdentity(path.join(root, 'product'));
    fs.writeFileSync(path.join(root, 'product', 'untracked.txt'), 'candidate two\n');
    const second: any = collectVerificationSourceIdentity(path.join(root, 'product'));
    assert.equal(clean.dirty, false);
    assert.equal(first.dirty, true);
    assert.equal(first.head, second.head);
    assert.notEqual(clean.candidateFingerprint, first.candidateFingerprint);
    assert.notEqual(first.candidateFingerprint, second.candidateFingerprint);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('timing formatter reports successful runs without a failed stage', () => {
  assert.deepEqual(formatVerificationTimingSummary({
    totalDurationMs: 250,
    steps: [{ name: 'unit', status: 'passed', exitCode: 0, durationMs: 200 }],
    summaryPath: '/tmp/timing.json',
  }, 'verify-changed'), [
    '[verify-changed] timing: total=0.250s',
    '[verify-changed] slowest: unit (0.200s)',
    '[verify-changed] failed: none',
    '[verify-changed] timing summary: /tmp/timing.json',
  ]);
});

test('changed verification writes a persistent run-level timing summary', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-changed-timing-'));
  try {
    const timingOutput: any = path.join(root, 'timing.json');
    const diagnosticsOutput: any = path.join(root, 'diagnostics');
    const result: any = spawnSync(process.execPath, [path.join(productRoot, 'test', 'verification', 'changed.ts'), 'docs/buildr-product.md'], {
      cwd: productRoot,
      encoding: 'utf8',
      env: { ...process.env, BUILDR_TIMING_OUTPUT: timingOutput, BUILDR_DIAGNOSTICS_OUTPUT: diagnosticsOutput },
    });
    assert.equal(result.status, 0, result.stderr);
    const summary: any = JSON.parse(fs.readFileSync(timingOutput, 'utf8'));
    assert.equal(summary.status, 'passed');
    assert.equal(summary.run.kind, 'changed');
    assert.equal(summary.source.productRoot, productRoot);
    assert.ok(summary.steps.length > 0);
    assert.ok(fs.existsSync(diagnosticsOutput));
    assert.match(result.stdout, /\[verify-changed\] timing: total=/);
    assert.match(result.stdout, /\[verify-changed\] failed: none/);
    assert.match(result.stdout, /Documentation quality passed: 1 file\(s\)\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verification step writes independently addressable stdout and stderr diagnostics', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-step-diagnostics-'));
  try {
    const result: any = await runVerificationStep({
      name: 'diagnostic fixture',
      command: process.execPath,
      args: ['-e', 'console.log("step-out"); console.error("step-err")'],
      diagnosticsDirectory: root,
    });
    assert.equal(result.status, 'passed');
    assert.equal(fs.readFileSync(result.stdoutPath, 'utf8').trim(), 'step-out');
    assert.equal(fs.readFileSync(result.stderrPath, 'utf8').trim(), 'step-err');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parallel verification preserves declaration order and failure identity', async () => {
  const started: any[] = [];
  const completed: any[] = [];
  const results: any = await runVerificationBatch([
    { name: 'slow pass', command: process.execPath, args: ['-e', 'setTimeout(() => console.log("slow"), 30)'], budgetMs: 1 },
    { name: 'fast failure', command: process.execPath, args: ['-e', 'console.error("failed"); process.exit(7)'] },
  ], {
    onStart: (step: any) => started.push(step.name),
    onComplete: (result: any) => completed.push(result.name),
  });
  assert.deepEqual(started, ['slow pass', 'fast failure']);
  assert.deepEqual(completed, ['slow pass', 'fast failure']);
  assert.deepEqual(results.map((result: any) => result.name), ['slow pass', 'fast failure']);
  assert.equal(results[0].status, 'passed');
  assert.equal(results[0].budgetStatus, 'over');
  assert.match(results[0].stdout, /slow/);
  assert.equal(results[1].status, 'failed');
  assert.equal(results[1].exitCode, 7);
  assert.match(results[1].stderr, /failed/);
});

test('identified expensive candidate steps have non-blocking target budgets', () => {
  for (const id of [
    'system-verification-contracts',
    'system-workspace-lifecycle',
    'system-runtime-recovery',
    'system-buildr-web-http',
    'system-app-process',
    'capability-cli-integration',
    'runtime-adapter-parity',
    'package-static',
    'package-workspace',
    'package-commands',
    'package-rules',
    'package-skills',
    'package-runtime',
    'openspec-contract-fixtures',
    'cli-compatibility',
  ]) assert.ok(candidateStepBudget(id) > 0, `${id} must have a target budget`);
});

test('verification process cleanup 只终止 runner-owned process group', () => {
  const calls: any[] = [];
  const result: any = cleanupOwnedProcessGroup(4321, { platform: 'darwin', kill: (pid: any, signal: any) => calls.push({ pid, signal }) });
  assert.equal(result.status, 'clean');
  assert.equal(result.ownership, 'pgid-4321');
  assert.deepEqual(calls, [{ pid: -4321, signal: 0 }, { pid: -4321, signal: 'SIGTERM' }]);
});

test('verification process lineage 从 ps 输出保留稳定启动身份', () => {
  assert.deepEqual(parseProcessLineage('  4321     1 Mon Aug  3 14:25:19 2026\n'), [
    { pid: 4321, ppid: 1, startedAt: 'Mon Aug  3 14:25:19 2026' },
  ]);
});

test('verification process cleanup 持续保留已观察到且随后 reparent 的 descendant ownership', () => {
  const snapshots: any[] = [
    [{ pid: 4321, ppid: 1 }, { pid: 4322, ppid: 4321 }, { pid: 9000, ppid: 1 }],
    [{ pid: 4322, ppid: 1 }, { pid: 4323, ppid: 4322 }, { pid: 9000, ppid: 1 }],
  ];
  let index: any = 0;
  const tracker: any = createOwnedDescendantTracker(4321, {
    platform: 'darwin',
    listProcesses: () => snapshots[Math.min(index++, snapshots.length - 1)],
    setInterval: () => ({ unref(): any  {} }),
    clearInterval(): any  {},
  });
  tracker.sample();
  const lineage: any = tracker.stop();
  assert.deepEqual(lineage.ownedPids, [4321, 4322, 4323]);

  const calls: any[] = [];
  const result: any = cleanupTrackedDescendants(4321, lineage.ownedPids, {
    platform: 'darwin',
    kill: (pid: any, signal: any) => calls.push({ pid, signal }),
  });
  assert.equal(result.status, 'clean');
  assert.deepEqual(result.observed, [4322, 4323]);
  assert.deepEqual(result.terminated, [4322, 4323]);
  assert.deepEqual(calls, [
    { pid: 4322, signal: 0 }, { pid: 4322, signal: 'SIGTERM' },
    { pid: 4323, signal: 0 }, { pid: 4323, signal: 'SIGTERM' },
  ]);
  assert.ok(!calls.some(({ pid }: any) => pid === 9000), 'unobserved process must not be touched');
});

test('verification process cleanup 不把 PID reuse 后的无关进程认作 runner descendant', () => {
  const original: any[] = [
    { pid: 4321, ppid: 1, startedAt: 'root-start' },
    { pid: 4322, ppid: 4321, startedAt: 'owned-start' },
  ];
  const reused: any[] = [
    { pid: 4321, ppid: 1, startedAt: 'root-start' },
    { pid: 4322, ppid: 1, startedAt: 'reused-start' },
    { pid: 9000, ppid: 4322, startedAt: 'unrelated-child-start' },
  ];
  let snapshot: any = original;
  const tracker: any = createOwnedDescendantTracker(4321, {
    platform: 'darwin',
    listProcesses: () => snapshot,
    setInterval: () => ({ unref(): any  {} }),
    clearInterval(): any  {},
  });
  snapshot = reused;
  tracker.sample();
  const lineage: any = tracker.stop();
  assert.deepEqual(lineage.ownedPids, [4321]);
  assert.ok(!lineage.ownedProcesses.some((item: any) => item.pid === 9000), 'descendant of a reused PID must not become runner-owned');

  const calls: any[] = [];
  const result: any = cleanupTrackedDescendants(4321, [{ pid: 4322, startedAt: 'owned-start' }], {
    platform: 'darwin',
    listProcesses: () => reused,
    kill: (pid: any, signal: any) => calls.push({ pid, signal }),
  });
  assert.equal(result.status, 'clean');
  assert.deepEqual(result.reused, [4322]);
  assert.deepEqual(calls, []);
});

test('verification runner 回收真实 detached descendant', async (t: any) => {
  if (process.platform === 'win32') return t.skip('POSIX-only detached process proof');
  const result: any = await runVerificationStep({
    name: 'detached descendant fixture',
    command: process.execPath,
    args: ['-e', [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });',
      'child.unref();',
      'console.log(child.pid);',
      'setTimeout(() => process.exit(0), 150);',
    ].join(' ')],
  });
  assert.equal(result.status, 'passed', result.stderr);
  const detachedPid: any = Number(result.stdout.trim());
  assert.ok(Number.isInteger(detachedPid));
  assert.ok(result.processCleanup.descendants.observed.includes(detachedPid));
  assert.ok(result.processCleanup.descendants.terminated.includes(detachedPid));
  await assertProcessExited(detachedPid);
});

test('verification runner 在direct child退出后回收仍持有stdio的detached descendant', async (t: any) => {
  if (process.platform === 'win32') return t.skip('POSIX-only inherited stdio proof');
  const result: any = await runVerificationStep({
    name: 'inherited stdio descendant fixture',
    command: process.execPath,
    args: ['-e', [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "inherit" });',
      'child.unref();',
      'console.log(child.pid);',
      'setTimeout(() => process.exit(0), 150);',
    ].join(' ')],
  }, { exitCloseGraceMs: 500 });
  assert.equal(result.status, 'passed', result.stderr);
  const detachedPid: any = Number(result.stdout.trim());
  assert.ok(result.processCleanup.descendants.observed.includes(detachedPid));
  assert.ok(result.processCleanup.descendants.terminated.includes(detachedPid));
});

test('verification runner 对永久不退出 capability 独立超时并回收完整后代', async (t: any) => {
  if (process.platform === 'win32') return t.skip('POSIX-only timeout process-group proof');
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capability-timeout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result: any = await runVerificationStep({
    id: 'never-exits',
    name: 'never exits',
    command: process.execPath,
    args: ['-e', [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });',
      'child.unref();',
      'console.log(child.pid);',
      'setInterval(() => {}, 1000);',
    ].join(' ')],
    timeoutMs: 250,
    diagnosticsDirectory: root,
  }, { terminationGraceMs: 100 });
  assert.equal(result.status, 'timed-out');
  assert.equal(result.exitCode, 124);
  assert.equal(result.failureCode, 'capability-timeout');
  assert.ok(result.durationMs < 2_000, `timeout took ${result.durationMs}ms`);
  assert.match(result.stderr, /never-exits exceeded 250 ms/);
  assert.ok(Number.isInteger(result.process.pid));
  assert.equal(result.process.processGroupId, result.process.pid);
  assert.match(result.diagnosticDigests.stdout, /^sha256-/);
  assert.match(result.diagnosticDigests.stderr, /^sha256-/);
  const detachedPid: any = Number(result.stdout.trim());
  assert.ok(result.processCleanup.descendants.observed.includes(detachedPid));
  assert.equal(result.processCleanup.status, 'clean');
  assert.equal(result.processCleanup.escalation.confirmationMs, 1_000);
  assert.equal([...result.processCleanup.escalation.forced.processGroup, ...result.processCleanup.escalation.forced.descendants].some((item: any) => item.error), false);
  await assertProcessExited(detachedPid);
});

test('verification runner cancellation uses the same owned process-group cleanup boundary', async () => {
  const controller: any = new AbortController();
  const pending: any = runVerificationStep({
    id: 'cancelled-capability', name: 'cancelled capability', command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'], timeoutMs: 10_000,
  }, { signal: controller.signal, terminationGraceMs: 50 });
  setTimeout(() => controller.abort(), 100);
  const result: any = await pending;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.exitCode, 130);
  assert.equal(result.failureCode, 'capability-cancelled');
  assert.equal(result.processCleanup.status, 'clean');
  assert.match(result.stderr, /cancelled-capability was cancelled/u);
});

test('verification runner 对exit/close竞态只清理和settle一次', async () => {
  const child: any = new EventEmitter();
  child.pid = 4321;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let terminations: any = 0;
  queueMicrotask(() => {
    child.emit('exit', 0, null);
    child.stdout.end('complete\n');
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const result: any = await runVerificationStep({ name: 'event race', command: 'fixture' }, {
    platform: 'darwin', spawnProcess: () => child, listProcesses: () => [{ pid: 4321, ppid: 1 }],
    kill: (_pid: any, signal: any) => { if (signal === 'SIGTERM') terminations += 1; },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.stdout, 'complete\n');
  assert.equal(terminations, 1);
});

test('verification plan streams heartbeat, process identity, output and completion evidence immediately', async () => {
  let stdout: any = '';
  let stderr: any = '';
  const plan: any = {
    paths: [], delegated: [],
    steps: [
      { id: 'first', name: 'first capability', title: 'first', dependsOn: [], resources: [], concurrencyClass: 'default' },
      { id: 'second', name: 'second capability', title: 'second', dependsOn: ['first'], resources: [], concurrencyClass: 'default' },
    ],
  };
  const result: any = await executePlan(plan, {
    productRoot,
    stream: { write: (value: any) => { stdout += value; } },
    errorStream: { write: (value: any) => { stderr += value; } },
    heartbeatIntervalMs: 5,
    concurrency: 1,
    resourceCoordinator: { root: '/fixture-coordination' },
    executorFactory: (options: any) => async (step: any) => {
      options.onProcessStart(step, { pid: step.id === 'first' ? 7001 : 7002, processGroupId: step.id === 'first' ? 7001 : 7002 });
      await new Promise((resolve: any) => setTimeout(resolve, 20));
      return {
        status: 'passed', exitCode: 0, durationMs: 20,
        process: { pid: step.id === 'first' ? 7001 : 7002, processGroupId: step.id === 'first' ? 7001 : 7002 },
        stdout: `${step.id}-stdout\n`, stderr: `${step.id}-stderr\n`,
        stdoutPath: `/evidence/${step.id}.stdout.log`, stderrPath: `/evidence/${step.id}.stderr.log`,
        diagnosticDigests: { stdout: `sha256-${'1'.repeat(64)}`, stderr: `sha256-${'2'.repeat(64)}` },
      };
    },
  });
  assert.equal(result.passed, true);
  assert.match(stdout, /heartbeat completed=0\/2 active=first:\d+ms:pid=7001:pgid=7001/u);
  assert.match(stdout, /\[verify\] passed: first \(20 ms, pid=7001, pgid=7001\) evidence=\/evidence\/first\.stdout\.log,\/evidence\/first\.stderr\.log digest=sha256-/u);
  assert.ok(stdout.indexOf('[verify] passed: first') < stdout.indexOf('[verify] second: second capability'));
  assert.match(stdout, /first-stdout/u);
  assert.match(stderr, /first-stderr/u);
});

test('verification runner 的process-close-timeout返回失败并仍可生成timing summary', async (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-close-timeout-summary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const child: any = new EventEmitter();
  child.pid = 4321;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => child.emit('exit', 0, null));
  const result: any = await runVerificationStep({ name: 'close timeout', command: 'fixture', diagnosticsDirectory: path.join(root, 'diagnostics') }, {
    platform: 'darwin', spawnProcess: () => child, listProcesses: () => [{ pid: 4321, ppid: 1 }], kill(): any  {}, exitCloseGraceMs: 5,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.failureCode, 'process-close-timeout');
  assert.match(result.stderr, /process-close-timeout/);
  const evidence: any = { runId: 'close-timeout-run', timingOutput: path.join(root, 'timing.json'), evidenceLifecycle: { evidenceRetention: 'caller-managed', cleanupAfter: 'caller-policy', cleanupStatus: 'not-applicable' } };
  writeVerificationTimingEvidence({
    ...evidence, kind: 'changed', source: { candidateFingerprint: 'sha256-fixture' }, status: 'failed', results: [result],
    startedAt: Date.now() - result.durationMs, finishedAt: Date.now(), diagnosticsDirectory: path.join(root, 'diagnostics'),
    prefix: 'verify-changed', stream: { write(): any  {} }, errorStream: { write(): any  {} },
  });
  const summary: any = JSON.parse(fs.readFileSync(evidence.timingOutput, 'utf8'));
  assert.equal(summary.status, 'failed');
  assert.equal(summary.steps[0].status, 'failed');
  assert.equal(summary.steps[0].failureCode, 'process-close-timeout');
  assert.equal(summary.steps[0].processCleanup.ownership, 'runner-observed-lineage');
  assert.equal(summary.source.candidateFingerprint, 'sha256-fixture');
});

test('verification runner 将owned cleanup failure作为主失败返回', async () => {
  const child: any = new EventEmitter();
  child.pid = 4321;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    child.emit('exit', 0, null);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  });
  const result: any = await runVerificationStep({ name: 'cleanup failure', command: 'fixture' }, {
    platform: 'darwin', spawnProcess: () => child, listProcesses: () => [{ pid: 4321, ppid: 1 }],
    kill: (_pid: any, signal: any) => { if (signal === 'SIGTERM') throw new Error('termination denied'); },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.failureCode, 'process-cleanup-failed');
  assert.equal(result.processCleanup.status, 'failed');
});
