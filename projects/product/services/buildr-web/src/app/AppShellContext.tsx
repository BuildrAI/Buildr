import { createContext, useContext } from 'react';

export type WorkspaceShellInfo = {
  name: string;
  rootPath: string;
};

export type AgentActionContext = Record<string, unknown>;

export type AppShellContextValue = {
  workspaceId: string | null;
  workspace: WorkspaceShellInfo | null;
  setWorkspace: (data: { workspace: { name: string }; rootPath: string }) => void;
  openAgentAction: (action?: string, context?: AgentActionContext) => void;
  breadcrumbParts: string[];
  setBreadcrumbParts: (parts: string[]) => void;
  /** 侧栏进入任务列表时递增，强制重建列表实例以重置筛选。 */
  taskListResetToken: number;
  resetTaskList: () => void;
};

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const value = useContext(AppShellContext);
  if (!value) throw new Error('AppShellContext 未提供。');
  return value;
}
