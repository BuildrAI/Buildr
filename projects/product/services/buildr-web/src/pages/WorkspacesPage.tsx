import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Space, Tag, Typography } from 'antd';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { confirmModal } from '../lib/confirm';
import { workspaceHomePath } from '../lib/labels';

type WorkspaceEntry = {
  status: string;
  rootPath: string;
  updatedAt?: string;
  workspace?: { id: string; name: string; description?: string };
  error?: { message?: string };
};

type Registry = {
  revision: string;
  workspaces: WorkspaceEntry[];
  lastOpenedWorkspaceId?: string;
};

function healthLabel(status: string): string {
  if (status === 'ready') return '可用';
  if (status === 'unavailable') return '路径不可用';
  if (status === 'identity_conflict') return '身份冲突';
  return '需要处理';
}

export function WorkspacesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnCatalog = searchParams.get('catalog') === '1';
  const { openAgentAction, setBreadcrumbParts } = useAppShell();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setBreadcrumbParts(['工作空间']);
  }, [setBreadcrumbParts]);

  const load = useCallback(async () => {
    const next = await api('/api/v1/workspaces') as Registry;
    setRegistry(next);
    return next;
  }, []);

  useEffect(() => {
    void load()
      .then((next) => {
        if (stayOnCatalog) return;
        const ready = (next.workspaces || []).filter(
          (entry) => entry.status === 'ready' && entry.workspace?.id,
        );
        if (ready.length === 1 && ready[0].workspace?.id) {
          navigate(workspaceHomePath(ready[0].workspace.id), { replace: true });
        }
      })
      .catch((error: Error) => setMessage(error.message));
  }, [load, navigate, stayOnCatalog]);

  const removeWorkspace = async (entry: WorkspaceEntry, revision: string) => {
    const ok = await confirmModal({
      title: '移除工作空间',
      content: `只从 Buildr Web 移除“${entry.workspace?.name || entry.rootPath}”，不会删除目录。继续吗？`,
      okText: '移除',
      okButtonProps: { danger: true },
    });
    if (!ok) return;
    await api('/api/v1/workspaces', {
      method: 'DELETE',
      body: JSON.stringify({ revision, rootPath: entry.rootPath }),
    });
    await load();
  };

  const pickWorkspace = async () => {
    if (!registry) return;
    setAdding(true);
    try {
      const result = await api('/api/v1/workspaces/pick', {
        method: 'POST',
        body: JSON.stringify({ revision: registry.revision }),
      }) as {
        canceled?: boolean;
        status?: string;
        registry?: Registry;
        message?: string;
        prompt?: string;
      };
      if (!result.canceled && result.status === 'canonical' && result.registry) {
        setRegistry(result.registry);
        await load();
        if (result.registry.lastOpenedWorkspaceId) {
          navigate(workspaceHomePath(result.registry.lastOpenedWorkspaceId));
        }
      } else if (!result.canceled) {
        setMessage(result.message || '该目录暂时不能登记。');
        if (result.prompt) openAgentAction('workspace-recovery', { prompt: result.prompt });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '添加工作空间失败。');
    } finally {
      setAdding(false);
    }
  };

  const empty = registry !== null && registry.workspaces.length === 0;

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>工作空间</Typography.Title>
          <p className="page-copy">从这里建立工作范围。工作空间是你和 Agent 共同工作的顶层目录；项目表示长期工作单元，服务按需登记代码仓、应用或模块。</p>
        </div>
        <div className="toolbar-actions">
          <Button id="add-workspace" type="primary" loading={adding} onClick={() => void pickWorkspace()}>
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
            <article className="workspace-card" key={entry.rootPath}>
              {ready && entry.workspace?.id ? (
                <Link className="workspace-card-main" to={workspaceHomePath(entry.workspace.id)}>
                  {main}
                </Link>
              ) : (
                <div className="workspace-card-main" aria-disabled="true">
                  {main}
                </div>
              )}
              <Button
                className="workspace-remove"
                size="small"
                type="text"
                danger
                onClick={() => void removeWorkspace(entry, registry!.revision)}
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
              <Button id="empty-add-workspace" type="primary" onClick={() => void pickWorkspace()}>
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
