import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { workspaceHref } from '../lib/labels';

type ProjectDetail = {
  revision: string;
  migrationRequired?: boolean;
  project: {
    id?: string;
    workspaceId?: string;
    code: string;
    name: string;
    description?: string;
    source: { type: string; path: string; git?: { integrationBranch?: string } };
  };
  observed?: { currentBranch?: string; dirty?: boolean; ahead?: number; behind?: number };
  comparison?: { findings?: Array<{ status?: string; message: string }> };
};

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

export function ProjectDetailPage() {
  const { projectCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [serviceCount, setServiceCount] = useState('—');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, projectData, servicesData] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}`) as Promise<ProjectDetail>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services`) as Promise<{ services: unknown[] }>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '项目', projectData.project.name]);
        setData(projectData);
        setServiceCount(`${servicesData.services.length} 个已登记服务`);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '项目不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, setWorkspace, setBreadcrumbParts]);

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">项目</p>
          <h1>项目不存在</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link className="button secondary" to={href('/projects')}>返回项目目录</Link>
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

  const project = data.project;
  const sourceType = project.source.type === 'git'
    ? 'Git 仓库'
    : project.source.type === 'workspace'
      ? '当前工作空间'
      : '本地路径';
  const gitState = data.observed
    ? `${data.observed.dirty ? '有未提交变化' : '干净'} · 领先 ${data.observed.ahead ?? '—'} / 落后 ${data.observed.behind ?? '—'}`
    : '不适用';

  return (
    <>
      <section className="detail-page-header">
        <Link className="back-link" to={href('/projects')}>← 返回项目目录</Link>
        <div className="detail-title-row">
          <div>
            <p className="eyebrow">项目</p>
            <h1 id="project-detail-name">{project.name}</h1>
            <p className="page-copy">只读详情</p>
          </div>
          <Link id="project-edit-link" className="button primary" to={href(`/projects/${encodeURIComponent(projectCode)}/edit`)}>
            编辑项目
          </Link>
        </div>
      </section>
      <section className="detail-facts-section" aria-label="项目详情">
        <dl className="read-facts detail-facts">
          <div><dt>项目代码</dt><dd id="project-detail-code">{project.code}</dd></div>
          <div><dt>项目说明</dt><dd id="project-detail-description">{project.description || '尚未填写项目说明。'}</dd></div>
          <div><dt>来源类型</dt><dd id="project-source-type">{sourceType}</dd></div>
          <div><dt>来源路径</dt><dd id="project-source-path">{project.source.path}</dd></div>
          <div><dt>服务登记</dt><dd id="project-service-summary">{serviceCount}</dd></div>
        </dl>
        <details className="technical-details">
          <summary>技术信息</summary>
          <dl className="read-facts technical-facts">
            <div><dt>项目 ID</dt><dd id="project-id">{project.id || '迁移后生成'}</dd></div>
            <div><dt>工作空间 ID</dt><dd id="project-workspace-id">{project.workspaceId || '迁移后写入'}</dd></div>
            <div><dt>修订版本</dt><dd id="project-revision">{data.revision}</dd></div>
            <div><dt>集成分支</dt><dd id="project-integration-branch">{project.source.git?.integrationBranch || '不适用'}</dd></div>
            <div>
              <dt>当前分支</dt>
              <dd id="project-current-branch">
                {data.observed?.currentBranch || (project.source.type === 'git' ? '暂时无法读取' : '不适用')}
              </dd>
            </div>
            <div><dt>Git 状态</dt><dd id="project-git-state">{gitState}</dd></div>
          </dl>
          <div id="project-findings" className="findings">
            {(data.comparison?.findings || []).map((finding) => (
              <div key={finding.message} className={`finding ${finding.status || ''}`}>{finding.message}</div>
            ))}
          </div>
        </details>
      </section>
    </>
  );
}
