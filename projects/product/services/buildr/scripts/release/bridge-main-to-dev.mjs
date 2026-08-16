#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function git(repo, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    fail(`git ${args.join(' ')} failed`, {
      exitCode: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }
  return result;
}

function parseArgs(argv) {
  const options = { remote: 'origin', main: 'main', dev: 'dev' };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  if (!options.repo) fail('Missing required --repo');
  if (!options['candidate-tree']) fail('Missing required --candidate-tree');
  if (!options.version) fail('Missing required --version');
  if (!options['self-bootstrap-run']) fail('Missing required --self-bootstrap-run');
  if (!options['self-bootstrap-evidence']) fail('Missing required --self-bootstrap-evidence');
  return {
    ...options,
    candidateTree: options['candidate-tree'],
    selfBootstrapRun: options['self-bootstrap-run'],
    selfBootstrapEvidence: options['self-bootstrap-evidence'],
  };
}

function rev(repo, ref) {
  return git(repo, ['rev-parse', ref]).stdout.trim();
}

function remoteRefs(repo, remote, main, dev) {
  const result = git(repo, ['ls-remote', remote, `refs/heads/${main}`, `refs/heads/${dev}`]);
  const refs = new Map(result.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [sha, ref] = line.split(/\s+/);
    return [ref, sha];
  }));
  return {
    main: refs.get(`refs/heads/${main}`),
    dev: refs.get(`refs/heads/${dev}`),
  };
}

function assertExpected(label, actual, expected) {
  if (actual !== expected) fail(`${label} does not match the verified candidate tree`, {
    label, actual, expected,
  });
}

function packageVersion(repo, ref) {
  const result = git(repo, ['show', `${ref}:projects/product/services/buildr/package.json`]);
  try { return JSON.parse(result.stdout).version || null; } catch { return null; }
}

const SELF_BOOTSTRAP_EVIDENCE_SCHEMA = 'buildr.self-bootstrap-closeout-result/v1';
const SELF_BOOTSTRAP_EVIDENCE_LIMIT = 1024 * 1024;
const SELF_BOOTSTRAP_EVIDENCE_PHASES = Object.freeze([
  'preflight',
  'plan',
  'sync',
  'commit',
  'push',
  'install-local-app',
  'verify-development-entry',
  'finalize',
]);
const COMMIT_IDENTITY = /^[0-9a-f]{40}$/;

function readSelfBootstrapEvidence(filename) {
  if (!filename) fail('Missing self-bootstrap closeout evidence');
  const evidencePath = path.resolve(filename);
  let stat;
  try { stat = fs.lstatSync(evidencePath); } catch (error) {
    fail('Unable to read self-bootstrap closeout evidence', { evidencePath, error: error.message });
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('Self-bootstrap closeout evidence must be a regular non-symlink file', { evidencePath });
  }
  if (stat.size <= 0 || stat.size > SELF_BOOTSTRAP_EVIDENCE_LIMIT) {
    fail('Self-bootstrap closeout evidence size is invalid', {
      evidencePath, size: stat.size, maximum: SELF_BOOTSTRAP_EVIDENCE_LIMIT,
    });
  }
  try {
    const value = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('root must be an object');
    return value;
  } catch (error) {
    fail('Self-bootstrap closeout evidence is not valid JSON', { evidencePath, error: error.message });
  }
}

function phaseById(evidence, id) {
  const phases = Array.isArray(evidence.phases) ? evidence.phases : [];
  const matches = phases.filter((phase) => phase?.id === id);
  if (matches.length !== 1) fail('Self-bootstrap closeout evidence phase set is invalid', {
    phase: id, count: matches.length,
  });
  return matches[0];
}

function validatePhaseSet(evidence) {
  if (!Array.isArray(evidence.phases) || evidence.phases.length !== SELF_BOOTSTRAP_EVIDENCE_PHASES.length) {
    fail('Self-bootstrap closeout evidence phase set is incomplete', {
      expected: SELF_BOOTSTRAP_EVIDENCE_PHASES,
      actual: Array.isArray(evidence.phases) ? evidence.phases.map((phase) => phase?.id || null) : null,
    });
  }
  for (const id of SELF_BOOTSTRAP_EVIDENCE_PHASES) phaseById(evidence, id);
}

