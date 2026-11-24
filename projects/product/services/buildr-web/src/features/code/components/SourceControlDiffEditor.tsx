import { useCallback } from 'react';
import {
  SourceControlDiffEditor as HarnessSourceControlDiffEditor,
} from '../../../../../buildr-harness-web/src/source-control';
import type { SourceControlReader } from '../source-control-model';
import { useFileEditingContext } from '../../../app/FileEditingContext';
import { codeApi, type CodeDiffResponse } from '../api/code-api';
import { editableDocument } from '../hooks/useEditableFile';

type Props = {
  workspaceId: string;
  diff: CodeDiffResponse;
  reader: SourceControlReader;
  mode: 'split' | 'unified';
};

/** Only the live SCM entry connects full, verified contents to the shared file editor. */
export function SourceControlDiffEditor({ workspaceId, diff, reader, mode }: Props) {
  const editing = useFileEditingContext();
  const readEditableFile = useCallback(async (source: CodeDiffResponse['source'], path: string, signal: AbortSignal) => {
    const snapshot = await codeApi.editorFile(workspaceId, {
      kind: 'code',
      repositoryId: source.repositoryId,
      checkoutId: source.checkoutId!,
      path,
    }, signal);
    return editableDocument(workspaceId, snapshot);
  }, [workspaceId]);

  return <HarnessSourceControlDiffEditor workspaceId={workspaceId} diff={diff} reader={reader} mode={mode} editing={editing} readEditableFile={readEditableFile} />;
}
