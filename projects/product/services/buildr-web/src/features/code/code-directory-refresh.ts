import type { CodeDirectory, CodeSourceControlResponse } from './api/code-api';

type Worktree = CodeSourceControlResponse['repositories'][number]['worktrees'][number];
type Entry = {path: string; previousPath: string | null; status: string};
export type CodeDirectoryObservation = {identity: string; branch: string | null; head: string | null; revision: string | null; entries: Entry[]; uncertain: boolean};
type Directory = {path: string; entries: Array<{path: string}>};
const entryKey = (entry: Entry) => JSON.stringify([entry.path, entry.previousPath, entry.status]);

/** Directory listings change with paths, not each write to an already listed file. */
export function planCodeDirectoryRefresh(previous: CodeDirectoryObservation | undefined, identity: string, worktree: Worktree | undefined, loaded: Directory[]) {
  const paths = new Set(loaded.map(directory => directory.path));
  const known = previous || {identity, branch:worktree?.branch || null, head:worktree?.head || null, revision:worktree?.observedRevision || null, entries:[], uncertain:true};
  if (!worktree || !worktree.available || worktree.status === 'unavailable') return {observation:{...known, uncertain:true}, paths:[] as string[], readFile:false};
  if (worktree.status === 'partial' || worktree.coverage.truncated) return {observation:{...known, uncertain:true}, paths:[...paths], readFile:true};
  const entries = [...new Map(worktree.changes.map(file => {
    const entry = {path:file.path, previousPath:file.previousPath || null, status:file.status};
    return [entryKey(entry), entry] as const;
  })).values()];
  const observation: CodeDirectoryObservation = {identity, branch:worktree.branch, head:worktree.head, revision:worktree.observedRevision, entries, uncertain:false};
  if (previous && (previous.uncertain || previous.identity !== identity || previous.branch !== worktree.branch || previous.head !== worktree.head)) return {observation, paths:[...paths], readFile:true};
  const changed = new Set<string>();
  if (previous) {
    const before = new Map(previous.entries.map(entry => [entryKey(entry), entry])), after = new Map(entries.map(entry => [entryKey(entry), entry]));
    for (const [key, entry] of [...before, ...after]) if (entry.status !== 'modified' && (!before.has(key) || !after.has(key))) {
      changed.add(entry.path); if (entry.previousPath) changed.add(entry.previousPath);
    }
  } else {
    // The first status read may arrive after an older directory snapshot. Only repair an
    // observed mismatch, avoiding a second startup request for every already fresh root.
    const contains = (path: string) => {
      const parts = path.split('/');
      for (let depth = parts.length - 1; depth >= 0; depth--) {
        const directory = loaded.find(item => item.path === parts.slice(0,depth).join('/'));
        if (!directory) continue;
        const exists = directory.entries.some(entry => entry.path === parts.slice(0,depth+1).join('/'));
        // A missing ancestor entry proves this listing predates the observed new file.
        // An existing ancestor says nothing about a deeper, still unloaded directory.
        return depth === parts.length - 1 || !exists ? exists : undefined;
      }
      return undefined;
    };
    for (const entry of entries) {
      const exists = contains(entry.path);
      if (entry.status === 'deleted' ? exists !== false : ['added','untracked','renamed'].includes(entry.status) && exists === false) changed.add(entry.path);
      if (entry.status === 'renamed' && entry.previousPath && contains(entry.previousPath) !== false) changed.add(entry.previousPath);
    }
  }
  const refresh = new Set<string>();
  for (const path of changed) {
    const parts = path.split('/');
    for (let depth = 0; depth < parts.length; depth++) {
      const directory = parts.slice(0,depth).join('/');
      if (paths.has(directory)) refresh.add(directory);
    }
  }
  // A first status snapshot can arrive after an already read body. The caller checks only
  // its cached active file, closing that startup gap without reading unopened files.
  return {observation, paths:[...refresh], readFile:!previous || previous.revision !== worktree.observedRevision};
}

/** A complete parent listing is authority only for its immediate child directories. */
export function removedCodeDirectoryPaths(directory: Pick<CodeDirectory, 'path' | 'entries' | 'truncated'>, knownPaths: string[]) {
  if (directory.truncated) return [];
  const prefix = directory.path ? directory.path + '/' : '';
  const children = new Set(directory.entries.filter(entry => entry.kind === 'directory').map(entry => entry.path));
  return knownPaths.filter(path => path.startsWith(prefix) && path !== directory.path && !children.has(prefix + path.slice(prefix.length).split('/')[0]));
}
