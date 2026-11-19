import type { CodeCatalog } from './api/code-api';
import type { ExplorerCodeFile } from './code-file-read';
import type { CodeTaskEntry } from './code-navigation';

type Target = { repositoryId: string; checkoutId: string; path: string; line?: number };
type Observation = { id: string; workspaceId: string; target: Target; catalog: CodeCatalog; file: ExplorerCodeFile; expires: number };
// One transient navigation payload. Browser history stores only the token, never the file.
let pending: Observation | undefined;
export function offerCodeOpen(workspaceId: string, target: Target, catalog: CodeCatalog, file: ExplorerCodeFile): string {
  const id = crypto.randomUUID();
  pending = { id, workspaceId, target, catalog, file, expires: Date.now() + 15_000 };
  window.setTimeout(() => { if (pending?.id === id) pending = undefined; }, 15_000);
  return id;
}
export function takeCodeOpen(workspaceId: string, entry: CodeTaskEntry): Observation | undefined {
  const value = pending, target = entry.file;
  if (!value || value.id !== entry.observationId) return;
  pending = undefined;
  if (Date.now() > value.expires || workspaceId !== value.workspaceId || !target || target.commitHash || target.line !== value.target.line ||
      target.repositoryId !== value.target.repositoryId || target.checkoutId !== value.target.checkoutId || target.path !== value.target.path) return;
  return value;
}
