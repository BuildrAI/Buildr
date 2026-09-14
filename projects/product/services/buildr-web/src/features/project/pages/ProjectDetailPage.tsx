import { workspaceApi } from '../../workspace/api/workspace-api';
import { type ProjectResponse, projectApi } from '../api/project-api';
import { serviceApi } from '../../service/api/service-api';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Tabs, Tag } from 'antd';
import { EditOutlined, FileTextOutlined, RightOutlined, ThunderboltOutlined } from '@ant-design/icons';

import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { serviceTypeLabel, workspaceHref } from '../../../lib/labels';
import { DailyProgressPanel } from '../../project-daily-progress/components/DailyProgressPanel';
import { useMarkdownDocumentViewer, type MarkdownDocument } from '../../../lib/useMarkdownDocumentViewer';
import { ProjectEditDrawer } from '../components/ProjectEditDrawer';
import { ServiceEditDrawer } from '../../service/components/ServiceEditDrawer';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { WorkspaceStage, type WorkspaceObjectTab } from '../../../components/WorkspaceStage';

type ProjectDetail = ProjectResponse & { revision: string; project: NonNullable<ProjectResponse['project']> };
type Service = NonNullable<ProjectResponse['services']>[number];
type ServiceDetail = ProjectResponse & { revision: string; service: NonNullable<ProjectResponse['service']> };

type ObjTab = { key: string; kind: 'svc' | 'doc'; ref: string };

const projectDocumentMissingMessage = (path: string) => `项目内未找到 ${path}`;
const serviceDocumentMissingMessage = (path: string) => `服务内未找到 ${path}`;

const DOC_ROWS: { ref: string; name: string; hint: string }[] = [
  { ref: 'readme', name: 'README.md', hint: '项目治理根与入口' },
  { ref: 'agents', name: 'AGENTS.md', hint: '规则与授权边界' },
  { ref: 'daily', name: '每日演进', hint: '按提交范围生成的四问摘要' },
];

/** 右组服务对象：头部 + 标签 + README/AGENTS 子页签，阅读不离开项目上下文。 */
function ServiceObjectView({ projectCode, serviceCode, onEdit }: { projectCode: string; serviceCode: string; onEdit: () => void }) {
  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState('');
  const [sub, setSub] = useState<'README.md' | 'AGENTS.md'>('README.md');
  const fetchDocument = useCallback(async (docPath: string): Promise<MarkdownDocument> => {
    return serviceApi.serviceDocument(projectCode, serviceCode, encodeProjectDocumentPath(docPath));
  }, [projectCode, serviceCode]);
  const documents = useMarkdownDocumentViewer(fetchDocument, serviceDocumentMissingMessage);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [data, readme] = await Promise.all([
          serviceApi.service(projectCode, serviceCode) as Promise<ServiceDetail>,
          serviceApi.serviceDocument(projectCode, serviceCode, 'README.md') as Promise<MarkdownDocument>,
        ]);
        if (cancelled) return;
        setDetail(data);
        documents.reset(readme);
        setSub('README.md');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '服务不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, serviceCode, documents.reset]);

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documents.path, linkHref);
    if (!resolved) { documents.setMessage('仅支持打开服务内的 .md 文档链接。'); return; }
    void documents.open(resolved, { pushHistory: true });
  };

  if (error) return <p className="page-copy" role="alert">{error}</p>;
  if (!detail) return <p className="page-copy">正在读取…</p>;
  const service = detail.service;
  return (
    <>
      <div className="ws-obj-head">
        <span className="ws-svc-ico" aria-hidden>{service.name.slice(0, 1)}</span>
        <h2>{service.name} <code>{service.code}</code></h2>
        <Button type="text" aria-label="编辑服务" icon={<EditOutlined />} onClick={onEdit} />
      </div>
      <p className="ws-obj-sub">{service.description || '尚未填写服务说明。'}</p>
      <div className="ws-tags-row">
        <Tag color="blue">{serviceTypeLabel(service.type)}</Tag>
        <Tag color="gold">{service.source.type === 'git' ? 'Git' : '本地路径'}</Tag>
      </div>
      <Tabs
        size="small"
        activeKey={sub}
        onChange={(key) => {
          setSub(key as 'README.md' | 'AGENTS.md');
          void documents.open(key, { replaceHistory: true, pushHistory: false });
        }}
        items={[{ key: 'README.md', label: 'README.md' }, { key: 'AGENTS.md', label: 'AGENTS.md' }]}
      />
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

/** 右组项目文档对象。 */
function ProjectDocObjectView({ projectCode, docPath, title, hint }: { projectCode: string; docPath: string; title: string; hint: string }) {
  const fetchDocument = useCallback(async (path: string): Promise<MarkdownDocument> => {
    return projectApi.projectDocument(projectCode, encodeProjectDocumentPath(path));
  }, [projectCode]);
  const documents = useMarkdownDocumentViewer(fetchDocument, projectDocumentMissingMessage);

  useEffect(() => {
    void documents.open(docPath, { pushHistory: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode, docPath]);

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documents.path, linkHref);
    if (!resolved) { documents.setMessage('仅支持打开项目内的 .md 文档链接。'); return; }
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
        <p className="artifact-missing">{documents.message || `项目根目录未找到 ${documents.path}`}</p>
      )}
    </>
  );
}

