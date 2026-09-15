import { workspaceApi } from '../../workspace/api/workspace-api';
import { type ProjectResponse } from '../../project/api/project-api';
import { serviceApi } from '../api/service-api';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Tag } from 'antd';
import { FileTextOutlined, RightOutlined } from '@ant-design/icons';

import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { serviceTypeLabel, workspaceHref } from '../../../lib/labels';
import { useMarkdownDocumentViewer, type MarkdownDocument } from '../../../lib/useMarkdownDocumentViewer';
import { ServiceEditDrawer } from '../components/ServiceEditDrawer';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { WorkspaceStage, type WorkspaceObjectTab } from '../../../components/WorkspaceStage';

type ServiceDetail = ProjectResponse & { revision: string; service: NonNullable<ProjectResponse['service']> };

type ObjTab = { key: string; kind: 'doc'; ref: string };

const serviceDocumentMissingMessage = (path: string) => `服务内未找到 ${path}`;

const DOC_ROWS: { ref: string; name: string; hint: string }[] = [
  { ref: 'readme', name: 'README.md', hint: '产品定位与快速开始' },
  { ref: 'agents', name: 'AGENTS.md', hint: '规则与授权边界' },
];

/** 右组服务文档对象。 */
function ServiceDocObjectView({ projectCode, serviceCode, docPath, title, hint }: { projectCode: string; serviceCode: string; docPath: string; title: string; hint: string }) {
  const fetchDocument = useCallback(async (path: string): Promise<MarkdownDocument> => {
    return serviceApi.serviceDocument(projectCode, serviceCode, encodeProjectDocumentPath(path));
  }, [projectCode, serviceCode]);
  const documents = useMarkdownDocumentViewer(fetchDocument, serviceDocumentMissingMessage);

  useEffect(() => {
    void documents.open(docPath, { pushHistory: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode, serviceCode, docPath]);

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documents.path, linkHref);
    if (!resolved) { documents.setMessage('仅支持打开服务内的 .md 文档链接。'); return; }
    void documents.open(resolved, { pushHistory: true });
  };

  return (
    <>
      <div className="ws-obj-head"><h2>{title}</h2></div>
      <p className="ws-obj-sub">{hint}</p>
      {documents.history.length > 1 ? (
        <div className="project-document-toolbar">
          <button type="button" className="back-link project-document-back" onClick={documents.back}>← 返回上一篇</button>
          <span className="project-document-path">{documents.path}</span>
        </div>
      ) : null}
      {documents.loading ? (
        <p className="page-copy">正在读取…</p>
      ) : documents.document?.exists && documents.document.content != null ? (
        <MarkdownHost
          markdown={documents.document.content}
          className="project-document-content markdown-body"
          options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick }}
        />
      ) : (
        <p className="artifact-missing">{documents.message || `服务根目录未找到 ${documents.path}`}</p>
      )}
    </>
  );
}

