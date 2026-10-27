import { workspaceApi } from '../api/workspace-api';
import { workspacePreparationApi } from '../api/workspace-preparation-api';
import type { WorkspacePreparation } from '../api/workspace-preparation-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceEntry } from '../components/WorkspacesCatalogView';

type WorkspaceRegistry = Awaited<ReturnType<typeof workspaceApi.listRegistered>>;

type Options = {
  stayOnCatalog: boolean;
  onOpenWorkspace: (workspaceId: string, replace: boolean) => void;
  onRecoveryPrompt: (prompt: string) => void;
  onPreparationStart: (value: WorkspacePreparation) => void;
  workspaceRegistryRevision: number;
  onRegistryChanged: () => void;
};

export function useWorkspaceCatalog({ stayOnCatalog, onOpenWorkspace, onRecoveryPrompt, onPreparationStart, workspaceRegistryRevision, onRegistryChanged }: Options) {
  const [registry, setRegistry] = useState<WorkspaceRegistry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState('');
  const mutation = useRef(false), readGeneration = useRef(0);
  const automaticOpenBlocked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++readGeneration.current; }; }, []);

  const load = useCallback(async () => {
    const generation = ++readGeneration.current;
    const next = await workspaceApi.listRegistered();
    if (mounted.current && readGeneration.current === generation) setRegistry(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    const generation = readGeneration.current + 1;
    void load()
      .then((next) => {
        if (!active || !mounted.current || readGeneration.current !== generation || stayOnCatalog || mutation.current || automaticOpenBlocked.current) return;
        const ready = (next.workspaces || []).filter((entry) => entry.status === 'ready' && entry.workspace?.id);
        // Auto-open may start a preparation that settles as failed; each settle
        // bumps workspaceRegistryRevision and re-runs this effect. Consume the
        // attempt so only the first registry observation can auto-open.
        if (ready.length === 1 && ready[0].workspace?.id) { automaticOpenBlocked.current = true; void workspacePreparationApi.open(ready[0].workspace.id).then(result=>{if(!active)return;if('ready' in result)onOpenWorkspace(result.workspaceId,true);else onPreparationStart(result);}).catch(error=>{if(active)setFailure(error.message);}); }
      })
      .catch((error: Error) => { if (active && mounted.current && readGeneration.current === generation) setFailure(error.message); });
    return () => { active = false; };
  }, [load, onOpenWorkspace, onPreparationStart, stayOnCatalog, workspaceRegistryRevision]);

  const remove = useCallback(async (entry: WorkspaceEntry, observed: WorkspaceRegistry) => {
    if (mutation.current) return;
    // Removing a card is an explicit decision to stay in the catalog. Registry
    // refreshes must not reuse the initial single-workspace auto-open behavior.
    automaticOpenBlocked.current = true;
    mutation.current = true; setRemoving(entry.rootPath); setFailure(''); setMessage(null);
    try {
      const next = await workspaceApi.remove({ revision: observed.revision, rootPath: entry.rootPath });
      if (!mounted.current) return;
      ++readGeneration.current; setRegistry(next); onRegistryChanged();
      setMessage('已从 Buildr Web 移除，目录内容保留。');
    } catch (error) {
      if (!mounted.current) return;
      const reason = error instanceof Error ? error.message : '登记暂时不可修改。';
      setFailure((error as { code?: string }).code === 'workspace_registry_revision_conflict'
        ? `${reason} 本次未移除。请重新读取后核对，再决定是否移除。`
        : `${reason} 请重新读取登记后核对结果。`);
    } finally {
      mutation.current = false;
      if (mounted.current) setRemoving(null);
    }
  }, [onRegistryChanged]);

  const pick = useCallback(async () => {
    if (!registry || mutation.current) return;
    mutation.current = true; setAdding(true); setFailure('');
    try {
      const result = await workspaceApi.pick({ revision: registry.revision });
      if (!mounted.current) return;
      if (!result.canceled && result.status === 'canonical' && result.registry) {
        setRegistry(result.registry);
        await load();
        if (mounted.current && result.registry.lastOpenedWorkspaceId) onOpenWorkspace(result.registry.lastOpenedWorkspaceId, false);
      } else if (!result.canceled) {
        setMessage(result.message || '该目录暂时不能登记。');
        if (result.prompt) onRecoveryPrompt(result.prompt);
      }
    } catch (error) {
      if (mounted.current) setFailure(error instanceof Error ? error.message : '添加工作空间失败。');
    } finally {
      mutation.current = false;
      if (mounted.current) setAdding(false);
    }
  }, [load, onOpenWorkspace, onRecoveryPrompt, registry]);

  const refresh = async () => {
    if (mutation.current) return;
    mutation.current = true; setRefreshing(true);
    try { await load(); if (mounted.current) { setFailure(''); setMessage(null); } }
    catch (error) { if (mounted.current) setFailure(error instanceof Error ? error.message : '登记读取失败，请重试。'); }
    finally { mutation.current = false; if (mounted.current) setRefreshing(false); }
  };
  return { registry, message, adding, removing, refreshing, failure, setFailure, refresh, remove, pick, readRegistry: load };
}
