import { createContext, useContext } from 'react';
import type { WorkspacePageTab } from './workspace-pages';
export type { WorkspacePageTab, PageTabKind } from './workspace-pages';
export { PageTabStrip } from './PageTabStrip';
export type WorkspaceTabsState = {
  tabs: WorkspacePageTab[];
  register: (tab: WorkspacePageTab) => void;
  close: (key: string) => void;
  reorder: (key: string, index: number) => void;
  reportPaneWidth: (path: string, width: number) => void;
  ratio: number | null;
  setRatio: (ratio: number) => void;
};
export const WorkspaceTabsContext = createContext<WorkspaceTabsState | null>(null);
export function useWorkspacePageTabs(_workspaceId?: string | null): WorkspaceTabsState {
  const state = useContext(WorkspaceTabsContext);
  if (!state) throw new Error('Workspace page tabs require the workspace page host');
  return state;
}
