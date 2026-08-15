#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');

function defaultExecute(command, args, options = {}) {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', env: options.env ?? process.env });
}

function invoke(execute, executable, args, cwd, { allowFailure = false } = {}) {
  const result = execute(executable, args, { cwd });
  if (!allowFailure && result?.status !== 0) throw new Error(`${executable} ${args.join(' ')} failed: ${String(result?.stderr ?? result?.stdout ?? '').trim()}`);
  return result;
}

function requiredTag(value) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value ?? '')) throw new Error('Release tag must be v<semver>.');
  return value;
}

function requiredCommit(value) {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('Release source commit must be a full lowercase 40-character Git commit.');
  return value;
}

function parseRemoteTag(stdout, tag) {
  const directRef = `refs/tags/${tag}`;
  const peeledRef = `${directRef}^{}`;
  const entries = String(stdout ?? '').trim().split('\n').filter(Boolean).map((line) => {
    const [sha, ref] = line.split(/\s+/);
    return { sha, ref };
  });
  const direct = entries.find((entry) => entry.ref === directRef) ?? null;
  const peeled = entries.find((entry) => entry.ref === peeledRef) ?? null;
  if (!direct) return null;
  return {
    ref: directRef,
    object: direct.sha,
    targetCommit: peeled?.sha ?? direct.sha,
    annotated: Boolean(peeled),
  };
}

export function inspectReleaseTag(options = {}, dependencies = {}) {
  const execute = dependencies.execute ?? defaultExecute;
  const repo = path.resolve(options.repo || workspaceRoot);
  const remote = options.remote || 'origin';
  const tag = requiredTag(options.tag);
  const sourceCommit = requiredCommit(options.sourceCommit);
  const source = invoke(execute, 'git', ['rev-parse', `${sourceCommit}^{commit}`], repo);
  if (source.status !== 0 || source.stdout.trim() !== sourceCommit) throw new Error(`Release source commit ${sourceCommit} is unavailable.`);
  const result = invoke(execute, 'git', ['ls-remote', '--tags', remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], repo);
  const observed = parseRemoteTag(result.stdout, tag);
  if (!observed) return { schemaVersion: 'buildr.release-tag-ensure/v1', operation: 'preflight', status: 'ready', tag, sourceCommit, action: 'create', observed: null, effects: [], nextActions: [] };
  if (observed.targetCommit !== sourceCommit) {
    return {
      schemaVersion: 'buildr.release-tag-ensure/v1',
      operation: 'preflight',
      status: 'blocked',
      tag,
      sourceCommit,
      action: null,
      observed,
      effects: [],
      diagnostic: { code: 'release_tag_target_mismatch', expected: sourceCommit, actual: observed.targetCommit },
      nextActions: ['保留现有tag并停止发布；不得删除、移动或force push该tag。'],
    };
  }
  return { schemaVersion: 'buildr.release-tag-ensure/v1', operation: 'preflight', status: 'ready', tag, sourceCommit, action: 'reuse', observed, effects: [], nextActions: [] };
}

export function ensureReleaseTag(options = {}, dependencies = {}) {
  const execute = dependencies.execute ?? defaultExecute;
  const repo = path.resolve(options.repo || workspaceRoot);
  const remote = options.remote || 'origin';
  const tag = requiredTag(options.tag);
  const sourceCommit = requiredCommit(options.sourceCommit);
  const before = inspectReleaseTag({ repo, remote, tag, sourceCommit }, { execute });
  if (before.status !== 'ready') return { ...before, operation: 'ensure' };
  if (before.action === 'reuse') return { ...before, operation: 'ensure', status: 'passed', effects: [{ type: 'tag-reused', tag, sourceCommit }] };

  invoke(execute, 'git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'tag', '-a', tag, sourceCommit, '-m', `Buildr ${tag}`], repo);
  const push = invoke(execute, 'git', ['push', remote, `refs/tags/${tag}`], repo, { allowFailure: true });
  const after = inspectReleaseTag({ repo, remote, tag, sourceCommit }, { execute });
  if (after.status !== 'ready' || after.action !== 'reuse') {
    const reason = String(push?.stderr ?? push?.stdout ?? '').trim();
    throw new Error(`Release tag ${tag} push was not confirmed: ${reason || after.diagnostic?.code || 'unknown'}`);
  }
  return {
    ...after,
    operation: 'ensure',
    status: 'passed',
    effects: [{ type: push.status === 0 ? 'tag-created' : 'tag-concurrently-reused', tag, sourceCommit }],
  };
}

function parseOptions(argv) {
  const [operation, tag, sourceCommit, ...rest] = argv;
  if (!['preflight', 'ensure'].includes(operation)) throw new Error('Usage: release-tag-ensure.mjs <preflight|ensure> <tag> <source-commit> [--repo <path>] [--remote <name>]');
  const options = { operation, tag, sourceCommit };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  return { operation, tag, sourceCommit, repo: options.repo ? path.resolve(options.repo) : workspaceRoot, remote: options.remote || 'origin' };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const result = options.operation === 'preflight' ? inspectReleaseTag(options) : ensureReleaseTag(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!['ready', 'passed'].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: 'buildr.release-tag-ensure/v1', status: 'blocked', error: error.message, effects: [], nextActions: ['保留现有tag并停止发布；不得删除、移动或force push。'] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
