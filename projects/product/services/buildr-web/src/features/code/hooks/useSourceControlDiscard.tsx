import { useSourceControlDiscard as useHarnessSourceControlDiscard } from '../../../../../buildr-harness-web/src/source-control';
import { codeActionsApi } from '../api/code-actions-api';

export function useSourceControlDiscard(workspaceId: string, refresh: (repositoryId?: string) => void | Promise<void>, active = true) {
  return useHarnessSourceControlDiscard(workspaceId, codeActionsApi, refresh, active);
}
