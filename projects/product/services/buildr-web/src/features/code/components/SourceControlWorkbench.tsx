import { SourceControlWorkbench as HarnessSourceControl, type SourceControlWorkbenchProps } from '../../../../../buildr-harness-web/src/source-control';
import { SourceControlDiffEditor } from './SourceControlDiffEditor';
import { renderEngineeringMarkdown } from '../../workspace/components/RepositoryFileBrowser';
import { codeApi } from '../api/code-api';
export type { SourceControlBranchExtension, SourceControlChange, SourceControlCommit, SourceControlRepository, SourceControlFileTarget, SourceControlScene, SourceControlState } from '../../../../../buildr-harness-web/src/source-control';

export function SourceControlWorkbench({ editableWorkspaceId, ...props }: Omit<SourceControlWorkbenchProps, 'fileEditing'|'renderMarkdown'> & {editableWorkspaceId?: string}) {
  return <HarnessSourceControl {...props} renderMarkdown={renderEngineeringMarkdown} fileEditing={editableWorkspaceId ? {
    renderDiff: (diff,reader,mode) => <SourceControlDiffEditor workspaceId={editableWorkspaceId} diff={diff} reader={reader} mode={mode} />,
    openFolder: target => codeApi.openFolder(editableWorkspaceId,{selector:{kind:'code',repositoryId:target.repositoryId,checkoutId:target.worktreeId!,path:target.path}}),
  } : undefined} />;
}
