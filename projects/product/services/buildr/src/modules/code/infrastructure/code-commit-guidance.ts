import fs from 'node:fs';
import path from 'node:path';
import { sameFilesystemPath, insideFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { codeFailure, codeGit, gitCommonDirectory } from './code-file-reader.ts';
import { codeRevision } from './source-control-git-reader.ts';
import type { CodeCommitSnapshot } from './code-commit-snapshot.ts';
import { codeWorktreeTaskKey, readSourceControlTaskAssociations, type WorktreeCatalogDependencies } from './code-worktree-catalog.ts';
import { enumerateCodeWorktrees } from './code-worktree-reader.ts';

type Source = { type?: string; root?: string; path: string };
type TaskContext = { taskId: string; title: string; intent?: string; scope: { projects: string[]; services: Array<{ project: string; service: string }> } };
export type CodeCommitGuidance = {
  scopes: Array<{ kind: 'workspace' | 'repository' | 'project' | 'service'; path: string }>;
  ruleEntrypoints: string[];
  readableRoots: string[];
  task: { taskId: string; title: string; intent: string } | null;
  revision: string;
};
export type CodeCommitGuidanceDependencies = WorktreeCatalogDependencies & {
  assetCatalog(root: string): { projects: Array<{ code: string; serviceIds: string[]; source?: Source }>; services: Array<{ id: string; code: string; repositoryId: string; modulePath?: string; legacyRefs?: string[] }> };
  resolveSourceRoot(root: string, source: Source): string;
  taskContext(root: string, id: string): TaskContext;
};

/** Discovers actual scopes, entry paths and versions for bounded material preparation. */
export function readCodeCommitGuidance(root: string, snapshot: CodeCommitSnapshot, dependencies: CodeCommitGuidanceDependencies): CodeCommitGuidance {
  const { source } = snapshot, common = gitCommonDirectory(source.location);
  let task: TaskContext | null = null;
  try {
    const member = enumerateCodeWorktrees(source.location, source.repositoryId).worktrees.find(item => item.worktreeId === source.worktreeId);
    if (member) {
      const associations = readSourceControlTaskAssociations(root, [{ id: source.repositoryId, location: source.location, worktrees: [{ ...member, available: true }] }], { ...dependencies, readTask: dependencies.taskContext });
      const id = associations.get(codeWorktreeTaskKey(source.repositoryId, member.worktreeId))?.taskId;
      if (id) { const record = dependencies.taskContext(root, id); if (record.taskId === id) task = record; }
    }
  } catch { /* Optional task evidence cannot prevent ordinary generation. */ }

  const selectedLocation = (directory: string) => {
    if (insideFilesystemPath(source.location, directory)) return path.resolve(directory);
    try {
      const gitRoot = codeGit(directory, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
      if (sameFilesystemPath(gitCommonDirectory(gitRoot), common)) return path.resolve(source.location, path.relative(fs.realpathSync(gitRoot), fs.realpathSync(directory)));
    } catch { /* Independent organization/project rules keep their own source. */ }
    return path.resolve(directory);
  };
  const directories = new Map<string, CodeCommitGuidance['scopes'][number]['kind']>();
  const addScope = (directory: string, kind: CodeCommitGuidance['scopes'][number]['kind']) => {
    const actual = selectedLocation(directory);
    if (!directories.has(actual)) directories.set(actual, kind);
  };
  addScope(root, 'workspace'); addScope(source.location, 'repository');
  if (task) {
    const beforeTaskScopes = new Map(directories);
    try {
      const catalog = dependencies.assetCatalog(root), refs = task.scope.services;
      const projectCodes = new Set([...task.scope.projects, ...refs.map(ref => ref.project)]);
      for (const project of catalog.projects.filter(item => projectCodes.has(item.code))) {
        if (project.source) addScope(dependencies.resolveSourceRoot(root, project.source), 'project');
        for (const service of catalog.services.filter(service => service.repositoryId === source.repositoryId && project.serviceIds.includes(service.id) && (!refs.length || refs.some(ref => ref.project === project.code && (ref.service === service.code || service.legacyRefs?.includes(ref.project + '/' + ref.service)))))) {
          addScope(path.join(root, 'services', service.code), 'service');
          if (service.modulePath) {
            const module = path.resolve(source.location, service.modulePath);
            if (!insideFilesystemPath(source.location, module)) throw Error('invalid task module');
            addScope(module, 'service');
          }
        }
      }
    } catch {
      task = null; directories.clear();
      for (const [directory, kind] of beforeTaskScopes) directories.set(directory, kind);
    }
  }
  const observed: unknown[] = [];
  const readableRoots = new Set([fs.realpathSync(source.location), common]);
  const ruleEntrypoints = new Set<string>();
  const scopes: CodeCommitGuidance['scopes'] = [];
  const observe = (entry: string, kind: 'file' | 'directory', directoryEntries = false) => {
    let stat: fs.BigIntStats | undefined;
    try { stat = fs.lstatSync(entry, { bigint: true, throwIfNoEntry: false }); }
    catch { throw codeFailure('code_commit_rules_unavailable', '规则入口当前无法核对；已有说明保留。', 409); }
    if (!stat) { observed.push({ path: entry, exists: false }); return null; }
    if (stat.isSymbolicLink() || (kind === 'file' ? !stat.isFile() : !stat.isDirectory())) throw codeFailure('code_commit_rules_unavailable', '规则入口身份或类型当前无法确认。', 409);
    const actual = fs.realpathSync(entry);
    observed.push({ path: entry, actual, kind, dev: String(stat.dev), ino: String(stat.ino), ...(kind === 'file' || directoryEntries ? { size: String(stat.size), mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs) } : {}) });
    return actual;
  };
  for (const [directory, kind] of directories) {
    // Entry existence is observed even when absent, so newly created rules make
    // the result stale. No file body, manifest branch, or recent log is read.
    const actual = observe(directory, 'directory');
    if (!actual) continue;
    scopes.push({ kind, path: actual });
    for (const name of ['AGENTS.override.md', 'AGENTS.md', 'rules/manifest.yml']) {
      const file = observe(path.join(actual, name), 'file');
      if (file) { ruleEntrypoints.add(file); readableRoots.add(file); }
    }
    const rules = observe(path.join(actual, 'rules'), 'directory', true);
    if (rules) readableRoots.add(rules);
  }
  const background = task ? { taskId: task.taskId, title: task.title, intent: task.intent || '' } : null;
  const roots = [...readableRoots].sort(), entries = [...ruleEntrypoints].sort();
  return { scopes, ruleEntrypoints: entries, readableRoots: roots, task: background, revision: codeRevision([observed, scopes, entries, roots, background]) };
}
