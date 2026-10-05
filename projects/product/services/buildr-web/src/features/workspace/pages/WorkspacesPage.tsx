import { workspaceApi } from '../api/workspace-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Space, Tag, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { confirmModal } from '../../../lib/confirm';
import { workspaceHomePath } from '../../../lib/labels';


type WorkspaceEntry = (Awaited<ReturnType<typeof workspaceApi.listRegistered>>['workspaces'])[number];
type WorkspaceRegistry = Awaited<ReturnType<typeof workspaceApi.listRegistered>>;

type Options = {
  stayOnCatalog: boolean;
  onOpenWorkspace: (workspaceId: string, replace: boolean) => void;
  onRecoveryPrompt: (prompt: string) => void;
  workspaceRegistryRevision: number;
};

function useWorkspaceCatalog({ stayOnCatalog, onOpenWorkspace, onRecoveryPrompt, workspaceRegistryRevision }: Options) {
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
        if (ready.length === 1 && ready[0].workspace?.id) onOpenWorkspace(ready[0].workspace.id, true);
      })
      .catch((error: Error) => { if (active && mounted.current && readGeneration.current === generation) setFailure(error.message); });
    return () => { active = false; };
  }, [load, onOpenWorkspace, stayOnCatalog, workspaceRegistryRevision]);

  const remove = useCallback(async (entry: WorkspaceEntry) => {
    if (!registry || mutation.current) return;
    mutation.current = true; setRemoving(entry.rootPath); setFailure(''); setMessage(null);
    try {
      const next = await workspaceApi.remove({ revision: registry.revision, rootPath: entry.rootPath });
      if (!mounted.current) return;
      ++readGeneration.current; setRegistry(next);
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
  }, [registry]);

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
  return { registry, message, setMessage, adding, removing, refreshing, failure, setFailure, refresh, remove, pick };
}

function healthLabel(status: string): string {
  if (status === 'ready') return '可用';
  if (status === 'unavailable') return '路径不可用';
  if (status === 'identity_conflict') return '身份冲突';
  return '需要处理';
}

