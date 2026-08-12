import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MAX_BUFFER = 64 * 1024 * 1024;
const CONTROL_SEGMENTS = new Set(['.buildr', '.git']);

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function normalizePath(value) {
  return path.posix.normalize(String(value || '').replaceAll('\\', '/')).replace(/^\.\//, '');
}

function deliverablePath(value) {
  const normalized = normalizePath(value);
  return Boolean(normalized) && !normalized.split('/').some((segment) => CONTROL_SEGMENTS.has(segment));
}

export function gitContributionCommand(root, args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: MAX_BUFFER,
    env: options.env || process.env,
    input: options.input,
  });
}

export function gitContributionText(root, args, options = {}) {
  const result = gitContributionCommand(root, args, options);
  return result.status === 0 ? String(result.stdout).trim() : null;
}

export function requireGitContributionText(root, args, message, options = {}) {
  const value = gitContributionText(root, args, options);
  if (!value) throw new Error(message);
  return value;
}

function nulPaths(result) {
  if (result.status !== 0) return null;
  return String(result.stdout).split('\0').filter(Boolean).map(normalizePath);
}

function taskSourcePaths(root, baselineHead) {
  const baseline = nulPaths(gitContributionCommand(root, ['ls-tree', '-r', '-z', '--name-only', baselineHead]));
  const current = nulPaths(gitContributionCommand(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']));
  if (!baseline || !current) throw new Error('Unable to inventory Task source paths.');
  return [...new Set([...baseline, ...current].filter(deliverablePath))].sort();
}

export function withGitTaskContributionSnapshot(root, baselineHead, operation) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-contribution-'));
  try {
    const indexFile = path.join(temporary, 'index');
    const environment = { ...process.env, GIT_INDEX_FILE: indexFile };
    const read = gitContributionCommand(root, ['read-tree', baselineHead], { env: environment });
    if (read.status !== 0) throw new Error(`Unable to seed Task source snapshot: ${read.stderr || read.stdout}`);
    const sourcePaths = taskSourcePaths(root, baselineHead);
    if (sourcePaths.length > 0) {
      const added = gitContributionCommand(root, ['add', '-A', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], { env: environment, encoding: 'buffer', input: Buffer.from(`${sourcePaths.join('\0')}\0`) });
      if (added.status !== 0) throw new Error(`Unable to snapshot exact Task source: ${added.stderr || added.stdout}`);
    }
    const tree = requireGitContributionText(root, ['write-tree'], 'Unable to write Task source snapshot tree.', { env: environment });
    return operation({ tree, environment, temporary });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function rawDelta(root, beforeTree, afterTree) {
  const result = gitContributionCommand(root, ['diff-tree', '--no-commit-id', '-r', '--raw', '-z', '--no-renames', beforeTree, afterTree], { encoding: 'buffer' });
  if (result.status !== 0) throw new Error(`Unable to observe Task Contribution delta: ${String(result.stderr || result.stdout)}`);
  return Buffer.from(result.stdout);
}

export function gitTaskContributionIdentity(root, beforeTree, afterTree) {
  return digest(Buffer.concat([Buffer.from('buildr.git-task-contribution/v1\0'), rawDelta(root, beforeTree, afterTree)]));
}

export function gitTaskContributionPatch(root, beforeTree, afterTree) {
  const result = gitContributionCommand(root, ['diff', '--binary', '--full-index', '--no-renames', beforeTree, afterTree, '--'], { encoding: 'buffer' });
  if (result.status !== 0) throw new Error(`Unable to materialize Task Contribution patch: ${String(result.stderr || result.stdout)}`);
  return Buffer.from(result.stdout);
}

export function observeGitTaskContribution({ root, deliveryBaselineHead }) {
  const sourceHead = requireGitContributionText(root, ['rev-parse', 'HEAD^{commit}'], 'Task source HEAD is unavailable.');
  const originalBaselineHead = requireGitContributionText(root, ['merge-base', sourceHead, deliveryBaselineHead], 'Task source and Delivery Baseline have no provable Git baseline.');
  const originalBaselineTree = requireGitContributionText(root, ['rev-parse', `${originalBaselineHead}^{tree}`], 'Original Task baseline tree is unavailable.');
  return withGitTaskContributionSnapshot(root, originalBaselineHead, ({ tree: sourceTree }) => ({
    schemaVersion: 'buildr.git-task-contribution/v1',
    identity: gitTaskContributionIdentity(root, originalBaselineTree, sourceTree),
    originalBaseline: { head: originalBaselineHead, tree: originalBaselineTree },
    source: { head: sourceHead, tree: sourceTree },
  }));
}
