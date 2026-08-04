#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TASK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN_SCHEMA = 'buildr.task-metadata-publication-snapshot/v1';

export const PORTABLE_TASK_RECORD_DECLARATIONS = Object.freeze([
  Object.freeze({ owner: 'buildr.task-record/v1', path: '.buildr/tasks/<task-id>/task.yml' }),
  Object.freeze({ owner: 'buildr.task-development/v2', path: '.buildr/tasks/<task-id>/development.yml' }),
  Object.freeze({ owner: 'buildr.task-verification/v3', path: '.buildr/tasks/<task-id>/verification.yml' }),
  Object.freeze({ owner: 'buildr.task-review/v1', path: '.buildr/tasks/<task-id>/reviews/planning.yml' }),
  Object.freeze({ owner: 'buildr.task-review/v1', path: '.buildr/tasks/<task-id>/reviews/completion.yml' }),
]);

function sha256(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function publicationError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function blocked(error, details = {}) {
  return {
    schemaVersion: 'buildr.task-metadata-publication-observation/v1',
    status: 'blocked',
    diagnostic: {
      code: error.code || 'task_metadata_publication_failed',
      message: error.message,
      details: { ...(error.details || {}), ...details },
    },
    effects: [],
  };
}

function runGit(repository, args, { encoding = 'utf8', allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', repository, ...args], { encoding });
  if (result.status === 0) return result.stdout;
  if (allowFailure) return null;
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
  throw publicationError('task_metadata_publication_git_observation_failed', `Git observation failed: git ${args.join(' ')}`, { stderr: String(stderr || '').trim() });
}

function realDirectory(label, candidate) {
  const resolved = path.resolve(candidate);
  let stat;
  try { stat = fs.lstatSync(resolved); } catch (error) {
    throw publicationError('task_metadata_publication_root_invalid', `${label} does not exist or is unreadable.`, { path: resolved, cause: error.code });
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw publicationError('task_metadata_publication_root_invalid', `${label} must be a regular directory.`, { path: resolved });
  return fs.realpathSync(resolved);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function observeRepository(workspaceRoot, requestedRepository) {
  const probeRoot = requestedRepository ? realDirectory('repository', requestedRepository) : workspaceRoot;
  const top = runGit(probeRoot, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (top === null) {
    if (requestedRepository) throw publicationError('task_metadata_publication_repository_not_git', 'The selected repository is not a Git repository.', { repository: probeRoot });
    return { kind: 'none', root: null, branch: null, head: null };
  }
  const repository = fs.realpathSync(String(top).trim());
  if (requestedRepository && repository !== probeRoot) throw publicationError('task_metadata_publication_repository_mismatch', 'The selected repository must be its actual Git top-level.', { requested: probeRoot, actual: repository });
  if (!isWithin(repository, workspaceRoot)) throw publicationError('task_metadata_publication_workspace_outside_repository', 'Canonical Workspace is outside the selected repository.', { workspaceRoot, repository });

  const workspaceTop = runGit(workspaceRoot, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (workspaceTop === null || fs.realpathSync(String(workspaceTop).trim()) !== repository) {
    throw publicationError('task_metadata_publication_repository_mismatch', 'Canonical Workspace and selected repository do not share the same checkout.', { workspaceRoot, repository });
  }
  const gitDirRaw = String(runGit(workspaceRoot, ['rev-parse', '--git-dir'])).trim();
  const commonDirRaw = String(runGit(workspaceRoot, ['rev-parse', '--git-common-dir'])).trim();
  const gitDir = fs.realpathSync(path.resolve(workspaceRoot, gitDirRaw));
  const commonDir = fs.realpathSync(path.resolve(workspaceRoot, commonDirRaw));
  if (gitDir !== commonDir) throw publicationError('task_metadata_publication_workspace_not_canonical', 'Task Metadata Publication requires the canonical checkout, not a linked worktree.', { workspaceRoot, gitDir, commonDir });
  const branch = runGit(repository, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  const head = runGit(repository, ['rev-parse', 'HEAD'], { allowFailure: true });
  return { kind: 'git', root: repository, branch: branch === null ? null : String(branch).trim(), head: head === null ? null : String(head).trim() };
}

function normalizeDeclarations(taskId, declarations = PORTABLE_TASK_RECORD_DECLARATIONS) {
  if (!TASK_ID.test(taskId || '')) throw publicationError('task_metadata_publication_task_id_invalid', `Invalid Task ID: ${taskId || '<missing>'}.`, { taskId });
  const seen = new Map();
  const normalized = declarations.map((entry) => {
    if (!entry || typeof entry.owner !== 'string' || typeof entry.path !== 'string' || !entry.path.includes('<task-id>')) {
      throw publicationError('task_metadata_publication_declaration_invalid', 'Portable record declaration is invalid.', { declaration: entry });
    }
    const relativePath = entry.path.replaceAll('<task-id>', taskId);
    if (path.isAbsolute(relativePath) || relativePath.split('/').includes('..') || !relativePath.startsWith(`.buildr/tasks/${taskId}/`)) {
      throw publicationError('task_metadata_publication_declaration_escape', 'Portable record declaration escapes the Task namespace.', { owner: entry.owner, path: relativePath });
    }
    if (seen.has(relativePath)) throw publicationError('task_metadata_publication_ownership_conflict', 'Multiple writers declare the same exact path.', { path: relativePath, owners: [seen.get(relativePath), entry.owner] });
    seen.set(relativePath, entry.owner);
    return { owner: entry.owner, path: relativePath };
  });
  return normalized.sort((left, right) => left.path.localeCompare(right.path) || left.owner.localeCompare(right.owner));
}

function inspectParentChain(workspaceRoot, relativePath) {
  const segments = relativePath.split('/');
  let current = workspaceRoot;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw publicationError('task_metadata_publication_path_unreadable', 'Publication parent path is unreadable.', { path: relativePath, cause: error.code });
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw publicationError('task_metadata_publication_path_occupied', 'Publication parent path must be a regular directory.', { path: relativePath, occupied: path.relative(workspaceRoot, current).split(path.sep).join('/') });
  }
}

function inspectLiveRecord(workspaceRoot, declaration) {
  inspectParentChain(workspaceRoot, declaration.path);
  const file = path.resolve(workspaceRoot, declaration.path);
  if (!isWithin(workspaceRoot, file)) throw publicationError('task_metadata_publication_path_escape', 'Publication path escapes the canonical Workspace.', { path: declaration.path });
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return { ...declaration, status: 'absent', size: null, digest: null };
    throw publicationError('task_metadata_publication_path_unreadable', 'Publication path is unreadable.', { path: declaration.path, cause: error.code });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw publicationError('task_metadata_publication_path_occupied', 'Publication path must be a regular file.', { path: declaration.path });
  let content;
  try { content = fs.readFileSync(file); } catch (error) {
    throw publicationError('task_metadata_publication_path_unreadable', 'Publication file bytes are unreadable.', { path: declaration.path, cause: error.code });
  }
  return { ...declaration, status: 'present', size: content.length, digest: sha256(content) };
}

function treeRecord(repository, ref, declaration) {
  if (!ref) return { ...declaration, status: 'absent', size: null, digest: null };
  const content = runGit(repository, ['show', `${ref}:${declaration.path}`], { encoding: 'buffer', allowFailure: true });
  if (content === null) return { ...declaration, status: 'absent', size: null, digest: null };
  return { ...declaration, status: 'present', size: content.length, digest: sha256(content) };
}

function sameRecord(left, right) {
  return left.owner === right.owner && left.path === right.path && left.status === right.status && left.size === right.size && left.digest === right.digest;
}

function snapshotPayload({ taskId, workspaceRoot, repository, records, beforeTree }) {
  const payload = {
    schemaVersion: TOKEN_SCHEMA,
    taskId,
    workspaceRoot,
    repository,
    records,
    beforeTree,
    declaredPaths: records.map((record) => record.path),
    presentPaths: records.filter((record) => record.status === 'present').map((record) => record.path),
    absentPaths: records.filter((record) => record.status === 'absent').map((record) => record.path),
    operationPaths: beforeTree ? records.filter((record, index) => !sameRecord(record, beforeTree[index])).map((record) => record.path) : [],
  };
  return { ...payload, snapshotIdentity: sha256(stableJson(payload)) };
}

export function encodeSnapshot(snapshot) {
  const payload = { ...snapshot };
  delete payload.token;
  return Buffer.from(stableJson(payload), 'utf8').toString('base64url');
}

export function decodeSnapshot(token) {
  let value;
  try { value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); } catch {
    throw publicationError('task_metadata_publication_token_invalid', 'Snapshot token is invalid.');
  }
  if (value?.schemaVersion !== TOKEN_SCHEMA || typeof value.snapshotIdentity !== 'string') throw publicationError('task_metadata_publication_token_invalid', 'Snapshot token schema is invalid.');
  const expected = snapshotPayload({ taskId: value.taskId, workspaceRoot: value.workspaceRoot, repository: value.repository, records: value.records, beforeTree: value.beforeTree });
  if (expected.snapshotIdentity !== value.snapshotIdentity) throw publicationError('task_metadata_publication_token_invalid', 'Snapshot token identity is invalid.');
  return value;
}

export function createPublicationSnapshot({ workspaceRoot, taskId, repositoryRoot = null, declarations = PORTABLE_TASK_RECORD_DECLARATIONS } = {}) {
  try {
    const workspace = realDirectory('canonical Workspace', workspaceRoot);
    const workspaceDeclaration = path.join(workspace, '.buildr', 'workspace.yml');
    let declarationStat;
    try { declarationStat = fs.lstatSync(workspaceDeclaration); } catch (error) {
      throw publicationError('task_metadata_publication_workspace_invalid', 'Canonical Workspace is not initialized.', { workspaceRoot: workspace, cause: error.code });
    }
    if (!declarationStat.isFile() || declarationStat.isSymbolicLink()) throw publicationError('task_metadata_publication_workspace_invalid', 'Canonical Workspace declaration must be a regular file.', { path: workspaceDeclaration });
    const normalized = normalizeDeclarations(taskId, declarations);
    const repository = observeRepository(workspace, repositoryRoot);
    const records = normalized.map((entry) => inspectLiveRecord(workspace, entry));
    const beforeTree = repository.kind === 'git' ? normalized.map((entry) => treeRecord(repository.root, repository.head, entry)) : null;
    const snapshot = snapshotPayload({ taskId, workspaceRoot: workspace, repository, records, beforeTree });
    const status = repository.kind === 'none'
      ? 'local-only'
      : snapshot.operationPaths.length > 0
        ? 'ready'
        : records.every((record) => record.status === 'absent')
          ? 'not-applicable'
          : 'aligned';
    return {
      schemaVersion: 'buildr.task-metadata-publication-observation/v1',
      status,
      snapshot: { ...snapshot, token: encodeSnapshot(snapshot) },
      effects: [],
      diagnostic: null,
    };
  } catch (error) {
    return blocked(error, { taskId, workspaceRoot: workspaceRoot ? path.resolve(workspaceRoot) : null });
  }
}

function diffPaths(repository, commit) {
  const parent = runGit(repository, ['rev-parse', `${commit}^`], { allowFailure: true });
  if (parent === null) throw publicationError('task_metadata_publication_commit_parent_missing', 'Metadata publication cannot use a root commit.', { commit });
  const output = runGit(repository, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', String(parent).trim(), commit], { encoding: 'buffer' });
  return output.toString('utf8').split('\0').filter(Boolean).sort();
}

function verifyTree(snapshot, ref) {
  const tree = snapshot.records.map((record) => treeRecord(snapshot.repository.root, ref, record));
  const mismatches = snapshot.records.filter((record, index) => !sameRecord(record, tree[index])).map((record) => record.path);
  return { tree, mismatches };
}

export function verifyPublicationSnapshot({ token, commit } = {}) {
  try {
    const snapshot = decodeSnapshot(token);
    if (snapshot.repository?.kind !== 'git') throw publicationError('task_metadata_publication_git_not_applicable', 'Snapshot is not Git-backed.');
    const live = createPublicationSnapshot({ workspaceRoot: snapshot.workspaceRoot, taskId: snapshot.taskId, repositoryRoot: snapshot.repository.root });
    if (live.status === 'blocked') throw publicationError(live.diagnostic.code, live.diagnostic.message, live.diagnostic.details);
    const liveMismatches = snapshot.records.filter((record, index) => !sameRecord(record, live.snapshot.records[index])).map((record) => record.path);
    const { mismatches: treeMismatches } = verifyTree(snapshot, commit);
    const actualDiff = diffPaths(snapshot.repository.root, commit);
    const expectedDiff = [...snapshot.operationPaths].sort();
    const diffMatches = stableJson(actualDiff) === stableJson(expectedDiff);
    if (liveMismatches.length || treeMismatches.length || !diffMatches) {
      throw publicationError('task_metadata_publication_snapshot_drift', 'Live records or metadata commit do not match the publication snapshot.', { liveMismatches, treeMismatches, expectedDiff, actualDiff });
    }
    return {
      schemaVersion: 'buildr.task-metadata-publication-verification/v1',
      status: 'verified',
      taskId: snapshot.taskId,
      snapshotIdentity: snapshot.snapshotIdentity,
      commit: String(runGit(snapshot.repository.root, ['rev-parse', commit])).trim(),
      paths: expectedDiff,
      effects: [],
      diagnostic: null,
    };
  } catch (error) { return blocked(error, { commit }); }
}

function rangeCommits(repository, targetRef, sourceRef) {
  const output = runGit(repository, ['rev-list', '--reverse', `${targetRef}..${sourceRef}`]);
  return String(output).split(/\r?\n/).filter(Boolean);
}

export function findEquivalentPublicationCommit({ token, targetRef, sourceRef } = {}) {
  try {
    const snapshot = decodeSnapshot(token);
    if (snapshot.repository?.kind !== 'git') throw publicationError('task_metadata_publication_git_not_applicable', 'Snapshot is not Git-backed.');
    const commits = rangeCommits(snapshot.repository.root, targetRef, sourceRef);
    if (!commits.length) {
      const target = verifyTree(snapshot, targetRef);
      return { schemaVersion: 'buildr.task-metadata-publication-equivalence/v1', status: target.mismatches.length ? 'none' : 'aligned', commit: null, snapshotIdentity: snapshot.snapshotIdentity, effects: [], diagnostic: null };
    }
    for (const commit of commits) {
      const tree = verifyTree(snapshot, commit);
      if (tree.mismatches.length) continue;
      if (stableJson(diffPaths(snapshot.repository.root, commit)) !== stableJson([...snapshot.operationPaths].sort())) continue;
      return { schemaVersion: 'buildr.task-metadata-publication-equivalence/v1', status: 'reusable', commit, snapshotIdentity: snapshot.snapshotIdentity, effects: [], diagnostic: null };
    }
    const source = verifyTree(snapshot, sourceRef);
    return { schemaVersion: 'buildr.task-metadata-publication-equivalence/v1', status: source.mismatches.length ? 'none' : 'aligned', commit: null, snapshotIdentity: snapshot.snapshotIdentity, effects: [], diagnostic: null };
  } catch (error) { return blocked(error, { targetRef, sourceRef }); }
}

export function inspectPublicationRange({ token, targetRef, sourceRef } = {}) {
  try {
    const snapshot = decodeSnapshot(token);
    if (snapshot.repository?.kind !== 'git') throw publicationError('task_metadata_publication_git_not_applicable', 'Snapshot is not Git-backed.');
    const allowed = new Set(snapshot.declaredPaths);
    const commits = rangeCommits(snapshot.repository.root, targetRef, sourceRef).map((commit) => {
      const paths = diffPaths(snapshot.repository.root, commit);
      return { commit, paths, scope: paths.every((entry) => allowed.has(entry)) ? 'owned' : 'outside' };
    });
    const outside = commits.filter((entry) => entry.scope === 'outside');
    const sourceTree = verifyTree(snapshot, sourceRef);
    if (outside.length || sourceTree.mismatches.length) throw publicationError('task_metadata_publication_range_outside_scope', 'Unpublished range contains scope-external commits or does not end at the snapshot tree.', { outside, treeMismatches: sourceTree.mismatches });
    return { schemaVersion: 'buildr.task-metadata-publication-range/v1', status: 'verified', targetRef, sourceRef, commits, snapshotIdentity: snapshot.snapshotIdentity, effects: [], diagnostic: null };
  } catch (error) { return blocked(error, { targetRef, sourceRef }); }
}

function parseArgs(argv) {
  const [operation, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!flag?.startsWith('--') || rest[index + 1] === undefined) throw publicationError('task_metadata_publication_arguments_invalid', `Invalid argument: ${flag || '<missing>'}.`);
    options[flag.slice(2)] = rest[index + 1];
  }
  return { operation, options };
}

function runCli(argv) {
  try {
    const { operation, options } = parseArgs(argv);
    if (operation === 'snapshot') return createPublicationSnapshot({ workspaceRoot: options.workspace, taskId: options.task, repositoryRoot: options.repository || null });
    if (operation === 'verify') return verifyPublicationSnapshot({ token: options.token, commit: options.commit });
    if (operation === 'equivalent') return findEquivalentPublicationCommit({ token: options.token, targetRef: options['target-ref'], sourceRef: options['source-ref'] });
    if (operation === 'range') return inspectPublicationRange({ token: options.token, targetRef: options['target-ref'], sourceRef: options['source-ref'] });
    throw publicationError('task_metadata_publication_operation_invalid', 'Usage: publication.mjs <snapshot|verify|equivalent|range> ...');
  } catch (error) { return blocked(error); }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const result = runCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'blocked') process.exitCode = 1;
}
