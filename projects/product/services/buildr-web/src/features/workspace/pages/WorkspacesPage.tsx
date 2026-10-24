import { workspacePreparationApi } from '../api/workspace-preparation-api';
import { AddWorkspaceDialog } from '../components/AddWorkspaceDialog';
import type { WorkspacePreparation } from '../api/workspace-preparation-api';
import { workspaceApi } from '../api/workspace-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Space, Tag } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { confirmModal } from '../../../lib/confirm';
import { workspaceHomePath } from '../../../lib/labels';
import { WorkspacesCatalogView, type WorkspaceEntry } from '../components/WorkspacesCatalogView';


type WorkspaceRegistry = Awaited<ReturnType<typeof workspaceApi.listRegistered>>;

type Options = {
  stayOnCatalog: boolean;
  onOpenWorkspace: (workspaceId: string, replace: boolean) => void;
  onRecoveryPrompt: (prompt: string) => void;
  onPreparationStart: (value:WorkspacePreparation) => void;
  workspaceRegistryRevision: number;
  onRegistryChanged: () => void;
};

function useWorkspaceCatalog({ stayOnCatalog, onOpenWorkspace, onRecoveryPrompt, onPreparationStart, workspaceRegistryRevision, onRegistryChanged }: Options) {
  const [registry, setRegistry] = useState<WorkspaceRegistry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState('');
  const mutation = useRef(false), readGeneration = useRef(0);
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
        if (!active || !mounted.current || readGeneration.current !== generation || stayOnCatalog || mutation.current) return;
        const ready = (next.workspaces || []).filter((entry) => entry.status === 'ready' && entry.workspace?.id);
        if (ready.length === 1 && ready[0].workspace?.id) void workspacePreparationApi.open(ready[0].workspace.id).then(result=>{if(!active)return;if('ready' in result)onOpenWorkspace(result.workspaceId,true);else onPreparationStart(result);}).catch(error=>{if(active)setFailure(error.message);});
      })
      .catch((error: Error) => { if (active && mounted.current && readGeneration.current === generation) setFailure(error.message); });
    return () => { active = false; };
  }, [load, onOpenWorkspace, onPreparationStart, stayOnCatalog, workspaceRegistryRevision]);

  const remove = useCallback(async (entry: WorkspaceEntry, observed: WorkspaceRegistry) => {
    if (mutation.current) return;
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

export function WorkspacesPage() {
  const { message: notifications } = App.useApp();
  const confirming = useRef(false);
  const [incoming,setIncoming]=useState<WorkspacePreparation|null>(null),[opening,setOpening]=useState<string|null>(null);
  const [addOpen,setAddOpen]=useState(false),[preparation,setPreparation]=useState<WorkspacePreparation|null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnCatalog = searchParams.get('catalog') === '1';
  const { openAgentAction, setBreadcrumbParts, openWorkspaceSettings, workspaceRegistryRevision, refreshWorkspaceRegistry } = useAppShell();
  const onOpenWorkspace = useCallback((workspaceId: string, replace: boolean) => {
    navigate(workspaceHomePath(workspaceId), { replace });
  }, [navigate]);
  const onRecoveryPrompt = useCallback((prompt: string) => {
    openAgentAction('workspace-recovery', { prompt });
  }, [openAgentAction]);
  const onPreparationStart=useCallback((value:WorkspacePreparation)=>{setPreparation(null);setIncoming(value);setOpening(value.workspaceId);setAddOpen(true);},[]);
  const { registry, message, adding, removing, refreshing, failure, setFailure, refresh, remove, readRegistry } = useWorkspaceCatalog({
    stayOnCatalog,
    onOpenWorkspace,
    onRecoveryPrompt,
    onPreparationStart,
    workspaceRegistryRevision,
    onRegistryChanged: refreshWorkspaceRegistry,
  });

  useEffect(() => {
    setBreadcrumbParts(['工作空间']);
  }, [setBreadcrumbParts]);

  const removeWorkspace = async (entry: WorkspaceEntry) => {
    if (confirming.current || adding || removing || refreshing) return;
    confirming.current = true;
    try {
      const observed = await readRegistry();
      const current = observed.workspaces.find(candidate => candidate.rootPath === entry.rootPath);
      if (!current || current.workspace?.id !== entry.workspace?.id) {
        setFailure('工作空间登记已变化，列表已更新。请核对后再决定是否移除。');
        return;
      }
      const ok = await confirmModal({
        title: '移除工作空间', icon: null, centered: true, width: 400, className: 'workspace-remove-dialog',
        content: <><div>将「<strong>{current.workspace?.name || current.rootPath}</strong>」从列表移除。</div><div>目录和其中的内容会保留，之后可以重新添加。</div></>,
        okText: '移除',
        okButtonProps: { danger: true },
      });
      if (!ok) return;
      await remove(current, observed);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '移除尚未执行，请重试。');
    } finally { confirming.current = false; }
  };

  const pickWorkspace = () => {setIncoming(null);setOpening(null);setAddOpen(true);};
  const openPreparedWorkspace = async (entry: WorkspaceEntry) => {
    if (!entry.workspace?.id || opening) return;
    setIncoming(null);setPreparation(null);setOpening(entry.workspace.id);setFailure('');
    try { const next = await workspacePreparationApi.open(entry.workspace.id); if ('ready' in next) {onOpenWorkspace(next.workspaceId,false);setOpening(null);} else {setIncoming(next);setAddOpen(true);} }
    catch(error) {setOpening(null);setFailure(error instanceof Error?error.message:'工作空间暂时无法打开。');}
  };
  useEffect(()=>{if(opening&&preparation?.status==='ready'&&preparation.workspaceId===opening){setOpening(null);setAddOpen(false);onOpenWorkspace(opening,false);}},[opening,preparation,onOpenWorkspace]);

  return <><AddWorkspaceDialog incoming={incoming} open={addOpen} onClose={()=>{setIncoming(null);setAddOpen(false);}} onSettled={value=>{refreshWorkspaceRegistry();void refresh();if(value.status==='ready')void notifications.success(`已添加「${value.name}」`);}} onProgress={setPreparation}/><WorkspacesCatalogView
    entries={registry?.workspaces ?? null}
    emptyEyebrow={null}
    emptyDescription="选择本机目录，Buildr 会自动准备工作内容和智能体入口。已有文件会保留，准备完成后即可开始工作。"
    message={message}
    error={failure}
    adding={adding}
    removing={removing}
    refreshing={refreshing}
    onOpen={entry=>void openPreparedWorkspace(entry)}
    onRemove={entry => void removeWorkspace(entry)}
    renderStatus={entry=>{const status=preparation?.rootPath===entry.rootPath?preparation.status:null;const readiness=(entry as WorkspaceEntry & {readiness?:string}).readiness;return <Tag color={status==='preparing'?'processing':status==='failed'||readiness&&readiness!=='ready'?'warning':entry.status==='ready'?'success':'warning'}>{status==='preparing'?'准备中':status==='failed'?'待完成':readiness&&readiness!=='ready'?'待准备':entry.status==='ready'?'可用':'暂不可用'}</Tag>;}}
    onSettings={openWorkspaceSettings}
    renderExtra={entry=>preparation?.rootPath===entry.rootPath&&preparation.status!=='ready'?<Button onClick={()=>setAddOpen(true)}>{preparation.status==='preparing'?'正在准备，查看进度':'继续准备'}</Button>:null}
    onRetry={() => void refresh()}
    toolbar={<>
      <Button id="add-workspace" type="primary" loading={adding} disabled={Boolean(removing) || refreshing} onClick={() => void pickWorkspace()}>
        添加工作空间
      </Button>
      <Button id="create-workspace-agent" onClick={() => openAgentAction('workspace')}>
        让 Agent 创建工作空间
      </Button>
    </>}
    emptyActions={<Space wrap>
      <Button id="empty-add-workspace" type="primary" loading={adding} disabled={Boolean(removing) || refreshing} onClick={() => void pickWorkspace()}>
        添加工作空间
      </Button>
      <Button id="empty-create-workspace" onClick={() => openAgentAction('workspace')}>
        让 Agent 创建工作空间
      </Button>
    </Space>}
  /></>;
}