export function WorkspacesPage() {
  const confirming = useRef(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnCatalog = searchParams.get('catalog') === '1';
  const { openAgentAction, setBreadcrumbParts, openWorkspaceSettings, workspaceRegistryRevision } = useAppShell();
  const onOpenWorkspace = useCallback((workspaceId: string, replace: boolean) => {
    navigate(workspaceHomePath(workspaceId), { replace });
  }, [navigate]);
  const onRecoveryPrompt = useCallback((prompt: string) => {
    openAgentAction('workspace-recovery', { prompt });
  }, [openAgentAction]);
  const { registry, message, setMessage, adding, removing, refreshing, failure, setFailure, refresh, remove, pick } = useWorkspaceCatalog({
    stayOnCatalog,
    onOpenWorkspace,
    onRecoveryPrompt,
    workspaceRegistryRevision,
  });

  useEffect(() => {
    setBreadcrumbParts(['工作空间']);
  }, [setBreadcrumbParts]);

  const removeWorkspace = async (entry: WorkspaceEntry) => {
    if (confirming.current || adding || removing || refreshing) return;
    confirming.current = true;
    try {
      const ok = await confirmModal({
        title: '移除工作空间',
        content: `只从 Buildr Web 移除“${entry.workspace?.name || entry.rootPath}”，不会删除目录。继续吗？`,
        okText: '移除',
        okButtonProps: { danger: true },
      });
      if (!ok) return;
      await remove(entry);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '移除尚未执行，请重试。');
    } finally { confirming.current = false; }
  };

  const pickWorkspace = () => pick();

  const empty = registry !== null && registry.workspaces.length === 0;

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>工作空间</Typography.Title>
          <p className="page-copy">从这里建立工作范围。工作空间是你和 Agent 共同工作的顶层目录；项目表示长期工作单元，服务按需登记代码仓、应用或模块。</p>
        </div>
        <div className="toolbar-actions">
          <Button id="add-workspace" type="primary" loading={adding} disabled={Boolean(removing) || refreshing} onClick={() => void pickWorkspace()}>
            添加已有工作空间
          </Button>
          <Button id="create-workspace-agent" onClick={() => openAgentAction('workspace')}>
            让 Agent 创建工作空间
          </Button>
        </div>
      </section>
      <div id="workspace-global-message" className={message ? '' : 'hidden'} role="status">
        {message ? <Alert type="info" showIcon message={message} style={{ marginBottom: 16 }} /> : null}
      </div>
      {failure && <Alert id="workspace-operation-error" type="error" showIcon message={failure}
        action={<Button size="small" loading={refreshing} disabled={adding || Boolean(removing)} onClick={() => void refresh()}>重新读取登记</Button>} />}
      {removing && <p role="status">正在移除工作空间登记…</p>}
      <section id="workspace-grid" className="workspace-grid" aria-label="已登记工作空间">
        {(registry?.workspaces || []).map((entry) => {
          const ready = entry.status === 'ready';
          const main = (
            <>
              <div className="workspace-card-heading">
                <Tag color={ready ? 'success' : 'warning'}>{healthLabel(entry.status)}</Tag>
                <span className="workspace-health">
                  {entry.updatedAt ? `最近登记 ${new Date(entry.updatedAt).toLocaleDateString('zh-CN')}` : '本机登记'}
                </span>
              </div>
              <h2>{entry.workspace?.name || '不可用的工作空间'}</h2>
              <p className="workspace-description">{entry.workspace?.description || entry.error?.message || '无法读取工作空间信息。'}</p>
              <p className="mono workspace-root">{entry.rootPath}</p>
              <span className="workspace-open-label">
                进入工作空间
                {' '}
                <span aria-hidden="true">→</span>
              </span>
            </>
          );
          return (
            <article className={`workspace-card${ready && entry.workspace?.id ? ' has-settings' : ''}`} key={entry.rootPath} data-workspace-id={entry.workspace?.id}>
              {ready && entry.workspace?.id ? (
                <Link className="workspace-card-main" to={workspaceHomePath(entry.workspace.id)}>
                  {main}
                </Link>
              ) : (
                <div className="workspace-card-main" aria-disabled="true">
                  {main}
                </div>
              )}
              {ready && entry.workspace?.id ? <Button
                className="workspace-card-settings" type="text" icon={<SettingOutlined />}
                aria-label={`设置工作空间：${entry.workspace.name}`} title="工作空间设置"
                onClick={() => openWorkspaceSettings(entry.workspace!.id)}
              /> : null}
              <Button
                className="workspace-remove"
                size="small"
                type="text"
                danger
                loading={removing === entry.rootPath}
                disabled={adding || refreshing || Boolean(removing && removing !== entry.rootPath)}
                onClick={() => void removeWorkspace(entry)}
              >
                移除
              </Button>
            </article>
          );
        })}
      </section>
      <section id="workspace-empty" className={`empty-state${empty ? '' : ' hidden'}`}>
        {empty ? (
          <Empty
            description={(
              <Space direction="vertical" size={8}>
                <p className="eyebrow">工作空间 → 项目 → 服务</p>
                <Typography.Title level={4} style={{ margin: 0 }}>先选择一个共同工作的目录</Typography.Title>
                <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                  添加已有工作空间只保存本机入口：不会移动目录、修改源资产或自动扫描磁盘。进入后，Buildr 会再引导你建立项目，并按需接入服务。
                </Typography.Paragraph>
              </Space>
            )}
          >
            <Space wrap>
              <Button id="empty-add-workspace" type="primary" loading={adding} disabled={Boolean(removing) || refreshing} onClick={() => void pickWorkspace()}>
                添加已有工作空间
              </Button>
              <Button id="empty-create-workspace" onClick={() => openAgentAction('workspace')}>
                让 Agent 创建工作空间
              </Button>
              <Button
                id="empty-later"
                type="link"
                onClick={() => setMessage('没有登记任何工作空间。你可以直接退出 Buildr，稍后再次打开。')}
              >
                稍后处理
              </Button>
            </Space>
          </Empty>
        ) : null}
      </section>
    </>
  );
}
