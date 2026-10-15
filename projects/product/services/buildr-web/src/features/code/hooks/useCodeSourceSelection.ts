import { useContext, useSyncExternalStore } from 'react';
import { WorkspaceSourceControlContext } from '../../../app/WorkspaceSourceControlProvider';
import type { CodeSourceSelectionStore } from '../code-source-selection';
const empty = () => null;
const noSubscribe = () => () => {};
const noSelect: CodeSourceSelectionStore['select'] = () => {};

export function useCodeSourceSelection(workspaceId?: string | null) {
  const shared = useContext(WorkspaceSourceControlContext);
  const store = shared && shared.workspaceId === workspaceId ? shared.sourceSelection : null;
  const selection = useSyncExternalStore(store?.subscribe || noSubscribe, store?.snapshot || empty);
  return {selection, select:store?.select || noSelect, getSelection:store?.snapshot || empty};
}
