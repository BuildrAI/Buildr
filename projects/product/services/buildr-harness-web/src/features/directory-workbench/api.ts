import { api, type ApiError } from '../../api/index';
import type { FileEditingDocument } from '../../workbench/editor/file-editing-types';
import type {
  EditableFileSelector,
  EditableFileSnapshot,
  WorkbenchChange,
  WorkbenchFile,
} from '../../workbench/source-control/read-contracts';

export type DirectoryScope = { ref: { sourceId: string; id: string }; rootPath: string; revision: string; name?: string };
export type DirectoryCheckout = { id: string; location: string; name: string; branch: string | null; head: string | null; isMain: boolean };
type DirectoryCheckouts = { defaultId: string | null; members: DirectoryCheckout[]; truncated: boolean; diagnostic: string | null };
export type DirectoryRepository = { id: string; path: string; code?: string; name: string; checkouts: DirectoryCheckouts };
export type DirectoryRepositories = { repositories: DirectoryRepository[]; truncated: boolean; diagnostic: string | null };
export type DirectoryCatalogMember = {
  id: string;
  worktreeId: string;
  name: string;
  location: string;
  isMain: boolean;
  isRegistered: boolean;
  branch: string | null;
  head: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  files: WorkbenchChange[];
  fileCount: number | null;
  truncated: boolean;
  observedRevision: string | null;
  status: 'ready' | 'clean' | 'offline' | 'partial';
  diagnostics: string[];
  readAt: string;
};
export type DirectoryCatalogRepository = DirectoryRepository & { gitId: string | null; members: DirectoryCatalogMember[]; pending?: boolean; error?: string; readAt?: string; topologyRevision?: string | null };
export type DirectoryInventory = { repositories: Array<{path: string; code?: string; name: string}>; nextCursor: string | null; limited: boolean; registered?: boolean; diagnostic: string | null; readAt: string };
export type DirectoryCatalog = { nextCursor?: string | null; limited?: boolean; registered?: boolean; repositories: DirectoryCatalogRepository[]; topologyPaths?: string[]; topologyRevision?: string | null; truncated: boolean; diagnostic: string | null; readAt: string };
export type DirectorySelection = { repositoryId: string; checkoutId: string };
export type DirectoryRequest = <T>(operation: string, input?: object, signal?: AbortSignal) => Promise<T>;
export type DirectoryListing = { entries: Array<{ name: string; path: string; kind: 'directory' | 'file' | 'link'; ignored: boolean }>; truncated: boolean };
export type DirectorySearchResult = { matches: Array<{ path: string; line: number | null; excerpt: string; occurrences: Array<{ line: number; excerpt: string }> }>; truncated: boolean; diagnostics: Array<{ message: string }> };
export type WorktreeContext = { location: string; manager: string; revision: string; head: string | null; createReason: string | null; removeReason: string | null };

export type DirectoryFileBinding = { selector: EditableFileSelector; snapshot: EditableFileSnapshot };

export function directoryFileBinding(file: FileEditingDocument): DirectoryFileBinding | undefined {
  const binding = file.selector as DirectoryFileBinding | undefined;
  return binding?.snapshot ? binding : undefined;
}

export function directoryEditableDocument(workspaceId: string, snapshot: EditableFileSnapshot): FileEditingDocument {
  return {
    id: workspaceId + ':' + snapshot.fileId,
    path: snapshot.path,
    content: snapshot.content,
    kind: snapshot.kind === 'markdown' ? 'markdown' : 'text',
    location: snapshot.rootPath,
    revision: snapshot.revision,
    sourceRevision: snapshot.sourceRevision,
    sourceKey: JSON.stringify(snapshot.selector),
    selector: { selector: snapshot.selector, snapshot } satisfies DirectoryFileBinding,
    observedAt: snapshot.observedAt,
    imageContext: snapshot.imageContext,
    locationLabel: snapshot.locationLabel,
    versionLabel: snapshot.versionLabel,
    readOnlyReason: snapshot.editable ? undefined : snapshot.readonlyReason || '当前文件只支持阅读。',
    protectedRanges: snapshot.protectedRanges,
  };
}

export const post = async <T,>(route: string, input: object, signal?: AbortSignal): Promise<T> => {
  try {
    return await api(route, { method: 'POST', body: JSON.stringify(input), signal }) as T;
  } catch (error) {
    const failure = error as ApiError | undefined;
    if (failure?.code?.startsWith('agent_workbench_')) failure.code = failure.code.slice('agent_workbench_'.length);
    throw error;
  }
};

export const directoryClient = (scope: DirectoryScope, workspaceId: string, checkoutId?: string, repositoryPath?: string): DirectoryRequest =>
  (operation, input = {}, signal) => post('/api/v1/harness/directory-workbench/' + operation, { ...input, workspaceId, scopeRevision: scope.revision, checkoutId, repositoryPath }, signal);

export const observeWorkspaceDirectory = (workspaceId: string, signal: AbortSignal) =>
  post<DirectoryScope>('/api/v1/harness/directory-workbench/scope', { workspaceId }, signal);

export type { WorkbenchFile, EditableFileSnapshot };
