#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot: any = path.resolve(serviceRoot, '../../../..');

function defaultExecute(command: any, args: any, options: any = {}): any  {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', env: options.env ?? process.env, timeout: 30_000 });
}

function invoke(execute: any, executable: any, args: any, cwd: any, { allowFailure = false }: any = {}): any  {
  const result: any = execute(executable, args, { cwd });
  if (!allowFailure && result?.status !== 0) throw new Error(`${executable} ${args.join(' ')} failed: ${String(result?.stderr ?? result?.stdout ?? '').trim()}`);
  return result;
}

function requiredTag(value: any): any  {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value ?? '')) throw new Error('Release tag must be v<semver>.');
  return value;
}

function requiredCommit(value: any): any  {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('Release source commit must be a full lowercase 40-character Git commit.');
  return value;
}

function parseRemoteTag(stdout: any, tag: any): any  {
  const directRef: any = `refs/tags/${tag}`;
  const peeledRef: any = `${directRef}^{}`;
  const entries: any = String(stdout ?? '').trim().split('\n').filter(Boolean).map((line: any) => {
    const [sha, ref]: any = line.split(/\s+/);
    return { sha, ref };
  });
  const direct: any = entries.find((entry: any) => entry.ref === directRef) ?? null;
  const peeled: any = entries.find((entry: any) => entry.ref === peeledRef) ?? null;
  if (!direct) return null;
  return {
    ref: directRef,
    object: direct.sha,
    targetCommit: peeled?.sha ?? direct.sha,
    annotated: Boolean(peeled),
  };
}

export function inspectReleaseTag(options: any = {}, dependencies: any = {}): any  {
  const execute: any = dependencies.execute ?? defaultExecute;
  const repo: any = path.resolve(options.repo || workspaceRoot);
  const remote: any = options.remote || 'origin';
  const tag: any = requiredTag(options.tag);
  const sourceCommit: any = requiredCommit(options.sourceCommit);
  const source: any = invoke(execute, 'git', ['rev-parse', `${sourceCommit}^{commit}`], repo);
  if (source.status !== 0 || source.stdout.trim() !== sourceCommit) throw new Error(`Release source commit ${sourceCommit} is unavailable.`);
  const result: any = invoke(execute, 'git', ['ls-remote', '--tags', remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], repo);
  const observed: any = parseRemoteTag(result.stdout, tag);
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

export function ensureReleaseTag(options: any = {}, dependencies: any = {}): any  {
  const execute: any = dependencies.execute ?? defaultExecute;
  const repo: any = path.resolve(options.repo || workspaceRoot);
  const remote: any = options.remote || 'origin';
  const tag: any = requiredTag(options.tag);
  const sourceCommit: any = requiredCommit(options.sourceCommit);
  const effects: any[] = [];
  try {
    const before: any = inspectReleaseTag({ repo, remote, tag, sourceCommit }, { execute });
    if (before.status !== 'ready') return { ...before, operation: 'ensure' };
    if (before.action === 'reuse') return { ...before, operation: 'ensure', status: 'passed', effects: [{ type: 'tag-reused', tag, sourceCommit, state: 'confirmed' }] };

    const local = invoke(execute, 'git', ['for-each-ref', '--format=%(objectname)', `refs/tags/${tag}`], repo).stdout.trim();
    if (local) {
      const target = invoke(execute, 'git', ['rev-parse', `refs/tags/${tag}^{commit}`], repo).stdout.trim();
      if (target !== sourceCommit) throw new Error(`Local tag ${tag} targets ${target}, not ${sourceCommit}.`);
      effects.push({ type: 'local-tag-reused', tag, sourceCommit, state: 'confirmed' });
    } else {
      const effect = { type: 'local-tag-created', tag, sourceCommit, state: 'unknown' };
      effects.push(effect);
      invoke(execute, 'git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'tag', '-a', tag, sourceCommit, '-m', `Buildr ${tag}`], repo);
      effect.state = 'confirmed';
    }
    const pushed = { type: 'remote-tag-pushed', tag, sourceCommit, state: 'unknown' };
    effects.push(pushed);
    const push: any = invoke(execute, 'git', ['push', remote, `refs/tags/${tag}`], repo, { allowFailure: true });
    const after: any = inspectReleaseTag({ repo, remote, tag, sourceCommit }, { execute });
    if (after.status !== 'ready' || after.action !== 'reuse') {
      pushed.state = after.action === 'create' ? 'not-applied' : 'conflict';
      throw new Error(`Release tag ${tag} push was not confirmed: ${String(push?.stderr || push?.stdout || after.diagnostic?.code || 'unknown').trim()}`);
    }
    pushed.state = 'confirmed';
    return { ...after, operation: 'ensure', status: 'passed', effects };
  } catch (error) {
    return {
      schemaVersion: 'buildr.release-tag-ensure/v1', operation: 'ensure', status: 'blocked', tag, sourceCommit,
      effects, diagnostic: { code: 'release-tag-ensure-blocked', message: error instanceof Error ? error.message : String(error) },
      nextActions: ['回读同一目标tag并恢复未完成推送；保留本地和远端已存在事实，不删除或覆盖tag。'],
    };
  }
}

function parseOptions(argv: any): any  {
  const [operation, tag, sourceCommit, ...rest]: any = argv;
  if (!['preflight', 'ensure'].includes(operation)) throw new Error('Usage: release-tag-ensure.ts <preflight|ensure> <tag> <source-commit> [--repo <path>] [--remote <name>]');
  const options: any = { operation, tag, sourceCommit };
  for (let index: any = 0; index < rest.length; index += 2) {
    const key: any = rest[index];
    const value: any = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  return { operation, tag, sourceCommit, repo: options.repo ? path.resolve(options.repo) : workspaceRoot, remote: options.remote || 'origin' };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options: any = parseOptions(process.argv.slice(2));
    const result: any = options.operation === 'preflight' ? inspectReleaseTag(options) : ensureReleaseTag(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!['ready', 'passed'].includes(result.status)) process.exitCode = 1;
  } catch (error: any) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: 'buildr.release-tag-ensure/v1', status: 'blocked', error: error.message, effects: [], nextActions: ['保留现有tag并停止发布；不得删除、移动或force push。'] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
