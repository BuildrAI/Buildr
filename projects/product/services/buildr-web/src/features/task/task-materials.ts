import { resolveProjectMarkdownHref, normalizedWorkspaceRelativePath } from '../../lib/workspaceMarkdownReferences.ts';

import type { TaskMaterialsResponse, TaskMaterialDocument } from '../../../build/generated/task-dto';
export type { TaskMaterialDocument } from '../../../build/generated/task-dto';
export type TaskMaterialsResult = TaskMaterialsResponse;
export type TaskMaterialsState = { taskId: string; data: TaskMaterialsResult | null; loading: boolean; error: string | null };

/** A fresh read supersedes earlier reads, even if an adapter ignores cancellation. */
export function createTaskMaterialsLoader(taskId: string, read: (signal: AbortSignal) => Promise<TaskMaterialsResult>, publish: (state: TaskMaterialsState) => void) {
  let controller: AbortController | null = null;
  let sequence = 0;
  let disposed = false;
  return {
    async refresh() {
      if (disposed) return;
      const request = ++sequence;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      publish({ taskId, data: null, loading: true, error: null });
      try {
        const data = await read(current.signal);
        if (data.taskId !== taskId) throw new Error('材料响应与当前任务身份不一致。');
        if (!disposed && sequence === request && !current.signal.aborted) publish({ taskId, data, loading: false, error: null });
      } catch (cause) {
        if (!disposed && sequence === request && !current.signal.aborted) publish({ taskId, data: null, loading: false, error: cause instanceof Error ? cause.message : '任务材料读取失败。' });
      }
    },
    dispose() { disposed = true; sequence += 1; controller?.abort(); },
  };
}

/** Project links stay in the source project; local links only select associated same-task material. */
export function resolveTaskMaterialLink(document: TaskMaterialDocument, href: string, documents: TaskMaterialDocument[]): { kind: 'material'; id: string } | { kind: 'project'; project: string; path: string } | null {
  const raw = String(href || '').trim();
  if (!raw || raw.includes('\\') || raw.includes('\0') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(raw.split(/[?#]/)[0]); } catch { return null; }
  if (!decoded || decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
  if (document.source.kind === 'task' && raw.startsWith('@')) return null;
  if (!raw.startsWith('@project/')) {
    const segments = document.source.path.split('/').slice(0, -1);
    for (const segment of decoded.split('/')) {
      if (segment === '..') { if (!segments.length) return null; segments.pop(); }
      else if (segment && segment !== '.') segments.push(segment);
    }
  }
  const path = resolveProjectMarkdownHref(document.source.path, raw);
  if (!path || !normalizedWorkspaceRelativePath(path)) return null;
  const source = document.source;
  const associated = documents.find(item => item.source.kind === source.kind && item.source.path === path && (item.source.kind !== 'project' || (source.kind === 'project' && item.source.project === source.project)));
  if (associated) return { kind: 'material', id: associated.id };
  return source.kind === 'project' ? { kind: 'project', project: source.project, path } : null;
}

export function taskMaterialSourceLabel(document: TaskMaterialDocument): string {
  return document.source.kind === 'task' ? `任务本机材料 · ${document.source.path}` : `${document.source.project} · ${document.source.path}`;
}
