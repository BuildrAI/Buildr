import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import crypto from 'node:crypto';
import { WorkspaceSourceConflictError } from '../../../infrastructure/filesystem/workspace-mutation.ts';

// Retired documents are never resolved as capability configuration.
export function observeRetiredProjectCapabilities(projectRoot: string) {
  const file = path.join(projectRoot, 'capabilities.yml');
  let detail = '文件已退役，不再参与技能发现、能力依赖或提供者选择。';
  let status: 'info' | 'warning' = 'info';
  let identity: string | null = null;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
      throw new Error('旧配置不是可安全读取的普通文件，或超过 1 MiB。');
    }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let content: string;
    try { content = fs.readFileSync(fd, 'utf8'); } finally { fs.closeSync(fd); }
    const after = fs.lstatSync(file);
    if (after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size
      || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || Buffer.byteLength(content, 'utf8') > 1024 * 1024) {
      throw new Error('读取期间旧配置发生变化。');
    }
    const document = YAML.parse(content);
    if (!document || typeof document !== 'object' || Array.isArray(document)
      || document.schemaVersion !== 'buildr.project-capabilities/v1'
      || Object.keys(document).some((key) => !['schemaVersion', 'requires', 'bindings', 'skills'].includes(key))
      || ['requires', 'bindings', 'skills'].some((key) => document[key] !== undefined && !Array.isArray(document[key]))) {
      throw new Error('旧配置格式无法安全识别。');
    }
    if ((document.skills || []).some((skill: any) => {
      const id = typeof skill === 'string' ? skill : skill?.id;
      return typeof id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(id)
        || (typeof skill !== 'string' && Object.keys(skill).some((key) => key !== 'id'));
    })) throw new Error('旧技能名单含未知内容。');
    if (document.requires?.length || document.bindings?.length) {
      status = 'warning';
      detail += '旧 requires 或 bindings 非空，原项目需求与绑定已失效；请核对工作空间当前选择及项目依赖，不要直接将局部配置扩大到整个工作空间。';
    } else {
      identity = crypto.createHash('sha256').update(JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, content])).digest('hex');
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    status = 'warning';
    detail += `无法核对旧配置：${error.message}`;
  }
  return {
    status,
    identity,
    code: 'projects.capabilities_retired',
    message: detail,
    file,
    suggestion: status === 'warning'
      ? '保留原文件并核对失效配置；如需工作空间绑定，应先确认其对所有项目的影响。此文件不会被自动迁移或删除。'
      : '下次工作空间同步会安全自动清理此文件，无需手动维护。技能适用场景由技能说明和项目规则表达。',
  };
}

export type ProjectCapabilityCleanup = { path: string; identity: string };

function safeProjectRoot(root: string, projectRoot: string): boolean {
  const relative = path.relative(path.resolve(root), projectRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  let current = path.resolve(root);
  try {
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    }
    return true;
  } catch { return false; }
}

export function planProjectCapabilityCleanup(root: string, projects: Record<string, any>): ProjectCapabilityCleanup[] {
  const candidates: ProjectCapabilityCleanup[] = [];
  for (const project of Object.values(projects)) {
    if (project.source?.root === 'attached' || typeof project.source?.path !== 'string') continue;
    const projectRoot = path.resolve(root, project.source.path);
    if (!safeProjectRoot(root, projectRoot)) continue;
    const observed = observeRetiredProjectCapabilities(projectRoot);
    if (observed?.identity) candidates.push({ path: path.relative(root, observed.file).split(path.sep).join('/'), identity: observed.identity });
  }
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

export function cleanupProjectCapabilities(root: string, candidates: ProjectCapabilityCleanup[]): string[] {
  // Preflight the complete set before deleting anything. The sync transaction
  // snapshots these exact files and owns rollback if a later operation fails.
  for (const candidate of candidates) {
    const file = path.resolve(root, candidate.path);
    if (path.basename(file) !== 'capabilities.yml' || !safeProjectRoot(root, path.dirname(file))
      || observeRetiredProjectCapabilities(path.dirname(file))?.identity !== candidate.identity) {
      throw new WorkspaceSourceConflictError(`Retired Project capability configuration changed before cleanup: ${candidate.path}`);
    }
  }
  const changed: string[] = [];
  for (const candidate of candidates) {
    const file = path.resolve(root, candidate.path);
    if (!safeProjectRoot(root, path.dirname(file)) || observeRetiredProjectCapabilities(path.dirname(file))?.identity !== candidate.identity) {
      throw new WorkspaceSourceConflictError(`Retired Project capability configuration changed before cleanup: ${candidate.path}`);
    }
    fs.unlinkSync(file);
    changed.push(candidate.path);
  }
  return changed;
}
