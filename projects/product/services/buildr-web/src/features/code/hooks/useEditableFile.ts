import { useEffect, useState } from 'react';
import type { ApiError } from '../../../api';
import type { FileEditingDocument, FileEditingOperations } from '../../../components/file-editing/file-editing-types';
import { codeApi, type EditableFileSelector, type EditableFileSnapshot } from '../api/code-api';

/** The complete read binding travels together; entry-specific source revisions must never be mixed. */
type FileBinding = { selector: EditableFileSelector; snapshot: EditableFileSnapshot };
export function fileSnapshot(file: FileEditingDocument): EditableFileSnapshot {
  return (file.selector as FileBinding).snapshot;
}

export function editableDocument(workspaceId: string, snapshot: EditableFileSnapshot): FileEditingDocument {
  return {
    id: workspaceId + ':' + snapshot.fileId,
    path: snapshot.path,
    content: snapshot.content,
    kind: snapshot.kind === 'markdown' ? 'markdown' : 'text',
    location: snapshot.rootPath,
    revision: snapshot.revision,
    sourceRevision: snapshot.sourceRevision,
    sourceKey: JSON.stringify(snapshot.selector),
    selector: { selector: snapshot.selector, snapshot } satisfies FileBinding,
    observedAt: snapshot.observedAt,
    imageContext: snapshot.imageContext,
    locationLabel: snapshot.selector.kind === 'project' ? '项目目录' : snapshot.locationLabel,
    versionLabel: snapshot.versionLabel,
    readOnlyReason: snapshot.editable ? undefined : snapshot.readonlyReason || '当前文件只支持阅读。',
    protectedRanges: snapshot.protectedRanges,
  };
}

export function fileEditingOperations(workspaceId: string): FileEditingOperations {
  return {
    read: async file => editableDocument(workspaceId, await codeApi.editorFile(workspaceId, fileSnapshot(file).selector)),
    save: async (file, content, expectedRevision) => {
      const snapshot = fileSnapshot(file);
      try {
        return editableDocument(workspaceId, await codeApi.saveFile(workspaceId, { selector: snapshot.selector, expectedFileId: snapshot.fileId, expectedSourceRevision: snapshot.sourceRevision, expectedRevision, content }));
      } catch (error) {
        const failure = error as ApiError;
        const current = (failure.details as { current?: EditableFileSnapshot } | undefined)?.current;
        if (failure.code === 'file_revision_conflict' && current) failure.details = { current: editableDocument(workspaceId, current) };
        throw error;
      }
    },
  };
}

/** Read only a precise current-file selector; stale replies from a previous selection are discarded. */
export function useEditableFile(workspaceId: string | null, selector: EditableFileSelector | null, refreshKey?: unknown) {
  const key = JSON.stringify([workspaceId, selector]);
  const [state, setState] = useState<{ key: string; file?: FileEditingDocument; error?: string }>({ key: '' });
  useEffect(() => {
    if (!workspaceId || !selector) return;
    const abort = new AbortController();
    setState(previous => previous.key === key ? previous : {key});
    void codeApi.editorFile(workspaceId, selector, abort.signal).then(snapshot => {
      if (!abort.signal.aborted) setState({ key, file: editableDocument(workspaceId, snapshot) });
    }).catch(error => {
      if (!abort.signal.aborted) setState({ key, error: error instanceof Error ? error.message : '无法打开文件。' });
    });
    return () => abort.abort();
  }, [key, refreshKey]);
  return state.key === key ? state : { key };
}
