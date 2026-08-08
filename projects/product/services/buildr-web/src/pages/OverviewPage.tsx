import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
          <h1>无法读取工作空间</h1>
        </section>
        <div className="alert error" role="alert">{error}</div>
      </>
    );
  }

  if (!data) {
    return (
      <div className="page-loading">
        <span className="loader" />
        <p>正在读取真实信息…</p>
      </div>
    );
  }

  const [heading, copy] = phaseCopy(data);

  return (
    <>
      <section className="detail-page-header">
        <div>
          <p className="eyebrow">开始使用 Buildr</p>
          <h1 id="overview-title">{data.workspace.workspace.name}</h1>
          <p id="overview-description" className="page-copy">
            {data.workspace.workspace.description || '这是你和 Agent 共同工作的顶层目录。'}
          </p>
        </div>
        <Link className="button secondary" to={settingsHref}>工作空间设置</Link>
      </section>
      <section className="onboarding-panel">
        <p className="eyebrow">工作空间中的项目与服务</p>
        <h2 id="start-heading">{heading}</h2>
        <p id="start-copy" className="page-copy">{copy}</p>
        <div id="start-scope" className="scope-summary">
          <span>{`工作空间：${data.workspace.workspace.name}`}</span>
          {data.projects.length > 0 ? <span>{`项目：${data.projects.length} 个已登记`}</span> : null}
          {data.services.length > 0 ? <span>{`服务：${data.services.length} 个可选资产`}</span> : null}
        </div>
        <div id="start-actions" className="actions">
          {data.phase === 'project-empty' ? (
            <button className="button primary" type="button" onClick={() => openAgentAction('project')}>
              让 Agent 创建第一个项目
            </button>
          ) : null}
          {data.phase === 'degraded' ? (
            <button className="button primary" type="button" onClick={() => openAgentAction('workspace')}>
              生成修复指令
            </button>
          ) : null}
          {data.phase !== 'project-empty' && data.phase !== 'degraded' ? (
            <>
              <button className="button primary" type="button" onClick={() => openAgentAction('start')}>
                用 Agent 开始
              </button>
              <Link className="button secondary" to={projectsHref}>查看项目</Link>
              {data.phase === 'service-empty' ? (
                <button className="button secondary" type="button" onClick={() => openAgentAction('service')}>
                  让 Agent 接入服务
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <div
          id="start-diagnostics"
          className={`alert${data.diagnostics?.length ? '' : ' hidden'}`}
          role="status"
        >
          {(data.diagnostics || []).map((item) => (typeof item === 'string' ? item : item.message)).join(' ')}
        </div>
      </section>
      <section className="content-grid secondary-summary">
        <article className="panel">
          <p className="eyebrow">当前事实</p>
          <h2>工作范围摘要</h2>
          <dl className="fact-list">
            <div>
              <dt>已登记项目</dt>
              <dd id="project-count">{String(data.projects.length)}</dd>
            </div>
            <div>
              <dt>已登记服务</dt>
              <dd id="service-count">{data.completeness === 'partial' ? '部分不可用' : String(data.services.length)}</dd>
            </div>
          </dl>
        </article>
        <aside className="panel facts-panel">
          <p className="eyebrow">技术信息</p>
          <h2>按需查看</h2>
          <dl className="fact-list">
            <div>
              <dt>本地目录</dt>
              <dd id="overview-root">{data.workspace.rootPath}</dd>
            </div>
            <div>
              <dt>数据格式版本</dt>
              <dd id="overview-schema">{data.workspace.schemaVersion}</dd>
            </div>
            <div>
              <dt>修订版本</dt>
              <dd id="overview-revision">{data.workspace.revision}</dd>
            </div>
          </dl>
        </aside>
      </section>
      {/* keep shell name in sync when remounting */}
      <span className="hidden">{workspace?.name}</span>
    </>
  );
}
