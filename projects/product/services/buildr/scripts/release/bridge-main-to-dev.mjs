#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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
  return { ...options, candidateTree: options['candidate-tree'] };
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

export function bridgeMainToDev(options) {
  const {
    repo, remote = 'origin', main = 'main', dev = 'dev', candidateTree, version, beforeRemoteRecheck,
  } = options;
  const root = rev(repo, '--show-toplevel');
  const status = git(root, ['status', '--porcelain']).stdout.trim();
  if (status) fail('Release history bridge requires a clean worktree', { status });

  git(root, ['fetch', remote, main, dev]);
  const mainRef = `${remote}/${main}`;
  const devRef = `${remote}/${dev}`;
  const fetched = {
    main: rev(root, mainRef),
    dev: rev(root, devRef),
  };
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
