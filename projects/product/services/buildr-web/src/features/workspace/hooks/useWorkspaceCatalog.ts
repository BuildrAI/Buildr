import { useCallback, useEffect, useState } from 'react';

import { workspaceApi } from '../../../api';

export type WorkspaceEntry = (Awaited<ReturnType<typeof workspaceApi.listRegistered>>['workspaces'])[number];
export type WorkspaceRegistry = Awaited<ReturnType<typeof workspaceApi.listRegistered>>;

type Options = {
  stayOnCatalog: boolean;
  onOpenWorkspace: (workspaceId: string, replace: boolean) => void;
  onRecoveryPrompt: (prompt: string) => void;
};

export function useWorkspaceCatalog({ stayOnCatalog, onOpenWorkspace, onRecoveryPrompt }: Options) {
  const [registry, setRegistry] = useState<WorkspaceRegistry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const next = await workspaceApi.listRegistered();
    setRegistry(next);
    return next;
  }, []);

  useEffect(() => {
    void load()
      .then((next) => {
        if (stayOnCatalog) return;
        const ready = (next.workspaces || []).filter((entry) => entry.status === 'ready' && entry.workspace?.id);
        if (ready.length === 1 && ready[0].workspace?.id) onOpenWorkspace(ready[0].workspace.id, true);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [load, onOpenWorkspace, stayOnCatalog]);

  const remove = useCallback(async (entry: WorkspaceEntry) => {
    if (!registry) return;
    await workspaceApi.remove({ revision: registry.revision, rootPath: entry.rootPath });
    await load();
  }, [load, registry]);

  const pick = useCallback(async () => {
    if (!registry) return;
    setAdding(true);
    try {
      const result = await workspaceApi.pick({ revision: registry.revision });
      if (!result.canceled && result.status === 'canonical' && result.registry) {
        setRegistry(result.registry);
        await load();
        if (result.registry.lastOpenedWorkspaceId) onOpenWorkspace(result.registry.lastOpenedWorkspaceId, false);
      } else if (!result.canceled) {
        setMessage(result.message || '该目录暂时不能登记。');
        if (result.prompt) onRecoveryPrompt(result.prompt);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '添加工作空间失败。');
    } finally {
      setAdding(false);
    }
  }, [load, onOpenWorkspace, onRecoveryPrompt, registry]);

  return { registry, message, setMessage, adding, remove, pick };
}