export function validateSelfBootstrapEvidence(evidence, { runId, taskId, remote, dev }) {
  if (evidence.schemaVersion !== SELF_BOOTSTRAP_EVIDENCE_SCHEMA) {
    fail('Self-bootstrap closeout evidence schema does not match', {
      expected: SELF_BOOTSTRAP_EVIDENCE_SCHEMA, actual: evidence.schemaVersion || null,
    });
  }
  if (!['passed', 'not-applicable'].includes(evidence.status)) {
    fail('Self-bootstrap closeout evidence is not successful', { status: evidence.status || null });
  }
  const plan = evidence.plan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    fail('Self-bootstrap closeout evidence is missing its plan');
  }
  const expected = { runId, taskId, remote, targetBranch: dev };
  const actual = {
    runId: evidence.runId,
    taskId: evidence.taskId,
    remote: plan.remote,
    targetBranch: plan.targetBranch,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)
    || plan.runId !== evidence.runId || plan.taskId !== evidence.taskId) {
    fail('Self-bootstrap closeout evidence identity does not match the release', { expected, actual });
  }
  if (evidence.recoveryPlan !== null) {
    fail('Self-bootstrap closeout evidence still has a recovery plan');
  }
  if (!COMMIT_IDENTITY.test(plan.baseRef || '')) {
    fail('Self-bootstrap closeout evidence base ref is invalid', { baseRef: plan.baseRef || null });
  }
  validatePhaseSet(evidence);
  const planPhase = phaseById(evidence, 'plan');
  if (planPhase.status !== 'passed') {
    fail('Self-bootstrap closeout evidence plan phase did not pass', { status: planPhase.status || null });
  }

  let devRef;
  if (evidence.status === 'not-applicable') {
    const unexpected = SELF_BOOTSTRAP_EVIDENCE_PHASES
      .filter((id) => id !== 'plan')
      .filter((id) => phaseById(evidence, id).status !== 'not-applicable');
    if (unexpected.length) fail('Not-applicable self-bootstrap closeout evidence phase set is invalid', {
      phases: unexpected,
    });
    devRef = plan.baseRef;
  } else {
    if (evidence.diagnostic !== null) fail('Passed self-bootstrap closeout evidence contains a diagnostic');
    const preflight = phaseById(evidence, 'preflight');
    const push = phaseById(evidence, 'push');
    const finalize = phaseById(evidence, 'finalize');
    if (preflight.status !== 'passed' || finalize.status !== 'passed') {
      fail('Self-bootstrap closeout evidence did not complete preflight and finalize', {
        preflight: preflight.status || null, finalize: finalize.status || null,
      });
    }
    if (push.status === 'passed') devRef = push.outputIdentity;
    else if (push.status === 'not-applicable') devRef = preflight.outputIdentity;
    else fail('Self-bootstrap closeout evidence push phase is incomplete', { status: push.status || null });
  }
  if (!COMMIT_IDENTITY.test(devRef || '')) {
    fail('Self-bootstrap closeout evidence final dev ref is invalid', { devRef: devRef || null });
  }
  return { runId, taskId, status: evidence.status, baseRef: plan.baseRef, devRef };
}

export function bridgeMainToDev(options) {
  const {
    repo, remote = 'origin', main = 'main', dev = 'dev', candidateTree, version,
    selfBootstrapRun, selfBootstrapEvidence, beforeRemoteRecheck,
  } = options;
  const root = rev(repo, '--show-toplevel');
  const status = git(root, ['status', '--porcelain']).stdout.trim();
  if (status) fail('Release history bridge requires a clean worktree', { status });

  const closeout = validateSelfBootstrapEvidence(readSelfBootstrapEvidence(selfBootstrapEvidence), {
    runId: selfBootstrapRun,
    taskId: `release-${version}`,
    remote,
    dev,
  });

  git(root, ['fetch', remote, main, dev]);
  const mainRef = `${remote}/${main}`;
  const devRef = `${remote}/${dev}`;
  const fetched = {
    main: rev(root, mainRef),
    dev: rev(root, devRef),
  };
  if (closeout.devRef !== fetched.dev) fail('Self-bootstrap closeout evidence does not match current remote dev', {
    expected: closeout.devRef, actual: fetched.dev, runId: closeout.runId,
  });
  const trees = {
    main: rev(root, `${mainRef}^{tree}`),
    dev: rev(root, `${devRef}^{tree}`),
  };
  assertExpected(mainRef, trees.main, candidateTree);
  assertExpected(devRef, trees.dev, candidateTree);
  assertExpected(`${mainRef} package version`, packageVersion(root, mainRef), version);
  assertExpected(`${devRef} package version`, packageVersion(root, devRef), version);

  const ancestor = git(root, ['merge-base', '--is-ancestor', mainRef, devRef], { allowFailure: true });
  if (ancestor.status === 0) {
    return {
      schemaVersion: 'buildr.release-history-bridge/v1',
      ok: true,
      action: 'already-bridged',
      candidateTree,
      selfBootstrap: closeout,
      refs: fetched,
    };
  }
  if (ancestor.status !== 1) fail('Unable to determine main/dev ancestry', { stderr: ancestor.stderr.trim() });

  const branch = git(root, ['branch', '--show-current']).stdout.trim();
  if (branch !== dev) fail(`Release history bridge must run with local ${dev} checked out`, { branch });
  const localDev = rev(root, `refs/heads/${dev}`);
  if (localDev !== fetched.dev) fail(`Local ${dev} does not match ${devRef}`, { localDev, remoteDev: fetched.dev });

  beforeRemoteRecheck?.({ root, fetched });
  const liveBeforeMerge = remoteRefs(root, remote, main, dev);
  if (liveBeforeMerge.main !== fetched.main || liveBeforeMerge.dev !== fetched.dev) {
    fail('Remote refs changed after the tree-identity gate', { fetched, actual: liveBeforeMerge });
  }

  git(root, ['merge', '-s', 'ours', '--no-ff', mainRef, '-m', `chore(git): 衔接 ${main} squash 历史`]);
  const bridgedTree = rev(root, 'HEAD^{tree}');
  assertExpected('bridged HEAD', bridgedTree, candidateTree);

  const push = git(root, ['push', remote, `refs/heads/${dev}:refs/heads/${dev}`], { allowFailure: true });
  if (push.status !== 0) fail(`Push of ${dev} history bridge was rejected`, {
    exitCode: push.status,
    stdout: push.stdout.trim(),
    stderr: push.stderr.trim(),
  });

  const remoteAfterPush = remoteRefs(root, remote, main, dev);
  const head = rev(root, 'HEAD');
  if (remoteAfterPush.dev !== head) fail(`Remote ${dev} does not contain the history bridge`, {
    expected: head,
    actual: remoteAfterPush.dev,
  });
  return {
    schemaVersion: 'buildr.release-history-bridge/v1',
    ok: true,
    action: 'bridged',
    candidateTree,
    selfBootstrap: closeout,
    commit: head,
    refs: remoteAfterPush,
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    console.log(JSON.stringify(bridgeMainToDev(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      schemaVersion: 'buildr.release-history-bridge/v1',
      ok: false,
      error: error.message,
      details: error.details || {},
    }, null, 2));
    process.exitCode = 1;
  }
}