export function ProjectDetailPage() {
  const { projectCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const pageTabs = useWorkspacePageTabs(workspaceId);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [editServiceCode, setEditServiceCode] = useState<string | null>(null);
  const [serviceRefresh, setServiceRefresh] = useState(0);
  const [objects, setObjects] = useState<ObjTab[]>([]);
  const [activeObj, setActiveObj] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, projectData, servicesData] = await Promise.all([
          workspaceApi.read(),
          projectApi.project(projectCode) as Promise<ProjectDetail>,
          serviceApi.services(projectCode),
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setWorkspaceName(workspace.workspace.name);
        setBreadcrumbParts([workspace.workspace.name, '项目', projectData.project.name]);
        setData(projectData);
        setServices(servicesData.services ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '项目不存在');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, setWorkspace, setBreadcrumbParts]);

  useEffect(() => {
    if (!data || !workspaceId) return;
    pageTabs.register({
      key: `proj:${projectCode}`,
      kind: 'proj',
      title: data.project.name,
      path: href(`/projects/${encodeURIComponent(projectCode)}`),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.project.name, projectCode, workspaceId]);

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

  const objectTitle = (tab: ObjTab): string => {
    if (tab.kind === 'svc') return services.find((s) => s.code === tab.ref)?.name ?? tab.ref;
    return DOC_ROWS.find((d) => d.ref === tab.ref)?.name ?? tab.ref;
  };

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">项目</p>
          <h1>项目不存在</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link className="ant-btn-link-wrap" to={href('/projects')}>返回项目目录</Link>
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
  const objectTabs: WorkspaceObjectTab[] = objects.map((o) => ({ key: o.key, kind: o.kind, title: objectTitle(o) }));
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
          activeTab.kind === 'svc' ? (
            <ServiceObjectView
              key={`${activeTab.ref}:${serviceRefresh}`}
              projectCode={projectCode}
              serviceCode={activeTab.ref}
              onEdit={() => setEditServiceCode(activeTab.ref)}
            />
          ) : activeTab.ref === 'daily' ? (
            <>
              <div className="ws-obj-head"><h2>每日演进</h2></div>
              <p className="ws-obj-sub">按提交范围生成的四问摘要</p>
              <DailyProgressPanel
                projectCode={projectCode}
                workspaceId={workspaceId}
                onAskAgent={() => openAgentAction('daily-progress', { projectCode, date: new Date().toISOString().slice(0, 10) })}
              />
            </>
          ) : (
            <ProjectDocObjectView
              key={activeTab.ref}
              projectCode={projectCode}
              docPath={activeTab.ref === 'agents' ? 'AGENTS.md' : 'README.md'}
              title={activeTab.ref === 'agents' ? 'AGENTS.md' : 'README.md'}
              hint={activeTab.ref === 'agents' ? '规则与授权边界' : '项目治理根与入口'}
            />
          )
        ) : null}
      >
        <section className="ws-hero">
          <div className="ws-hero-top">
            <div>
              <p className="eyebrow">项目</p>
              <h1 id="project-detail-name">{project.name}</h1>
              <p className="ws-hero-desc" id="project-detail-description">{project.description || '尚未填写项目说明。'}</p>
            </div>
            <Button id="project-edit-button" onClick={() => setEditOpen(true)}>编辑项目</Button>
          </div>
          <div className="ws-stat-band" role="list">
            <div className="ws-stat" role="listitem"><b id="project-service-count">{services.length}</b><span>已登记服务</span></div>
            <div className="ws-stat" role="listitem"><b>2</b><span>项目文档</span></div>
          </div>
        </section>

        <div className="ws-stack">
          <section className="panel" aria-label="服务">
            <div className="ws-section-head">
              <h2>服务 <span className="ws-count">{services.length} 个已登记</span></h2>
              <Button size="small" id="project-service-create" onClick={() => openAgentAction('service', { projectCode })}>+ 接入服务</Button>
            </div>
            {services.length === 0 ? (
              <p className="page-copy">还没有服务。服务是该项目的代码仓、应用、模块或可执行资产。</p>
            ) : (
              <div className="ws-svc-grid">
                {services.map((service) => (
                  <button
                    key={service.code}
                    type="button"
                    className={`ws-svc-card${objects.some((o) => o.key === `svc:${service.code}`) ? ' reading' : ''}`}
                    data-service-card={service.code}
                    onClick={() => openObject({ key: `svc:${service.code}`, kind: 'svc', ref: service.code })}
                  >
                    <span className="ws-svc-ico" aria-hidden>{service.name.slice(0, 1)}</span>
                    <span className="ws-svc-main">
                      <span className="ws-nm"><strong>{service.name}</strong><code>{service.code}</code></span>
                      <p>{service.description || ''}</p>
                      <span className="ws-svc-tags">
                        <Tag color="blue">{serviceTypeLabel(service.type)}</Tag>
                        <Tag color="gold">{service.source.type === 'git' ? 'Git' : '本地路径'}</Tag>
                      </span>
                    </span>
                    <RightOutlined className="ws-go" aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </section>

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
                  <span className="ws-obj-ico">{doc.ref === 'daily' ? <ThunderboltOutlined /> : <FileTextOutlined />}</span>
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

      <ProjectEditDrawer
        open={editOpen}
        projectCode={editOpen ? projectCode : null}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          setData((current) => (
            current
              ? { ...current, revision: saved.revision, project: { ...current.project, name: saved.name, description: saved.description } }
              : current
          ));
          setBreadcrumbParts([workspaceName || '工作空间', '项目', saved.name]);
          pageTabs.register({
            key: `proj:${projectCode}`,
            kind: 'proj',
            title: saved.name,
            path: href(`/projects/${encodeURIComponent(projectCode)}`),
          });
        }}
      />
      <ServiceEditDrawer
        open={Boolean(editServiceCode)}
        projectCode={projectCode}
        serviceCode={editServiceCode}
        onClose={() => setEditServiceCode(null)}
        onSaved={(saved) => {
          setServices((current) => current.map((s) => (s.code === saved.code ? { ...s, name: saved.name, description: saved.description, type: saved.type } : s)));
          setServiceRefresh((v) => v + 1);
        }}
      />
    </>
  );
}
