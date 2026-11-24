import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, gitCommonDirectory } from './code-file-reader.ts';
import { codeRevision } from './source-control-git-reader.ts';
import type { CodeCommitSnapshot } from './code-commit-snapshot.ts';

export type CodeCommitGuidance = {
  scopes: Array<{ kind: 'workspace' | 'repository' | 'project' | 'service'; path: string }>;
  ruleEntrypoints: string[];
  readableRoots: string[];
  task: { taskId: string; title: string; intent: string } | null;
  revision: string;
};

/** Discovers generic workspace and repository rule entrypoints for standalone Harness directories. */
export function readDirectoryCommitGuidance(root: string, snapshot: CodeCommitSnapshot): CodeCommitGuidance {
  const { source } = snapshot;
  const common = gitCommonDirectory(source.location);
  const directories = new Map<string, CodeCommitGuidance['scopes'][number]['kind']>();
  for (const [candidate, kind] of [[root, 'workspace'], [source.location, 'repository']] as const) {
    const resolved = path.resolve(candidate);
    if (!directories.has(resolved)) directories.set(resolved, kind);
  }
  const observed: unknown[] = [];
  const readableRoots = new Set([fs.realpathSync(source.location), common]);
  const ruleEntrypoints = new Set<string>();
  const scopes: CodeCommitGuidance['scopes'] = [];
  const seenScopePaths = new Set<string>();
  const observe = (entry: string, kind: 'file' | 'directory') => {
    let stat: fs.BigIntStats | undefined;
    try { stat = fs.lstatSync(entry, { bigint: true, throwIfNoEntry: false }); }
    catch { throw codeFailure('code_commit_rules_unavailable', '规则入口当前无法核对；已有说明保留。', 409); }
    if (!stat) { observed.push({ path: entry, exists: false }); return null; }
    if (stat.isSymbolicLink() || (kind === 'file' ? !stat.isFile() : !stat.isDirectory())) {
      throw codeFailure('code_commit_rules_unavailable', '规则入口身份或类型当前无法确认。', 409);
    }
    const actual = fs.realpathSync(entry);
    observed.push({ path: entry, actual, kind, dev: String(stat.dev), ino: String(stat.ino), ...(kind === 'file' ? { size: String(stat.size), mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs) } : {}) });
    return actual;
  };
  for (const [directory, kind] of directories) {
    const actual = observe(directory, 'directory');
    if (!actual || seenScopePaths.has(actual)) continue;
    seenScopePaths.add(actual);
    scopes.push({ kind, path: actual });
    for (const name of ['AGENTS.override.md', 'AGENTS.md']) {
      const file = observe(path.join(actual, name), 'file');
      if (file) { ruleEntrypoints.add(file); readableRoots.add(file); }
    }
  }
  const roots = [...readableRoots].sort();
  const entries = [...ruleEntrypoints].sort();
  return { scopes, ruleEntrypoints: entries, readableRoots: roots, task: null, revision: codeRevision([observed, scopes, entries, roots, null]) };
}