export function ServiceDetailPage() {
  const { projectCode = '', serviceCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const pageTabs = useWorkspacePageTabs(workspaceId);
  const [data, setData] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [objects, setObjects] = useState<ObjTab[]>([]);
  const [activeObj, setActiveObj] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, detail] = await Promise.all([
          workspaceApi.read(),
          serviceApi.service(projectCode, serviceCode) as Promise<ServiceDetail>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setWorkspaceName(workspace.workspace.name);
        setBreadcrumbParts([workspace.workspace.name, '项目', detail.project?.name || projectCode, '服务', detail.service.name]);
        setData(detail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '服务不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, serviceCode, setWorkspace, setBreadcrumbParts]);

  useEffect(() => {
    if (!data || !workspaceId) return;
    pageTabs.register({
      key: `svc:${projectCode}/${serviceCode}`,
      kind: 'svc',
      title: data.service.name,
      path: href(`/services/${encodeURIComponent(projectCode)}/${encodeURIComponent(serviceCode)}`),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.service.name, projectCode, serviceCode, workspaceId]);

  const openObject = (tab: ObjTab) => {
    setObjects((current) => current.some((o) => o.key === tab.key) ? current : [...current, tab]);
    setActiveObj(tab.key);
  };
  const closeObject = (key: string) => {
    setObjects((current) => {
      const index = current.findIndex((o) => o.key === key);
      const next = current.filter((o) => o.key !== key);
      if (activeObj === key) setActiveObj(next.length ? next[Math.max(0, index - 1)].key : null);
      return next;
    });
  };

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">服务</p>
          <h1>服务不存在</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link className="ant-btn-link-wrap" to={href('/services')}>返回服务目录</Link>
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
  const objectTabs: WorkspaceObjectTab[] = objects.map((o) => ({
    key: o.key,
    kind: o.kind,
    title: DOC_ROWS.find((d) => d.ref === o.ref)?.name ?? o.ref,
  }));
  const activeTab = objects.find((o) => o.key === activeObj) ?? null;

  return (
    <>
      <WorkspaceStage
        pageTabs={pageTabs.tabs}
        onClosePageTab={pageTabs.close}
        objectTabs={objectTabs}
        activeObject={activeObj}
        onActivateObject={setActiveObj}
        onCloseObject={closeObject}
        objectContent={activeTab ? (
          <ServiceDocObjectView
            key={activeTab.ref}
            projectCode={projectCode}
            serviceCode={serviceCode}
            docPath={activeTab.ref === 'agents' ? 'AGENTS.md' : 'README.md'}
            title={activeTab.ref === 'agents' ? 'AGENTS.md' : 'README.md'}
            hint={activeTab.ref === 'agents' ? '规则与授权边界' : '服务说明与入口'}
          />
        ) : null}
      >
        <section className="ws-hero">
          <div className="ws-hero-top">
            <div>
              <p className="eyebrow">服务 · {data.project?.name || projectCode}</p>
              <h1 id="service-detail-name">{service.name}</h1>
              <p className="ws-hero-code">{service.code}</p>
              <p className="ws-hero-desc" id="service-detail-description">{service.description || '尚未填写服务说明。'}</p>
              <div className="ws-tags-row" style={{ marginTop: 10 }}>
                <Tag color="blue" id="service-detail-type">{serviceTypeLabel(service.type)}</Tag>
                <Tag color="gold">{service.source.type === 'git' ? 'Git' : '本地路径'}</Tag>
              </div>
            </div>
            <Button id="service-edit-button" onClick={() => setEditOpen(true)}>编辑服务</Button>
          </div>
          <div className="ws-stat-band" role="list">
            <div className="ws-stat" role="listitem"><b>2</b><span>服务文档</span></div>
            <div className="ws-stat" role="listitem"><b id="service-detail-project">{data.project?.name || projectCode}</b><span>所属项目</span></div>
          </div>
        </section>

        <div className="ws-stack">
          <section className="panel" aria-label="文档">
            <div className="ws-section-head"><h2>文档 <span className="ws-count">{DOC_ROWS.length} 份</span></h2></div>
            <div className="ws-obj-list">
              {DOC_ROWS.map((doc) => (
                <button
                  key={doc.ref}
                  type="button"
                  className={`ws-obj-row${objects.some((o) => o.key === `doc:${doc.ref}`) ? ' reading' : ''}`}
                  data-doc-row={doc.ref}
                  onClick={() => openObject({ key: `doc:${doc.ref}`, kind: 'doc', ref: doc.ref })}
                >
                  <span className="ws-obj-ico"><FileTextOutlined /></span>
                  <span className="ws-obj-name">{doc.name}</span>
                  <small>{doc.hint}</small>
                  <RightOutlined className="ws-go" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        </div>
        <p className="ws-meta-line">所属工作空间 {workspaceName || '…'}</p>
      </WorkspaceStage>

      <ServiceEditDrawer
        open={editOpen}
        projectCode={editOpen ? projectCode : null}
        serviceCode={editOpen ? serviceCode : null}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          setData((current) => (
            current
              ? { ...current, revision: saved.revision, service: { ...current.service, name: saved.name, description: saved.description, type: saved.type } }
              : current
          ));
          setBreadcrumbParts([workspaceName || '工作空间', '项目', data.project?.name || projectCode, '服务', saved.name]);
          pageTabs.register({
            key: `svc:${projectCode}/${serviceCode}`,
            kind: 'svc',
            title: saved.name,
            path: href(`/services/${encodeURIComponent(projectCode)}/${encodeURIComponent(serviceCode)}`),
          });
        }}
      />
    </>
  );
}
