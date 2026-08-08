import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { serviceTypeLabel, sourceTypeLabel, workspaceHref } from '../lib/labels';

type ServiceDetail = {
  revision: string;
  project?: { name?: string };
  service: {
    id?: string;
    code: string;
    name: string;
    description?: string;
    type: string;
    source: { type: string; path: string; git?: { integrationBranch?: string } };
  };
  observed?: { currentBranch?: string; dirty?: boolean; ahead?: number; behind?: number };
  comparison?: { findings?: Array<{ status?: string; message: string }> };
};

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

export function ServiceDetailPage() {
  const { projectCode = '', serviceCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [data, setData] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, detail] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}`) as Promise<ServiceDetail>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '项目', detail.project?.name || projectCode, '服务', detail.service.name]);
        setData(detail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '服务不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, serviceCode, setWorkspace, setBreadcrumbParts]);

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">服务</p>
          <h1>服务不存在</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link className="button secondary" to={href('/services')}>返回服务目录</Link>
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

  const service = data.service;
  const gitState = data.observed
    ? `${data.observed.dirty ? '有未提交变化' : '干净'} · 领先 ${data.observed.ahead ?? '—'} / 落后 ${data.observed.behind ?? '—'}`
    : '不适用';

  return (
    <>
      <section className="detail-page-header">
        <Link className="back-link" to={href(`/services?project=${encodeURIComponent(projectCode)}`)}>← 返回服务目录</Link>
        <div className="detail-title-row">
          <div>
            <p className="eyebrow">服务</p>
            <h1 id="service-detail-name">{service.name}</h1>
            <p className="page-copy">只读详情</p>
          </div>
          <Link
            id="service-edit-link"
            className="button primary"
            to={href(`/services/${encodeURIComponent(projectCode)}/${encodeURIComponent(serviceCode)}/edit`)}
          >
            编辑服务
          </Link>
        </div>
      </section>
      <section className="detail-facts-section" aria-label="服务详情">
        <dl className="read-facts detail-facts">
          <div><dt>服务代码</dt><dd id="service-code">{service.code}</dd></div>
          <div><dt>服务说明</dt><dd id="service-detail-description">{service.description || '尚未填写服务说明。'}</dd></div>
          <div><dt>所属项目</dt><dd id="service-detail-project">{`${data.project?.name || projectCode}（${projectCode}）`}</dd></div>
          <div><dt>服务类型</dt><dd id="service-detail-type">{serviceTypeLabel(service.type)}</dd></div>
          <div><dt>来源类型</dt><dd id="service-detail-source">{sourceTypeLabel(service.source.type)}</dd></div>
          <div><dt>来源路径</dt><dd id="service-path">{service.source.path}</dd></div>
        </dl>
        <details className="technical-details">
          <summary>技术信息</summary>
          <dl className="read-facts technical-facts">
            <div><dt>服务 ID</dt><dd id="service-id">{service.id || '迁移后生成'}</dd></div>
            <div><dt>项目代码</dt><dd id="service-project-code">{projectCode}</dd></div>
            <div><dt>修订版本</dt><dd id="service-revision">{data.revision}</dd></div>
            <div><dt>集成分支</dt><dd id="service-integration-branch">{service.source.git?.integrationBranch || '不适用'}</dd></div>
            <div>
              <dt>当前分支</dt>
              <dd id="service-current-branch">
                {data.observed?.currentBranch || (service.source.type === 'git' ? '暂时无法读取' : '不适用')}
              </dd>
            </div>
            <div><dt>Git 状态</dt><dd id="service-git-state">{gitState}</dd></div>
          </dl>
          <div id="service-findings" className="findings">
            {(data.comparison?.findings || []).map((finding) => (
              <div key={finding.message} className={`finding ${finding.status || ''}`}>{finding.message}</div>
            ))}
          </div>
        </details>
      </section>
    </>
  );
}
