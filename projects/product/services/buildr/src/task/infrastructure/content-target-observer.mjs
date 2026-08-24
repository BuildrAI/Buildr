import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { spawnSync } from '../../infrastructure/process.mjs';
import { controlMetadataPath } from '../../infrastructure/git/control-metadata-path.mjs';
import { taskDevelopmentError } from '../domain/task-development.mjs';

export const GIT_CONTENT_OBSERVER = 'buildr.git-content-observer/v1';
export const FILESYSTEM_CONTENT_OBSERVER = 'buildr.filesystem-content-observer/v1';

function posix(value) {
  return value.split(path.sep).join('/');
}

function inside(parent, child, io = fs) {
  const left = physicalPath(io, parent);
  const right = physicalPath(io, child);
  const relative = path.relative(left, right);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function regularDirectory(io, root) {
  try {
    const stat = io.lstatSync(root);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function physicalPath(io, value) {
  try { return (io.realpathSync || fs.realpathSync)(value); } catch { return path.resolve(value); }
}

function filesystemPaths(root, io) {
  const files = [];
  const visit = (directory) => {
    for (const entry of io.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name);
      if (controlMetadataPath(posix(path.relative(root, target)))) continue;
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(target);
      else files.push(target);
    }
  };
  visit(root);
  return files;
}

function deliverablePath(root, target) {
  return !controlMetadataPath(posix(path.relative(root, target)));
}

function gitPaths(root, run, io) {
  const top = run('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5000 });
  if (top.status !== 0 || !top.stdout.trim()) return null;
  const prefix = run('git', ['-C', root, 'rev-parse', '--show-prefix'], { encoding: 'utf8', timeout: 5000 });
  if (prefix.status !== 0) return null;
  const repository = physicalPath(io, top.stdout.trim());
  const scopePrefix = prefix.stdout.trim().replace(/\/$/u, '');
  const scope = scopePrefix || '.';
  const listed = run('git', ['-C', repository, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', scope], { encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) return null;
  const prefixWithSlash = scopePrefix ? `${scopePrefix}/` : '';
  return [...new Set(listed.stdout.split('\0').filter(Boolean).flatMap((relative) => {
    if (prefixWithSlash && !relative.startsWith(prefixWithSlash)) return [];
    const scopedRelative = prefixWithSlash ? relative.slice(prefixWithSlash.length) : relative;
    const normalized = path.posix.normalize(scopedRelative.replaceAll('\\', '/'));
    if (!normalized || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return [];
    const target = path.resolve(root, ...normalized.split('/'));
    return deliverablePath(root, target) && io.existsSync(target) ? [target] : [];
  }))].sort((left, right) => posix(path.relative(root, left)).localeCompare(posix(path.relative(root, right))));
}

export function contentInventoryIdentity(root, files, io = fs) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const relative = posix(path.relative(root, file));
    hash.update(relative);
    hash.update('\0');
    if (!io.existsSync(file)) {
      hash.update('missing\0');
      continue;
    }
    const stat = io.lstatSync(file);
    if (stat.isSymbolicLink()) {
      hash.update('symlink\0');
      hash.update(io.readlinkSync(file));
      hash.update('\0');
    } else if (stat.isFile()) {
      hash.update(stat.mode & 0o111 ? 'executable\0' : 'file\0');
      hash.update(io.readFileSync(file));
      hash.update('\0');
    } else {
      hash.update(`other:${stat.mode & 0o170000}\0`);
    }
  }
  return `sha256-${hash.digest('hex')}`;
}

export function observeContentScope(scope, { io = fs, run = spawnSync } = {}) {
  const root = physicalPath(io, scope.executionRoot);
  if (!regularDirectory(io, root)) throw taskDevelopmentError('task_development_content_root_invalid', `Content Target scope 不是普通目录：${scope.selector}。`, 409, { selector: scope.selector, root });
  const tracked = gitPaths(root, run, io);
  const observer = tracked === null ? FILESYSTEM_CONTENT_OBSERVER : GIT_CONTENT_OBSERVER;
  const files = tracked === null ? filesystemPaths(root, io) : tracked;
  return {
    selector: scope.selector,
    kind: scope.kind,
    sourcePath: scope.sourcePath,
    observer,
    identity: contentInventoryIdentity(root, files, io),
  };
}

export function registerContentTargetObserver(runtime) {
  function observeTaskContentComponents(scopes) {
    if (!Array.isArray(scopes) || scopes.length === 0) throw taskDevelopmentError('task_development_scopes_missing', 'Content Target observation 需要至少一个 Environment scope。', 409);
    return scopes.map((scope) => observeContentScope(scope, { io: runtime.taskContentIo || fs, run: runtime.taskContentSpawn || spawnSync })).sort((left, right) => left.selector.localeCompare(right.selector));
  }

  Object.assign(runtime, { observeTaskContentComponents });
  return runtime;
}
