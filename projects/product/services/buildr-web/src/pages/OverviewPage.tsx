import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Descriptions, Space, Spin, Statistic, Typography } from 'antd';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';

type GettingStarted = {
  phase: string;
  completeness?: string;
  diagnostics?: Array<string | { message: string }>;
  projects: unknown[];
  services: unknown[];
  workspace: {
    rootPath: string;
    schemaVersion: string;
    revision: string;
    workspace: { name: string; description?: string };
  };
};

function phaseCopy(data: GettingStarted): [string, string] {
  if (data.phase === 'project-empty') {
    return ['先建立第一个项目', '项目是一个业务、产品、系统或长期工作单元。先告诉 Agent 你要长期管理什么。'];
  }
  if (data.phase === 'service-empty') {
    return ['可以开始工作，服务按需接入', '服务用来登记代码仓、应用、模块或可执行资产。开始工作时再为该任务选择项目；若暂时不需要服务，可以不选。'];
  }
  if (data.phase === 'degraded') {
    return ['有一项真实状态需要处理', '仍会展示可读取的信息；请让 Agent 先完成明确的迁移或修复。'];
  }
  return ['可以开始一项工作', '这里展示整个工作空间。开始时再为这项任务选择项目和可选服务，Agent 会读取适用资产并按项目规则推进。'];
}

export function OverviewPage() {
  const { setWorkspace, openAgentAction, setBreadcrumbParts, workspace, workspaceId } = useAppShell();
  const [data, setData] = useState<GettingStarted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settingsHref = workspaceId ? `/workspaces/${workspaceId}/settings` : '/';
  const projectsHref = workspaceId ? `/workspaces/${workspaceId}/projects` : '/';

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    void (async () => {
      try {
        const next = await api('/api/v1/getting-started') as GettingStarted;
        if (cancelled) return;
        setData(next);
        setWorkspace(next.workspace);
        setBreadcrumbParts([next.workspace.workspace.name, '开始']);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法读取工作空间');
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, setWorkspace, setBreadcrumbParts]);

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">工作空间</p>
          <Typography.Title level={2} style={{ margin: 0 }}>无法读取工作空间</Typography.Title>
        </section>
        <Alert type="error" showIcon message={error} />
      </>
    );
  }

  if (!data) {
    return (
      <div className="page-loading">
        <Spin tip="正在读取真实信息…" />
      </div>
    );
  }

  const [heading, copy] = phaseCopy(data);

  return (
    <>
      <section className="detail-page-header">
        <div>
          <p className="eyebrow">开始使用 Buildr</p>
          <Typography.Title id="overview-title" level={2} style={{ margin: 0 }}>
            {data.workspace.workspace.name}
          </Typography.Title>
          <p id="overview-description" className="page-copy">
            {data.workspace.workspace.description || '这是你和 Agent 共同工作的顶层目录。'}
          </p>
        </div>
        <Link to={settingsHref}>
          <Button>工作空间设置</Button>
        </Link>
      </section>
      <section className="onboarding-panel">
        <p className="eyebrow">工作空间中的项目与服务</p>
        <Typography.Title id="start-heading" level={4} style={{ marginTop: 0 }}>{heading}</Typography.Title>
        <p id="start-copy" className="page-copy">{copy}</p>
        <div id="start-scope" className="scope-summary">
          <span>{`工作空间：${data.workspace.workspace.name}`}</span>
          {data.projects.length > 0 ? <span>{`项目：${data.projects.length} 个已登记`}</span> : null}
          {data.services.length > 0 ? <span>{`服务：${data.services.length} 个可选资产`}</span> : null}
        </div>
        <div id="start-actions" className="actions">
          {data.phase === 'project-empty' ? (
            <Button type="primary" onClick={() => openAgentAction('project')}>
              让 Agent 创建第一个项目
            </Button>
          ) : null}
          {data.phase === 'degraded' ? (
            <Button type="primary" onClick={() => openAgentAction('workspace')}>
              生成修复指令
            </Button>
          ) : null}
          {data.phase !== 'project-empty' && data.phase !== 'degraded' ? (
            <Space wrap>
              <Button type="primary" onClick={() => openAgentAction('start')}>
                用 Agent 开始
              </Button>
              <Link to={projectsHref}><Button>查看项目</Button></Link>
              {data.phase === 'service-empty' ? (
                <Button onClick={() => openAgentAction('service')}>
                  让 Agent 接入服务
                </Button>
              ) : null}
            </Space>
          ) : null}
        </div>
        <div
          id="start-diagnostics"
          className={data.diagnostics?.length ? '' : 'hidden'}
          role="status"
          style={{ marginTop: 12 }}
        >
          {data.diagnostics?.length ? (
            <Alert
              type="info"
              showIcon
              message={(data.diagnostics || []).map((item) => (typeof item === 'string' ? item : item.message)).join(' ')}
            />
          ) : null}
        </div>
      </section>
      <section className="content-grid secondary-summary">
        <article className="panel">
          <p className="eyebrow">当前事实</p>
          <Typography.Title level={4} style={{ marginTop: 0 }}>工作范围摘要</Typography.Title>
          <Space size={48}>
            <Statistic
              title="已登记项目"
              value={data.projects.length}
              formatter={() => <span id="project-count">{String(data.projects.length)}</span>}
            />
            <Statistic
              title="已登记服务"
              value={data.services.length}
              formatter={() => (
                <span id="service-count">
                  {data.completeness === 'partial' ? '部分不可用' : String(data.services.length)}
                </span>
              )}
            />
          </Space>
        </article>
        <aside className="panel facts-panel">
          <p className="eyebrow">技术信息</p>
          <Typography.Title level={4} style={{ marginTop: 0 }}>按需查看</Typography.Title>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="本地目录"><span id="overview-root">{data.workspace.rootPath}</span></Descriptions.Item>
            <Descriptions.Item label="数据格式版本"><span id="overview-schema">{data.workspace.schemaVersion}</span></Descriptions.Item>
            <Descriptions.Item label="修订版本"><span id="overview-revision">{data.workspace.revision}</span></Descriptions.Item>
          </Descriptions>
        </aside>
      </section>
      <span className="hidden">{workspace?.name}</span>
    </>
  );
}
